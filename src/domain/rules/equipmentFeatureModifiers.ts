import type { TraitId } from './types';

const TRAITS: Array<[TraitId, Array<string | RegExp>]> = [
  ['agility', [/(?<![а-яё])провор[а-яё]*/g, /(?<![a-z])agility(?![a-z])/g]],
  ['strength', [/(?<![а-яё])сил[а-яё]*/g, /(?<![a-z])strength(?![a-z])/g]],
  ['finesse', [/(?<![а-яё])искус[а-яё]*/g, /(?<![a-z])finesse(?![a-z])/g]],
  ['instinct', [/(?<![а-яё])инстинкт[а-яё]*/g, /(?<![a-z])instinct(?![a-z])/g]],
  ['presence', [/(?<![а-яё])влия[а-яё]*/g, /(?<![a-z])presence(?![a-z])/g]],
  ['knowledge', [/(?<![а-яё])знан[а-яё]*/g, /(?<![a-z])knowledge(?![a-z])/g]]
];

export interface EquipmentFeatureModifiers {
  armorScoreModifier: number;
  evasionModifier: number;
  traitModifiers: Partial<Record<TraitId, number>>;
}

export function equipmentFeatureModifiers(text: string): EquipmentFeatureModifiers {
  const normalized = text.replace(/−/g, '-').replace(/[*_]/g, '').toLowerCase();
  const traitModifiers: Partial<Record<TraitId, number>> = {};
  const allTraitsModifier = signedNumberForTerms(normalized, ['всем характерист', 'all traits', 'all character traits']) ?? 0;

  for (const [trait, names] of TRAITS) {
    const value = signedNumberForTerms(normalized, names) ?? allTraitsModifier;
    if (value) traitModifiers[trait] = value;
  }

  return {
    evasionModifier: signedNumberForTerms(normalized, ['уклон', 'evasion']) ?? (allTraitsModifier && /уклон|evasion/.test(normalized) ? allTraitsModifier : 0),
    armorScoreModifier: signedNumberForTerms(normalized, [/показател[а-яё]*\s+брони/g, 'armor score']) ?? 0,
    traitModifiers
  };
}

function signedNumberForTerms(text: string, terms: Array<string | RegExp>): number | undefined {
  let nearest: { distance: number; value: number } | undefined;
  for (const clause of text.split(/[;.\n]+/)) {
    if (isConditionalModifierClause(clause)) continue;
    const termPositions = terms.flatMap((term) => {
      if (term instanceof RegExp) {
        return Array.from(clause.matchAll(term), (match) => ({ start: match.index, end: match.index + match[0].length }));
      }
      const positions: Array<{ start: number; end: number }> = [];
      for (let start = clause.indexOf(term); start >= 0; start = clause.indexOf(term, start + term.length)) {
        positions.push({ start, end: start + term.length });
      }
      return positions;
    });
    if (termPositions.length === 0) continue;

    for (const match of clause.matchAll(/(?<![a-zа-яё0-9])[+-]\s*\d+/g)) {
      if (/d\d+\s*$/i.test(clause.slice(0, match.index))) continue;
      const numberStart = match.index;
      const numberEnd = numberStart + match[0].length;
      const distance = Math.min(...termPositions.map((term) => (
        numberEnd <= term.start ? term.start - numberEnd : numberStart >= term.end ? numberStart - term.end : 0
      )));
      if (!nearest || distance < nearest.distance) {
        nearest = { distance, value: Number(match[0].replace(/\s+/g, '')) };
      }
    }
  }
  return nearest?.value;
}

function isConditionalModifierClause(clause: string): boolean {
  return [
    'отметьте',
    'отметить',
    'потратьте',
    'потратить',
    'в этой форме',
    'пока ',
    'до конца',
    'до следующ',
    'к следующему броску',
    'на следующий бросок',
    'mark an ',
    'mark a ',
    'spend ',
    'in this form',
    'while ',
    'until ',
    'next roll'
  ].some((marker) => clause.includes(marker));
}
