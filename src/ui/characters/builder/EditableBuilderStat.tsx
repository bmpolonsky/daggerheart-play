import type { TraitId } from '../../../domain/rules/types';
import styles from './TraitDistribution.module.css';
import { SelectControl } from '../../components/common/Field';
import { formatTraitValue, STARTING_TRAIT_OPTIONS, type TraitDraft } from '../traitDistribution';

export function EditableBuilderStat({
  label,
  trait,
  values,
  cleared = false,
  onChange
}: {
  label: string;
  trait: TraitId;
  values: TraitDraft;
  cleared?: boolean;
  onChange: (value: number | null) => void;
}) {
  const value = values[trait];
  return (
    <label className={`dh-stat ${cleared ? styles.cleared : ''}`}>
      <span className="dh-stat-label">{label}</span>
      <SelectControl aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))}>
        <option value="">—</option>
        {STARTING_TRAIT_OPTIONS.map((option) => <option key={option} value={option}>{formatTraitValue(option)}</option>)}
      </SelectControl>
      {cleared && <span className={styles.hint}>Выберите значение</span>}
    </label>
  );
}
