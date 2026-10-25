/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { addAdvantageDie, buildActionComposerRollOptions, type ActionComposerRollOptions, type AdvantageMode } from '../../../domain/rules/actionComposer';
import { characterRollExperienceSelection } from '../../../domain/rules/characterRollSelection';
import { scaleWeaponFormulaByProficiency } from '../../../domain/rules/diceFormula';
import type { Experience, RollPublication, TraitId } from '../../../domain/rules/types';
import { signed } from './helpers';
import { RollPrivateToggle } from './RollConfirmControls';
import { usePrivateRollPreference } from './rollPrivacyPreference';
import type { PlayerRollDraft, PlayerRollType } from './types';
import { Button, Checkbox, SelectControl, SegmentedControl, TextField } from '../../components/common';
import { CompendiumRuleTerm } from './CompendiumRuleTerm';
import { PlayerContextPanel } from './PlayerContextPanel';
import { actionRollFormulaPreview, parseManualRollModifier } from '../../../domain/rules/manualRollModifier';

export function PlayerRollConfirm({
  character,
  draft,
  actorName = character.name,
  embedded = false,
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
  actorName?: string;
  embedded?: boolean;
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
  const [rollMode, setRollMode] = useState<PlayerRollType | 'damage'>(draft.rollType ?? 'action');
  const rollType: PlayerRollType = rollMode === 'damage' ? 'action' : rollMode;
  const [privateRoll, setPrivateRoll] = usePrivateRollPreference();
  const publication: RollPublication = privateRoll ? 'private' : 'public';
  const [advantageCount, setAdvantageCount] = useState(initialAdvantageCount ?? (initialAdvantageMode > 0 ? 1 : 0));
  const [disadvantageCount, setDisadvantageCount] = useState(initialDisadvantageCount ?? (initialAdvantageMode < 0 ? 1 : 0));
  const [experienceIds, setExperienceIds] = useState<string[]>([]);
  const [spendHopeForExperiences, setSpendHopeForExperiences] = useState(true);
  const [manualModifierOpen, setManualModifierOpen] = useState(false);
  const [manualModifierInput, setManualModifierInput] = useState('');
  const manualModifier = parseManualRollModifier(manualModifierInput);
  const availableExperiences = experiences ?? character.experiences;
  const selectedTrait = character.traits.find((trait) => trait.id === draft.trait);
  const selection = characterRollExperienceSelection(availableExperiences, experienceIds, forceSpendHopeForExperiences || spendHopeForExperiences, character.hope.value);
  const experienceModifier = selection.modifier;
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
  const experienceHopeCost = selection.hopeCost;
  const content = (
    <>
      <div className="player-roll-confirm__intro">
        <strong>{draft.title}</strong>
        <p>{draft.subtitle}</p>
        <p>От лица: {actorName}</p>
      </div>
      <SegmentedControl<PlayerRollType | 'damage'>
        className="player-roll-confirm__segmented"
        label="Тип броска"
        layout="equal"
        value={rollMode}
        onChange={setRollMode}
        options={[
          { value: 'action', label: 'Действие' },
          { value: 'reaction', label: 'Реакция' },
          ...(onDamage ? [{ value: 'damage' as const, label: 'Урон' }] : []),
        ]}
      />
      {rollMode !== 'damage' && <>
      <div className="player-roll-confirm__field">
        <span>
          Характеристика: <CompendiumRuleTerm ruleSlug={draft.trait}>{selectedTrait?.label ?? draft.trait}</CompendiumRuleTerm>
        </span>
        <SelectControl aria-label="Характеристика броска" value={draft.trait} onChange={(event) => onTraitChange(event.currentTarget.value as TraitId)}>
          {character.traits.map((trait) => (
            <option key={trait.id} value={trait.id}>{trait.label} {signed(trait.value)}</option>
          ))}
        </SelectControl>
      </div>
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

      {availableExperiences.length > 0 && (
        <div className="player-roll-confirm__checks">
          <span><CompendiumRuleTerm ruleSlug="experience" sectionAnchor="using-experiences">Опыт</CompendiumRuleTerm> {experienceModifier ? signed(experienceModifier) : ''}</span>
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
      <p>Цена опыта: {experienceHopeCost} Надежды{experienceHopeCost > character.hope.value ? ' — недостаточно' : ''}</p>
      <Button variant="ghost" size="sm" type="button" aria-expanded={manualModifierOpen} onClick={() => setManualModifierOpen((open) => !open)}>
        Доп. модификатор{manualModifier.valid && manualModifier.value !== 0 ? `: ${signed(manualModifier.value)}` : ''}
      </Button>
      {manualModifierOpen && <TextField label="Доп. модификатор" value={manualModifierInput} placeholder="+6 или −2" onInput={(event) => setManualModifierInput(event.currentTarget.value)}
        hint="Укажите итоговую ручную поправку. Для помощи сначала согласуйте максимум и отмену помех; не добавляйте ещё одно преимущество за ту же помощь." />}
      {!manualModifier.valid && <p role="alert">Введите целое число, например +6 или −2.</p>}
      <p aria-label="Итоговая формула">Итоговая формула: {manualModifier.valid ? actionRollFormulaPreview({ traitModifier: selectedTrait?.value ?? 0, experienceModifier, manualModifier: manualModifier.value, advantageCount, disadvantageCount }) : 'исправьте доп. модификатор'}</p>
      </>}
      {rollMode === 'damage' && (draft.kind === 'weapon' || draft.kind === 'companion') && <p>Урон: {scaleWeaponFormulaByProficiency(draft.damageFormula, character.proficiency)}</p>}
      <RollPrivateToggle checked={privateRoll} onChange={setPrivateRoll} />
      <div className="player-roll-confirm__actions">
        <Button
          variant="primary"
          type="button"
          disabled={rollMode !== 'damage' && (!selection.canAfford || !manualModifier.valid)}
          onClick={() => {
            if (rollMode === 'damage') onDamage?.({ publication });
            else onRoll(buildActionComposerRollOptions({ advantageMode: 0, advantageCount, disadvantageCount, experienceIds: selection.experienceIds, spendHopeForExperiences: forceSpendHopeForExperiences || spendHopeForExperiences, manualModifier: manualModifier.value }), rollType, publication);
          }}
        >{rollMode === 'damage' ? 'Бросить урон' : rollType === 'reaction' ? 'Бросить реакцию' : 'Бросить действие'}</Button>
        <Button variant="ghost" onClick={onClose}>{embedded ? 'К карточке' : 'Отмена'}</Button>
      </div>
    </>
  );
  return embedded ? content : <PlayerContextPanel className="player-roll-confirm" ariaLabel="Подтверждение броска" onClose={onClose}>{content}</PlayerContextPanel>;
}
