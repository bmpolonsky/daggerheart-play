/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PlayerViewModel, PlayerViewToken } from '../../../domain/tabletop/playerView';
import { p2pSessionService, sceneTableService, tabletopService } from '../../../services/serviceRegistry';
import { cssImageUrl, initials, shouldIgnoreTokenDeleteShortcut } from './helpers';
import { PLAYER_SCENE_HEIGHT, PLAYER_SCENE_WIDTH } from './constants';
import { PlayerMeasureLayer } from './PlayerMeasureLayer';
import { PlayerDiceOverlay } from './PlayerDiceOverlay';
import type { PlayerViewedActor, TableViewRole } from './types';
import type { RollLogEntry } from '../../../domain/rules/types';
import { ActorStatus, normalizeStatusTag, statusLabel } from '../../../domain/rules/statuses';

export function PlayerScene({
  latestRoll,
  diceAnimationReady,
  model,
  role,
  onOpenActor,
  onRollComplete
}: {
  latestRoll: RollLogEntry | undefined;
  diceAnimationReady?: boolean;
  model: PlayerViewModel;
  role: TableViewRole;
  onOpenActor: (actor: PlayerViewedActor) => void;
  onRollComplete: (rollId: string) => void;
}) {
  const dragRef = useRef<{ tokenId: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClickTokenIdRef = useRef<string | null>(null);
  const playerTokenIds = useMemo(() => playerTokensForCharacter(model.tokens, model.character?.id ?? null).map((token) => token.id), [model.character?.id, model.tokens]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const selectedPlayerTokenId = role === 'gm'
    ? selectedTokenId
    : selectedTokenId && playerTokenIds.includes(selectedTokenId) ? selectedTokenId : null;
  const selectedOrigin = selectedPlayerTokenId ? model.tokens.find((token) => token.id === selectedPlayerTokenId) ?? null : null;

  useEffect(() => {
    if (role === 'gm') return;
    if (!selectedTokenId || playerTokenIds.includes(selectedTokenId)) return;
    setSelectedTokenId(null);
  }, [playerTokenIds, role, selectedTokenId]);

  useEffect(() => {
    if (role !== 'gm' || !selectedPlayerTokenId || typeof window === 'undefined') return;
    const removeSelectedToken = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (shouldIgnoreTokenDeleteShortcut(event.target)) return;
      const removed = tabletopService.removeTokenFromScene(selectedPlayerTokenId, model.scene.id);
      if (!removed) return;
      event.preventDefault();
      setSelectedTokenId(null);
    };
    window.addEventListener('keydown', removeSelectedToken);
    return () => window.removeEventListener('keydown', removeSelectedToken);
  }, [model.scene.id, role, selectedPlayerTokenId]);

  return (
    <section className="player-scene-stage" aria-label="Игровая сцена">
      <div
        className="player-scene-stage__board"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setSelectedTokenId(null);
        }}
      >
        <PlayerMeasureLayer origin={selectedOrigin} />
        <PlayerDiceOverlay latestRoll={latestRoll} animationReady={diceAnimationReady} onRollComplete={onRollComplete} />
        {model.tokens.map((token) => {
          const canControlToken = role === 'gm' || playerTokenIds.includes(token.id);
          const defeatedLabel = statusLabel(ActorStatus.Defeated);
          const hasDefeatedStatus = token.statuses?.some((status) => normalizeStatusTag(status) === ActorStatus.Defeated) ?? false;
          const tokenTitle = hasDefeatedStatus ? `${token.name}: ${defeatedLabel.toLowerCase()}` : token.name;
          return (
            <button
              aria-label={tokenTitle}
              aria-pressed={canControlToken ? token.id === selectedPlayerTokenId : undefined}
              className={`player-token player-token--${token.kind} ${canControlToken ? 'dh-is-player-origin' : ''} ${token.id === selectedPlayerTokenId ? 'dh-is-selected' : ''} ${token.hidden ? 'dh-is-hidden' : ''} ${token.visibility === 'gm' ? 'dh-is-gm-only' : ''} ${hasDefeatedStatus ? 'dh-is-defeated' : ''}`}
              key={token.id}
              tabIndex={canControlToken ? 0 : -1}
              title={tokenTitle}
              type="button"
              onClick={(event) => {
                if (suppressClickTokenIdRef.current === token.id) {
                  suppressClickTokenIdRef.current = null;
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                if (canControlToken) setSelectedTokenId(token.id);
                if (role === 'gm' || canControlToken) {
                  onOpenActor({
                    kind: token.kind === 'companion' ? 'character' : token.kind,
                    actorId: token.actorId
                  });
                }
              }}
              onPointerDown={(event) => {
                if (!canControlToken) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setSelectedTokenId(token.id);
                dragRef.current = { tokenId: token.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.tokenId !== token.id || drag.pointerId !== event.pointerId) return;
                event.preventDefault();
                if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) {
                  drag.moved = true;
                }
                movePlayerTokenFromPointer(event, model.scene.id, token.id, role === 'gm' ? null : model.character?.id ?? null, role === 'gm');
              }}
              onPointerUp={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.tokenId !== token.id || drag.pointerId !== event.pointerId) return;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                dragRef.current = null;
                if (drag.moved) {
                  suppressClickTokenIdRef.current = token.id;
                  if (typeof window !== 'undefined') {
                    window.setTimeout(() => {
                      if (suppressClickTokenIdRef.current === token.id) suppressClickTokenIdRef.current = null;
                    }, 350);
                  }
                }
                if (drag.moved && role === 'player' && model.character?.id) {
                  const point = worldPointFromPointer(event);
                  if (point) {
                    void p2pSessionService.publishPlayerTokenMove({
                      sceneId: model.scene.id,
                      tokenId: token.id,
                      actorId: model.character.id,
                      x: point.x,
                      y: point.y
                    });
                  }
                }
              }}
              onPointerCancel={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.tokenId !== token.id || drag.pointerId !== event.pointerId) return;
                dragRef.current = null;
              }}
              style={{
                left: `${(token.x / PLAYER_SCENE_WIDTH) * 100}%`,
                top: `${(token.y / PLAYER_SCENE_HEIGHT) * 100}%`,
                width: `${(Math.max(54, token.width) / PLAYER_SCENE_WIDTH) * 100}%`,
                height: `${(Math.max(54, token.height) / PLAYER_SCENE_HEIGHT) * 100}%`,
                '--token-aura': token.aura ?? (
                  token.kind === 'character' || token.kind === 'companion'
                    ? 'rgba(240, 201, 106, 0.54)'
                    : 'rgba(231, 89, 83, 0.48)'
                )
              } as JSX.CSSProperties}
            >
              {token.imageUrl ? <img src={cssImageUrl(token.imageUrl)} alt="" draggable={false} onDragStart={(event) => event.preventDefault()} /> : <span>{initials(token.name)}</span>}
              <footer className={token.subtitle ? '' : 'player-token__label--compact'}>
                <strong>{token.name}</strong>
                {hasDefeatedStatus ? <small>{defeatedLabel}</small> : token.subtitle && <small>{token.subtitle}</small>}
              </footer>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function playerTokensForCharacter(tokens: PlayerViewToken[], characterId: string | null): PlayerViewToken[] {
  if (!characterId) return [];
  return tokens.filter((token) => (
    (token.kind === 'character' || token.kind === 'companion') &&
    token.actorId === characterId
  ));
}

function movePlayerTokenFromPointer(event: { clientX: number; clientY: number; currentTarget: EventTarget | null }, sceneId: string, tokenId: string, actorId: string | null, allowRestricted = false): void {
  if (!actorId && !allowRestricted) return;
  const point = worldPointFromPointer(event);
  if (!point) return;
  sceneTableService.moveTokenInScene(sceneId, tokenId, point.x, point.y, actorId, allowRestricted);
}

function worldPointFromPointer(event: { clientX: number; clientY: number; currentTarget: EventTarget | null }): { x: number; y: number } | null {
  const host = event.currentTarget instanceof HTMLElement
    ? event.currentTarget.closest('.player-scene-stage__board')
    : null;
  if (!(host instanceof HTMLElement)) return null;
  const rect = host.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * PLAYER_SCENE_WIDTH,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * PLAYER_SCENE_HEIGHT
  };
}
