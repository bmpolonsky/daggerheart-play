import type { TraitId } from '../../../domain/rules/types';
import { formatTraitValue, traitOptionsFor, type TraitDraft } from '../traitDistribution';

export function EditableBuilderStat({
  label,
  trait,
  values,
  onChange
}: {
  label: string;
  trait: TraitId;
  values: TraitDraft;
  onChange: (value: number | null) => void;
}) {
  const value = values[trait];
  return (
    <label className="dh-stat">
      <span className="dh-stat-label">{label}</span>
      <select className="dh-field" value={value ?? ''} onChange={(event) => onChange(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))}>
        <option value="">-</option>
        {traitOptionsFor(values, trait).map((option) => <option key={option} value={option}>{formatTraitValue(option)}</option>)}
      </select>
    </label>
  );
}
