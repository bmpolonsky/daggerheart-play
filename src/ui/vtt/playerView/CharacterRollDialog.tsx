/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { CharacterRollService, type PreparedDiceRoll, type RollActor } from '../../../services/CharacterRollService';
import { diceService, gameService, p2pSessionService } from '../../../services/serviceRegistry';
import { Button, Checkbox } from '../../components/common';
import { PlayerRollConfirm } from './PlayerRollConfirm';
import { PlayerContextPanel } from './PlayerContextPanel';
import { RollPrivateToggle } from './RollConfirmControls';
import { usePrivateRollPreference } from './rollPrivacyPreference';
import type { PlayerRollDraft, TableViewRole } from './types';

const characterRollService = new CharacterRollService({
  dice: diceService,
  session: p2pSessionService,
  autoApplyConsequences: () => gameService.game$.get().autoApplyRollConsequences
});

export function CharacterRollDialog({ character, draft, role, embedded = false, onTraitChange, onClose }: {
  character: PlayerViewCharacterSummary;
  draft: PlayerRollDraft;
  role: TableViewRole;
  embedded?: boolean;
  onTraitChange: (trait: PlayerRollDraft['trait']) => void;
  onClose: () => void;
}) {
  const companion = draft.kind === 'companion';
  const actor = { id: character.id, name: companion ? character.companion?.name ?? character.name : character.name };
  return <PlayerRollConfirm
    character={character}
    draft={draft}
    embedded={embedded}
    actorName={actor.name}
    experiences={companion ? character.companion?.experiences : undefined}
    forceSpendHopeForExperiences={companion}
    onTraitChange={onTraitChange}
    onClose={onClose}
    onRoll={(options, rollType, publication) => {
      characterRollService.action(actor, draft, options, rollType, publication, role);
      onClose();
    }}
    onDamage={draft.kind === 'weapon' || draft.kind === 'companion' ? ({ publication }) => {
      characterRollService.weaponDamage(actor, draft, character.proficiency, publication, role);
      onClose();
    } : undefined}
  />;
}

export function PreparedDiceRollDialog({ actor, draft, role, embedded = false, onClose }: {
  actor: RollActor;
  draft: PreparedDiceRoll;
  role: TableViewRole;
  embedded?: boolean;
  onClose: () => void;
}) {
  const [privateRoll, setPrivateRoll] = usePrivateRollPreference();
  const [critical, setCritical] = useState(false);
  const content = <>
    <div className="player-roll-confirm__intro">
      <strong>{draft.title}</strong>
      <p>От лица: {actor.name}</p>
      <p>{draft.kind === 'damage' ? 'Урон' : 'Кости'}: {draft.formula}</p>
    </div>
    <RollPrivateToggle checked={privateRoll} onChange={setPrivateRoll} />
    {draft.kind === 'damage' && <Checkbox label="Критический урон" checked={critical} onChange={(event) => setCritical(event.currentTarget.checked)} />}
    <div className="player-roll-confirm__actions">
      <Button variant="primary" onClick={() => {
        characterRollService.dice(actor, draft, privateRoll ? 'private' : 'public', role, critical);
        onClose();
      }}>{draft.kind === 'damage' ? 'Бросить урон' : 'Бросить кости'}</Button>
      <Button variant="ghost" onClick={onClose}>{embedded ? 'К карточке' : 'Отмена'}</Button>
    </div>
  </>;
  return embedded ? content : <PlayerContextPanel className="player-roll-confirm" ariaLabel="Подтверждение броска костей" onClose={onClose}>{content}</PlayerContextPanel>;
}
