import { useEffect, useState } from 'preact/hooks';
import { TRAITS } from '../../domain/rules/constants';
import type { Character, TraitId } from '../../domain/rules/types';
import { characterService } from '../../services/serviceRegistry';
import { formatTraitValue, isCompleteStartingTraitDistribution, traitOptionsFor, type TraitDraft } from './traitDistribution';

export function TraitGrid({ character }: { character: Character }) {
  const [draft, setDraft] = useState<TraitDraft>({ ...character.traits });

  useEffect(() => {
    setDraft({ ...character.traits });
  }, [character.id, character.updatedAt]);

  const updateTraitDraft = (trait: TraitId, value: string) => {
    const next: TraitDraft = { ...draft };
    if (value === '') {
      delete next[trait];
    } else {
      next[trait] = Number(value);
    }
    setDraft(next);
    if (isCompleteStartingTraitDistribution(next)) {
      TRAITS.forEach((item) => characterService.updateTrait(character.id, item.id, next[item.id]));
    }
  };

  return (
    <div className="trait-grid trait-grid--compact">
      {TRAITS.map((trait) => (
        <label key={trait.id} className="trait-card">
          <span>{trait.label}</span>
          <select
            value={draft[trait.id] ?? ''}
            onChange={(event) => updateTraitDraft(trait.id as TraitId, event.currentTarget.value)}
          >
            <option value="">-</option>
            {traitOptionsFor(draft, trait.id).map((value) => <option key={value} value={value}>{formatTraitValue(value)}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
