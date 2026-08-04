/** @jsxImportSource preact */
import { useCallback } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { diceService, gameService, mediaCallService, p2pSessionService, playerActivationQueueService } from '../../../services/serviceRegistry';
import { MiniDiceLauncher } from '../MiniDiceLauncher';
import type { TableViewRole } from './types';

type DisplayedActor = { id: string; name: string; kind: 'character' | 'adversary' | 'environment' } | null;
type ActiveCharacterActor = { id: string; name: string } | null;

interface PlayerActionDockProps {
  activeCharacterActor: ActiveCharacterActor;
  activeCharacterName: string;
  displayedActor: DisplayedActor;
  displayedActorName: string;
  displayedCharacter: PlayerViewCharacterSummary | null;
  role: TableViewRole;
  onRosterOpen?: () => void;
  selectedPlayerName?: string;
  selectedPlayerSeatId: string | null;
}

export function PlayerActionDock({
  activeCharacterActor,
  activeCharacterName,
  displayedActor,
  displayedActorName,
  displayedCharacter,
  role,
  onRosterOpen,
  selectedPlayerName,
  selectedPlayerSeatId
}: PlayerActionDockProps) {
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
    <MiniDiceLauncher
      actorName={displayedActorName}
      selectedActorKind={displayedActor?.kind === 'environment' ? null : displayedActor?.kind ?? null}
      role={role}
      callState={callState}
      activationRaised={Boolean(displayedCharacter?.id && localActivation.raised && localActivation.actorId === displayedCharacter.id)}
      activationRequestCount={role === 'gm' ? activationQueue.length : 0}
      canRequestActivation={Boolean(role === 'player' && p2pSession.connected && displayedCharacter?.id)}
      rollPending={role === 'player' && p2pSession.rollPending}
      rollDisabled={role === 'player' && p2pSession.status !== 'connected'}
      onActivationToggle={toggleActivationRequest}
      onCallJoin={() => void mediaCallService.joinWithoutDevices()}
      onRosterOpen={onRosterOpen}
      onRoll={(formula, label, publication, options) => {
        if (role === 'player' && p2pSessionService.isConnectedPlayerSession() && displayedActor?.id) {
          void p2pSessionService.submitPlayerRollIntent({
            actorId: displayedActor.id,
            actorName: displayedActorName,
            publication,
            intent: {
              type: 'manualDice',
              formula,
              label,
              advantageCount: options?.advantageCount,
              disadvantageCount: options?.disadvantageCount,
              diceTones: options?.diceTones
            }
          });
          return;
        }
        diceService.rollManualDice({
          formula,
          label,
          actorId: displayedActor?.id,
          actorName: displayedActorName,
          publication,
          advantageCount: options?.advantageCount,
          disadvantageCount: options?.disadvantageCount,
          diceTones: options?.diceTones
        });
      }}
      onDualityRoll={({ rollType, trait, options, publication }) => {
        if (role === 'player' && p2pSessionService.isConnectedPlayerSession() && activeCharacterActor?.id) {
          void p2pSessionService.submitPlayerRollIntent({
            actorId: activeCharacterActor.id,
            actorName: activeCharacterName,
            publication,
            intent: {
              type: 'duality',
              rollType,
              trait: trait ?? null,
              difficulty: 0,
              ...options
            }
          });
          return;
        }
        const rollRequest = {
          actorId: activeCharacterActor?.id,
          actorName: activeCharacterName,
          trait: trait ?? null,
          difficulty: 0,
          ...options,
          publication
        };
        if (rollType === 'reaction') {
          diceService.rollReaction(rollRequest);
        } else {
          diceService.rollAction({
            ...rollRequest,
            applyConsequences: gameService.game$.get().autoApplyRollConsequences
          });
        }
      }}
    />
  );
}
