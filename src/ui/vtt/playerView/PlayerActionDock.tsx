/** @jsxImportSource preact */
import { useCallback, useEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { diceService, gameService, mediaCallService, p2pSessionService, playerActivationQueueService } from '../../../services/serviceRegistry';
import { resolveRollActor, type RollActorOption } from '../../../domain/tabletop/rollActorContext';
import { CharacterRollService } from '../../../services/CharacterRollService';
import { SelectField } from '../../components/common';
import { CharacterRollDialog } from './CharacterRollDialog';
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
  const [rollDraftState, setRollDraftState] = useState<{ actorId: string; draft: PlayerRollDraft } | null>(null);
  const actingActor = resolveRollActor(actorOptions, selectedActorKey, role);
  useEffect(() => {
    if (selectedActorKey && (role !== 'gm' || !actorOptions.some((actor) => actor.key === selectedActorKey))) setSelectedActorKey(null);
  }, [actorOptions, selectedActorKey, role]);
  const actingCharacter = actingActor.kind === 'character' && actingActor.id ? rollCharacters[actingActor.id] : null;
  const draftCharacter = rollDraftState && actorOptions.some((actor) => actor.kind === 'character' && actor.id === rollDraftState.actorId)
    ? rollCharacters[rollDraftState.actorId] : null;
  const callState = useStream(mediaCallService.call$);
  const localActivation = useStream(playerActivationQueueService.local$);
  const activationQueue = useStream(playerActivationQueueService.queue$);
  const p2pSession = useStream(p2pSessionService.session$);

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
    {rollDraftState && draftCharacter && <CharacterRollDialog
      character={draftCharacter}
      draft={rollDraftState.draft}
      role={role}
      onTraitChange={(trait) => setRollDraftState((current) => current ? { ...current, draft: { ...current.draft, trait } } : current)}
      onClose={() => setRollDraftState(null)}
    />}
    <MiniDiceLauncher
      actorName={actingActor.name}
      selectedActorKind={actingActor.kind === 'character' || actingActor.kind === 'adversary' ? actingActor.kind : null}
      actorControl={<SelectField label="От лица" value={actingActor.key} onChange={(event) => setSelectedActorKey(event.currentTarget.value)}>
        {actorOptions.map((actor) => <option key={actor.key} value={actor.key}>{actor.name}{actor.kind === 'gm' ? ' (без персонажа)' : ''}</option>)}
      </SelectField>}
      onOpenCharacterRoll={actingCharacter ? () => setRollDraftState({ actorId: actingCharacter.id, draft: {
        kind: 'trait', title: 'Проверка персонажа', subtitle: actingCharacter.name,
        trait: actingCharacter.spellcastTrait ?? actingCharacter.traits[0]?.id ?? 'agility'
      } }) : undefined}
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
