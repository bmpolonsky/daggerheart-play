/** @jsxImportSource preact */
import { useCallback, useEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { diceService, gameService, mediaCallService, p2pSessionService, playerActivationQueueService } from '../../../services/serviceRegistry';
import { resolveRollActor, type RollActorOption } from '../../../domain/tabletop/rollActorContext';
import { CharacterRollService } from '../../../services/CharacterRollService';
import { UnifiedRollComposer } from './UnifiedRollComposer';
import { unifiedRollDraftService } from '../../../services/UnifiedRollDraftService';
import { gameStore } from '../../../stores/gameStores';
import { MiniDiceLauncher } from '../MiniDiceLauncher';
import type { PlayerRollDraft, TableViewRole } from './types';

const rollService = new CharacterRollService({ dice: diceService, session: p2pSessionService, autoApplyConsequences: () => gameService.game$.get().autoApplyRollConsequences });

interface PlayerActionDockProps {
  actorOptions: RollActorOption[];
  rollCharacters: Record<string, PlayerViewCharacterSummary>;
  displayedCharacter: PlayerViewCharacterSummary | null;
  role: TableViewRole;
  onRosterOpen?: () => void;
  selectedPlayerName?: string;
  selectedPlayerSeatId: string | null;
}

export function PlayerActionDock({
  actorOptions,
  rollCharacters,
  displayedCharacter,
  role,
  onRosterOpen,
  selectedPlayerName,
  selectedPlayerSeatId
}: PlayerActionDockProps) {
  const [selectedActorKey, setSelectedActorKey] = useState<string | null>(null);
  const draftState = useStream(unifiedRollDraftService.state$);
  const game = useStream(gameStore.toStream());
  const actingActor = resolveRollActor(actorOptions, selectedActorKey, role);
  useEffect(() => {
    if (selectedActorKey && (role !== 'gm' || !actorOptions.some((actor) => actor.key === selectedActorKey))) setSelectedActorKey(null);
  }, [actorOptions, selectedActorKey, role]);
  const actingCharacter = actingActor.kind === 'character' && actingActor.id ? rollCharacters[actingActor.id] : null;

  const callState = useStream(mediaCallService.call$);
  const localActivation = useStream(playerActivationQueueService.local$);
  const activationQueue = useStream(playerActivationQueueService.queue$);
  const p2pSession = useStream(p2pSessionService.session$);
  useEffect(() => unifiedRollDraftService.setScopeProvider(() => JSON.stringify([gameStore.get().id, p2pSessionService.session$.get().roomId, p2pSessionService.session$.get().peerId, role])), [game.id, p2pSession.roomId, p2pSession.peerId, role]);

  const toggleActivationRequest = useCallback(() => {
    if (role !== 'player' || !displayedCharacter?.id) return;
    const requesterId = p2pSession.peerId ?? selectedPlayerSeatId ?? displayedCharacter.id;
    if (localActivation.raised && localActivation.actorId === displayedCharacter.id) {
      void p2pSessionService.lowerHand({
        requesterId,
        actorId: displayedCharacter.id
      });
      return;
    }
    void p2pSessionService.raiseHand({
      requesterId,
      requesterName: selectedPlayerName ?? displayedCharacter.name,
      actorId: displayedCharacter.id,
      actorName: displayedCharacter.name
    });
  }, [displayedCharacter?.id, displayedCharacter?.name, localActivation.actorId, localActivation.raised, p2pSession.peerId, role, selectedPlayerName, selectedPlayerSeatId]);

  return (
    <>
    <MiniDiceLauncher
      actorName={draftState.draft?.actor.name ?? actingActor.name}
      selectedActorKind={actingActor.kind === 'character' || actingActor.kind === 'adversary' ? actingActor.kind : null}
      openRequest={draftState.openRequest}
      onOpenTray={() => {
        if (unifiedRollDraftService.state$.get().draft) return;
        unifiedRollDraftService.request({ actor: actingActor, mode: actingCharacter ? 'action' : 'manual', title: actingCharacter ? 'Проверка персонажа' : 'Кости',
          formula: actingCharacter ? '2d12' : '1d20', trait: actingCharacter?.spellcastTrait ?? 'agility' });
      }}
      composer={<UnifiedRollComposer role={role} actorOptions={actorOptions} rollCharacters={rollCharacters}
        rollPending={role === 'player' && p2pSession.rollPending} rollDisabled={role === 'player' && p2pSession.status !== 'connected'} />}
      role={role}
      callState={callState}
      callAvailable={p2pSession.connected}
      activationRaised={Boolean(displayedCharacter?.id && localActivation.raised && localActivation.actorId === displayedCharacter.id)}
      activationRequestCount={role === 'gm' ? activationQueue.length : 0}
      canRequestActivation={Boolean(role === 'player' && p2pSession.connected && displayedCharacter?.id)}
      rollPending={role === 'player' && p2pSession.rollPending}
      rollDisabled={role === 'player' && p2pSession.status !== 'connected'}
      onActivationToggle={toggleActivationRequest}
      onCallJoin={() => void mediaCallService.joinWithoutDevices()}
      onRosterOpen={onRosterOpen}
      onRoll={(formula, label, publication = 'public', options) => {
        rollService.manual(actingActor, { formula, label, ...options }, publication, role);
      }}
      onDualityRoll={({ rollType, trait, options, publication = 'public' }) => {
        rollService.action(actingActor, { kind: 'trait', title: 'Дуальность', trait }, options, rollType, publication, role);
      }}
    />
    </>
  );
}
