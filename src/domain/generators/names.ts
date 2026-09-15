import { CHARACTER_NAME_STYLES, ENGLISH_SETTLEMENTS, RUSSIAN_SETTLEMENTS } from './nameData';
import { composedNames } from './namePatterns';

export type CharacterNameStyle = keyof typeof CHARACTER_NAME_STYLES;
export type NameGender = 'any' | 'male' | 'female';
export type NameOptions =
  | { kind: 'character'; style: CharacterNameStyle; gender: NameGender; withSurname: boolean }
  | { kind: 'settlement'; style: 'russian' | 'english' };
export interface GeneratedName { name: string; surname: string; meaning?: string }

export function formatGeneratedName(value: GeneratedName): string {
  return [value.name, value.surname].filter(Boolean).join(' ');
}

export function nameCandidates(options: NameOptions): GeneratedName[] {
  if (options.kind === 'character') {
    const style = CHARACTER_NAME_STYLES[options.style];
    const genders = options.gender === 'any' ? ['male', 'female'] as const : [options.gender];
    return genders.flatMap((gender) => [...new Set([...style[gender], ...composedNames(options.style, gender)])].flatMap((name) => {
      const surnames = options.withSurname ? style.surnames.map((forms) => forms[gender === 'male' ? 0 : 1]) : [''];
      return surnames.map((surname) => ({ name, surname }));
    }));
  }
  if (options.style === 'english') {
    return [
      ...Object.entries(ENGLISH_SETTLEMENTS.standalone).map(([name, meaning]) => ({ name, surname: '', meaning })),
      ...Object.entries(ENGLISH_SETTLEMENTS.prefixes).flatMap(([prefix, prefixMeaning]) =>
        Object.entries(ENGLISH_SETTLEMENTS.endings).filter(([ending]) => prefix.toLowerCase() !== ending)
          .map(([ending, endingMeaning]) => ({ name: prefix + ending, surname: '', meaning: `${prefixMeaning} + ${endingMeaning}` })))
    ];
  }
  const names = [...RUSSIAN_SETTLEMENTS.standalone, ...RUSSIAN_SETTLEMENTS.groups.flatMap(({ modifiers, nouns }) =>
    modifiers.flatMap((modifier) => nouns.map((noun) => `${modifier} ${noun}`)))];
  return names.map((name) => ({ name, surname: '' }));
}

/** Новая подборка предпочитает ещё не показанные варианты; выбор ограничен конечным словарём. */
export function generateNames(
  options: NameOptions,
  { previous = [] }: { previous?: GeneratedName[] } = {},
  rng: () => number = Math.random
): GeneratedName[] {
  const candidates = [...new Map(nameCandidates(options)
    .map((value) => [formatGeneratedName(value), value])).values()];
  const key = (value: GeneratedName) => options.kind === 'character' ? value.name : formatGeneratedName(value);
  const seen = new Set(previous.map(key));
  const fresh = candidates.filter((value) => !seen.has(key(value)));
  const repeated = candidates.filter((value) => seen.has(key(value)));
  const shuffle = (values: GeneratedName[]) => {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [values[i], values[j]] = [values[j]!, values[i]!];
    }
    return values;
  };
  const selected = new Set<string>();
  const beginnings = new Map<string, number>();
  const result: GeneratedName[] = [];
  for (const pool of [shuffle(fresh), shuffle(repeated)]) {
    // Сначала разнообразим начала имён, затем добираем из того же пула.
    for (const diverse of [true, false]) {
      for (const value of pool) {
        if (selected.has(key(value))) continue;
        const beginning = value.name.slice(0, 3);
        if (diverse && options.kind === 'character' && (beginnings.get(beginning) ?? 0) >= 2) continue;
        selected.add(key(value));
        beginnings.set(beginning, (beginnings.get(beginning) ?? 0) + 1);
        result.push(value);
        if (result.length === 10) return result;
      }
    }
  }
  return result;
}
