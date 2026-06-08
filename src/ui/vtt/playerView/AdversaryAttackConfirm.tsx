/** @jsxImportSource preact */
import { createPortal } from 'preact/compat';
import { useState } from 'preact/hooks';
import type { PlayerViewAdversarySummary } from '../../../domain/tabletop/playerView';
import { addAdvantageDie, buildActionComposerRollOptions } from '../../../domain/rules/actionComposer';
import type { RollPublication } from '../../../domain/rules/types';
import { compactDamageTypeLabel, signed } from './helpers';
import { RollConfirmCloseButton, RollPrivateToggle, rollConfirmDefaultPosition } from './RollConfirmControls';
import { usePrivateRollPreference } from './rollPrivacyPreference';
import { Button, Checkbox, DraggableSurface, SegmentedControl } from '../../components/common';

export interface AdversaryAttackRollOptions {
  advantageCount: number;
  disadvantageCount: number;
  experienceIds: string[];
  spendFearForExperiences: boolean;
  publication: RollPublication;
}

export function AdversaryAttackConfirm({
  adversary,
  onAttack,
  onClose,
  onDamage
}: {
  adversary: PlayerViewAdversarySummary;
  onAttack: (options: AdversaryAttackRollOptions) => void;
  onClose: () => void;
  onDamage: (options: { critical: boolean; publication: RollPublication }) => void;
}) {
  const [mode, setMode] = useState<'attack' | 'damage'>('attack');
  const [advantageCount, setAdvantageCount] = useState(0);
  const [disadvantageCount, setDisadvantageCount] = useState(0);
  const [privateRoll, setPrivateRoll] = usePrivateRollPreference();
  const publication: RollPublication = privateRoll ? 'private' : 'public';
  const [experienceIds, setExperienceIds] = useState<string[]>([]);
  const [spendFearForExperiences, setSpendFearForExperiences] = useState(true);
  const [criticalDamage, setCriticalDamage] = useState(false);
  const experienceModifier = adversary.experiences
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
  const rollAttack = () => {
    const rollOptions = buildActionComposerRollOptions({ advantageMode: 0, advantageCount, disadvantageCount, experienceIds, spendHopeForExperiences: spendFearForExperiences });
    onAttack({
      advantageCount: rollOptions.advantageCount,
      disadvantageCount: rollOptions.disadvantageCount,
      experienceIds: rollOptions.experienceIds,
      spendFearForExperiences,
      publication
    });
  };

  const content = (
    <div className="dh-portal-scope player-roll-confirm-portal">
      <DraggableSurface
        className="player-roll-confirm"
        aria-label="Подтверждение атаки противника"
        title="Атака противника"
        actions={<RollConfirmCloseButton onClose={onClose} />}
        defaultPosition={rollConfirmDefaultPosition}
        bounds={{ top: 72, right: 12, bottom: 18, left: 12 }}
      >
      <div className="player-roll-confirm__intro">
        <strong>{adversary.standardAttack.name}</strong>
        <p>{signed(adversary.attackModifier)} / {adversary.standardAttack.range} / {adversary.standardAttack.damage} {compactDamageTypeLabel(adversary.standardAttack.damageType)}</p>
      </div>
      <SegmentedControl<'attack' | 'damage'>
        className="player-roll-confirm__segmented"
        label="Тип броска"
        layout="equal"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'attack', label: 'Атака' },
          { value: 'damage', label: 'Урон' },
        ]}
      />
      <RollPrivateToggle checked={privateRoll} onChange={setPrivateRoll} />
      {mode === 'attack' ? (
        <>
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
          {adversary.experiences.length > 0 && (
            <div className="player-roll-confirm__checks">
              <span>Опыт {experienceModifier ? signed(experienceModifier) : ''}</span>
              {adversary.experiences.map((experience) => (
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
              <Checkbox
                className="player-roll-confirm__check"
                size="sm"
                boxPosition="start"
                label="Потратить Страх за опыт"
                checked={spendFearForExperiences}
                disabled={experienceIds.length === 0}
                onChange={(event) => setSpendFearForExperiences(event.currentTarget.checked)}
              />
            </div>
          )}
        </>
      ) : (
        <div className="player-roll-confirm__checks">
          <span>Урон {adversary.standardAttack.damage} {compactDamageTypeLabel(adversary.standardAttack.damageType)}</span>
          <Checkbox
            className="player-roll-confirm__check"
            size="sm"
            boxPosition="start"
            label="Критический урон"
            checked={criticalDamage}
            onChange={(event) => setCriticalDamage(event.currentTarget.checked)}
          />
        </div>
      )}
      <div className="player-roll-confirm__actions">
        <Button
          variant="primary"
          type="button"
          onClick={() => {
            if (mode === 'attack') rollAttack();
            else onDamage({ critical: criticalDamage, publication });
          }}
        >
          {mode === 'attack' ? 'Бросить атаку' : 'Бросить урон'}
        </Button>
      </div>
      </DraggableSurface>
    </div>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
