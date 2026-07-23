/** @jsxImportSource preact */
import { createPortal } from 'preact/compat';
import { useState } from 'preact/hooks';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { addAdvantageDie, buildActionComposerRollOptions, type ActionComposerRollOptions, type AdvantageMode } from '../../../domain/rules/actionComposer';
import type { Experience, RollPublication, TraitId } from '../../../domain/rules/types';
import { signed } from './helpers';
import { RollConfirmCloseButton, RollPrivateToggle, rollConfirmDefaultPosition } from './RollConfirmControls';
import { usePrivateRollPreference } from './rollPrivacyPreference';
import type { PlayerRollDraft, PlayerRollType } from './types';
import { Button, Checkbox, DraggableSurface, SelectControl, SegmentedControl } from '../../components/common';

export function PlayerRollConfirm({
  character,
  draft,
  initialAdvantageMode = 0,
  initialAdvantageCount,
  initialDisadvantageCount,
  experiences,
  forceSpendHopeForExperiences = false,
  onTraitChange,
  onRoll,
  onDamage,
  onClose
}: {
  character: PlayerViewCharacterSummary;
  draft: PlayerRollDraft;
  initialAdvantageMode?: AdvantageMode;
  initialAdvantageCount?: number;
  initialDisadvantageCount?: number;
  experiences?: Experience[];
  forceSpendHopeForExperiences?: boolean;
  onTraitChange: (trait: TraitId) => void;
  onRoll: (options: ActionComposerRollOptions, rollType: PlayerRollType, publication: RollPublication) => void;
  onDamage?: (options: { publication: RollPublication }) => void;
  onClose: () => void;
}) {
  const [rollType, setRollType] = useState<PlayerRollType>(draft.rollType ?? 'action');
  const [privateRoll, setPrivateRoll] = usePrivateRollPreference();
  const publication: RollPublication = privateRoll ? 'private' : 'public';
  const [advantageCount, setAdvantageCount] = useState(initialAdvantageCount ?? (initialAdvantageMode > 0 ? 1 : 0));
  const [disadvantageCount, setDisadvantageCount] = useState(initialDisadvantageCount ?? (initialAdvantageMode < 0 ? 1 : 0));
  const [experienceIds, setExperienceIds] = useState<string[]>([]);
  const [spendHopeForExperiences, setSpendHopeForExperiences] = useState(true);
  const availableExperiences = experiences ?? character.experiences;
  const experienceModifier = availableExperiences
    .filter((experience) => experienceIds.includes(experience.id))
    .reduce((sum, experience) => sum + experience.modifier, 0);
  const toggleExperience = (experienceId: string) => {
    setExperienceIds((current) => current.includes(experienceId)
      ? current.filter((id) => id !== experienceId)
      : [...current, experienceId]);
  };
  const addAdvantage = (kind: 'advantage' | 'disadvantage') => {
    const next = addAdvantageDie({ advantageCount, disadvantageCount }, kind);
    setAdvantageCount(next.advantageCount);
    setDisadvantageCount(next.disadvantageCount);
  };
  const resetAdvantage = () => {
    setAdvantageCount(0);
    setDisadvantageCount(0);
  };
  const content = (
    <div className="dh-portal-scope player-roll-confirm-portal">
      <DraggableSurface
        className="player-roll-confirm"
        aria-label="Подтверждение броска"
        title={draft.kind === 'weapon' ? 'Атака' : draft.kind === 'card' ? 'Карта домена' : draft.kind === 'companion' ? 'Атака компаньона' : 'Характеристика'}
        actions={<RollConfirmCloseButton onClose={onClose} />}
        defaultPosition={rollConfirmDefaultPosition}
        bounds={{ top: 72, right: 12, bottom: 18, left: 12 }}
      >
      <div className="player-roll-confirm__intro">
        <strong>{draft.title}</strong>
        <p>{draft.subtitle}</p>
      </div>
      <SegmentedControl<PlayerRollType>
        className="player-roll-confirm__segmented"
        label="Тип броска"
        layout="equal"
        value={rollType}
        onChange={setRollType}
        options={[
          { value: 'action', label: 'Действие' },
          { value: 'reaction', label: 'Реакция' },
        ]}
      />
      <label className="player-roll-confirm__field">
        <span>Характеристика</span>
        <SelectControl value={draft.trait} onChange={(event) => onTraitChange(event.currentTarget.value as TraitId)}>
          {character.traits.map((trait) => (
            <option key={trait.id} value={trait.id}>{trait.label} {signed(trait.value)}</option>
          ))}
        </SelectControl>
      </label>
      <div className="player-roll-confirm__advantage" aria-label="Преимущество и помеха">
        <Button className="player-roll-confirm__advantage-option" variant={advantageCount > 0 ? 'primary' : 'ghost'} size="sm" type="button" onClick={() => addAdvantage('advantage')}>
          Преим.{advantageCount > 0 ? ` ${advantageCount}` : ''}
        </Button>
        <Button className="player-roll-confirm__advantage-option" variant="ghost" size="sm" type="button" onClick={resetAdvantage} disabled={advantageCount === 0 && disadvantageCount === 0}>
          Обычный
        </Button>
        <Button className="player-roll-confirm__advantage-option" variant={disadvantageCount > 0 ? 'danger' : 'ghost'} size="sm" type="button" onClick={() => addAdvantage('disadvantage')}>
          Помеха{disadvantageCount > 0 ? ` ${disadvantageCount}` : ''}
        </Button>
      </div>
      <RollPrivateToggle checked={privateRoll} onChange={setPrivateRoll} />
      {availableExperiences.length > 0 && (
        <div className="player-roll-confirm__checks">
          <span>Опыт {experienceModifier ? signed(experienceModifier) : ''}</span>
          {availableExperiences.map((experience) => (
            <Checkbox
              key={experience.id}
              className="player-roll-confirm__check"
              size="sm"
              boxPosition="start"
              label={`${experience.name} ${signed(experience.modifier)}`}
              checked={experienceIds.includes(experience.id)}
              onChange={() => toggleExperience(experience.id)}
            />
          ))}
          {experienceIds.length > 0 && !forceSpendHopeForExperiences && (
            <Checkbox
              className="player-roll-confirm__check player-roll-confirm__hope-toggle"
              size="sm"
              boxPosition="start"
              label="Потратить Надежду за опыт"
              checked={spendHopeForExperiences}
              onChange={(event) => setSpendHopeForExperiences(event.currentTarget.checked)}
            />
          )}
        </div>
      )}
      <div className="player-roll-confirm__actions">
        <Button
          variant="primary"
          type="button"
          onClick={() => onRoll(buildActionComposerRollOptions({ advantageMode: 0, advantageCount, disadvantageCount, experienceIds, spendHopeForExperiences }), rollType, publication)}
        >{rollType === 'reaction' ? 'Бросить реакцию' : 'Бросить действие'}</Button>
        {onDamage && <Button type="button" onClick={() => onDamage({ publication })}>Бросить урон</Button>}
      </div>
      </DraggableSurface>
    </div>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
