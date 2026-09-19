import { CHARACTER_NAME_STYLES, ENGLISH_SETTLEMENTS, RUSSIAN_SETTLEMENTS } from './nameData';
import { composedNames } from './namePatterns';

export type CharacterNameStyle = keyof typeof CHARACTER_NAME_STYLES;
export type NameGender = 'any' | 'male' | 'female';
export type NameOptions =
  | { kind: 'character'; style: CharacterNameStyle | 'any'; gender: NameGender; withSurname: boolean }
  | { kind: 'settlement'; style: 'russian' | 'english' | 'any' };
export interface GeneratedName { name: string; surname: string; meaning?: string }

export function formatGeneratedName(value: GeneratedName): string {
  return [value.name, value.surname].filter(Boolean).join(' ');
}

export function nameCandidates(options: NameOptions): GeneratedName[] {
  if (options.style === 'any') return styleOptions(options).flatMap(nameCandidates);
  if (options.kind === 'character') {
    const styleKey = options.style;
    const style = CHARACTER_NAME_STYLES[styleKey];
    const genders = options.gender === 'any' ? ['male', 'female'] as const : [options.gender];
    return genders.flatMap((gender) => [...new Set([...style[gender], ...composedNames(styleKey, gender)])].flatMap((name) => {
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
  if (options.style === 'any') {
    const batches = shuffle(styleOptions(options), rng).map((option) => generateNames(option, { previous }, rng));
    const selected = new Map<string, GeneratedName>();
    // Чередуем стили, чтобы размер словаря не определял состав подборки.
    for (let i = 0; i < 10; i++) {
      for (const batch of batches) {
        const value = batch[i];
        if (!value) continue;
        const key = options.kind === 'character' ? value.name : formatGeneratedName(value);
        if (!selected.has(key)) selected.set(key, value);
        if (selected.size === 10) return shuffle([...selected.values()], rng);
      }
    }
    return shuffle([...selected.values()], rng);
  }
  const candidates = [...new Map(nameCandidates(options)
    .map((value) => [formatGeneratedName(value), value])).values()];
  const key = (value: GeneratedName) => options.kind === 'character' ? value.name : formatGeneratedName(value);
  const seen = new Set(previous.map(key));
  const fresh = candidates.filter((value) => !seen.has(key(value)));
  const repeated = candidates.filter((value) => seen.has(key(value)));
  const selected = new Set<string>();
  const beginnings = new Map<string, number>();
  const result: GeneratedName[] = [];
  for (const pool of [shuffle(fresh, rng), shuffle(repeated, rng)]) {
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

function styleOptions(options: NameOptions): NameOptions[] {
  return options.kind === 'character'
    ? (Object.keys(CHARACTER_NAME_STYLES) as CharacterNameStyle[]).map((style) => ({ ...options, style }))
    : (['russian', 'english'] as const).map((style) => ({ ...options, style }));
}

function shuffle<T>(values: T[], rng: () => number): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}
