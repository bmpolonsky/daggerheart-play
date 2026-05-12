import { clamp } from '../../core/utils/clamp';
import { effectiveHopeMax } from './deathMoves';
import type { Character, CharacterSheetCard, HopeTrack, Thresholds, TrackSlots, TraitId } from './types';

export interface CharacterEffectModifiers {
  evasion: number;
  hpMax: number;
  stressMax: number;
  thresholds: Partial<Thresholds>;
  traits: Partial<Record<TraitId, number>>;
}

export interface CharacterEffect {
  id: string;
  sourceId: string;
  sourceName: string;
  modifiers: CharacterEffectModifiers;
}

export interface EffectiveCharacterStats {
  effects: CharacterEffect[];
  evasion: number;
  hope: HopeTrack;
  hp: TrackSlots;
  stress: TrackSlots;
  thresholds: Thresholds;
  traits: Record<TraitId, number>;
}

const EMPTY_MODIFIERS: CharacterEffectModifiers = {
  evasion: 0,
  hpMax: 0,
  stressMax: 0,
  thresholds: {},
  traits: {}
};

export function buildEffectiveCharacterStats(character: Character): EffectiveCharacterStats {
  const effects = collectCharacterEffects(character);
  const modifiers = mergeEffectModifiers(effects);
  const hpMax = clamp(character.hp.max + modifiers.hpMax, 0, 12);
  const stressMax = clamp(character.stress.max + modifiers.stressMax, 0, 12);
  const hopeMax = effectiveHopeMax(character);
  return {
    effects,
    evasion: clamp(character.evasion + modifiers.evasion, 0, 99),
    hope: { value: clamp(character.hope.value, 0, hopeMax), max: hopeMax },
    hp: { marked: clamp(character.hp.marked, 0, hpMax), max: hpMax },
    stress: { marked: clamp(character.stress.marked, 0, stressMax), max: stressMax },
    thresholds: {
      major: clamp(character.thresholds.major + (modifiers.thresholds.major ?? 0), 0, 999),
      severe: clamp(character.thresholds.severe + (modifiers.thresholds.severe ?? 0), 0, 999)
    },
    traits: applyTraitModifiers(character.traits, modifiers.traits)
  };
}

export function collectCharacterEffects(character: Character): CharacterEffect[] {
  const effects = character.domainCards
    .filter((card) => card.inLoadout)
    .map((card) => {
      const modifiers = parsePassiveModifiers(card.text, { proficiency: character.proficiency });
      return {
        id: `domain-card:${card.id}`,
        sourceId: card.id,
        sourceName: card.name,
        modifiers
      };
    })
    .filter((effect) => hasModifiers(effect.modifiers));

  for (const card of character.sheetCards ?? []) {
    if (!isPermanentFeatureSheetCard(card)) continue;
    const modifiers = parsePassiveModifiers(card.text ?? '', {
      permanentOnly: true,
      proficiency: character.proficiency
    });
    if (!hasModifiers(modifiers)) continue;
    effects.push({
      id: `sheet-card:${card.id}`,
      sourceId: card.id,
      sourceName: card.name,
      modifiers
    });
  }

  if (character.activeBeastform) {
    const traits: Partial<Record<TraitId, number>> = {};
    if (character.activeBeastform.traitType) {
      traits[character.activeBeastform.traitType] = (traits[character.activeBeastform.traitType] ?? 0) + character.activeBeastform.traitBonus;
    }
    if (character.activeBeastform.evolutionTrait) {
      traits[character.activeBeastform.evolutionTrait] = (traits[character.activeBeastform.evolutionTrait] ?? 0) + 1;
    }
    effects.push({
      id: `beastform:${character.activeBeastform.slug}`,
      sourceId: character.activeBeastform.slug,
      sourceName: `Звериная форма: ${character.activeBeastform.name}`,
      modifiers: {
        ...cloneModifiers(EMPTY_MODIFIERS),
        evasion: character.activeBeastform.evasionModifier,
        traits
      }
    });
  }
  return effects;
}

function mergeEffectModifiers(effects: CharacterEffect[]): CharacterEffectModifiers {
  const merged: CharacterEffectModifiers = cloneModifiers(EMPTY_MODIFIERS);
  for (const effect of effects) {
    merged.evasion += effect.modifiers.evasion;
    merged.hpMax += effect.modifiers.hpMax;
    merged.stressMax += effect.modifiers.stressMax;
    merged.thresholds.major = (merged.thresholds.major ?? 0) + (effect.modifiers.thresholds.major ?? 0);
    merged.thresholds.severe = (merged.thresholds.severe ?? 0) + (effect.modifiers.thresholds.severe ?? 0);
    for (const [trait, value] of Object.entries(effect.modifiers.traits) as Array<[TraitId, number]>) {
      merged.traits[trait] = (merged.traits[trait] ?? 0) + value;
    }
  }
  return merged;
}

interface PassiveModifierParseOptions {
  permanentOnly?: boolean;
  proficiency?: number;
}

function parsePassiveModifiers(text: string, options: PassiveModifierParseOptions = {}): CharacterEffectModifiers {
  const normalized = normalizeRulesText(text);
  if (options.permanentOnly && !hasPermanentPassiveLanguage(normalized)) {
    return cloneModifiers(EMPTY_MODIFIERS);
  }
  const genericThresholdModifier = modifierForTerms(normalized, [
    'damage thresholds',
    'пороги урона',
    'порогам урона',
    'порогов урона'
  ]);
  const proficiencyThresholdModifier = thresholdModifierFromProficiency(normalized, options.proficiency ?? 0);
  return {
    evasion: modifierForTerms(normalized, ['evasion', 'уклонение', 'уклонению', 'уклонения']),
    hpMax: modifierForTerms(normalized, ['hit points', 'hit point', 'hp', 'рана', 'раны', 'ран', 'ранам']) +
      additionalTrackSlots(normalized, ['hit points', 'hit point', 'hp', 'рана', 'раны', 'ран']),
    stressMax: modifierForTerms(normalized, ['stress', 'стресс', 'стресса', 'стрессу']) +
      additionalTrackSlots(normalized, ['stress', 'стресс', 'стресса']),
    thresholds: {
      major: genericThresholdModifier + proficiencyThresholdModifier +
        modifierForTerms(normalized, [
          'major threshold',
          'major thresholds',
          'major damage threshold',
          'ощутимый порог',
          'ощутимому порогу',
          'тяжелый порог',
          'тяжелому порогу',
          'порог ощутимого урона',
          'порогу ощутимого урона'
        ]),
      severe: genericThresholdModifier + proficiencyThresholdModifier +
        modifierForTerms(normalized, [
          'severe threshold',
          'severe thresholds',
          'severe damage threshold',
          'порог тяжелого урона',
          'порогу тяжелого урона',
          'критический порог',
          'критическому порогу'
        ])
    },
    traits: {
      agility: modifierForTerms(normalized, ['agility', 'проворность', 'проворности']),
      strength: modifierForTerms(normalized, ['strength', 'сила', 'силе', 'силы']),
      finesse: modifierForTerms(normalized, ['finesse', 'искусность', 'искусности']),
      instinct: modifierForTerms(normalized, ['instinct', 'инстинкт', 'инстинкту']),
      presence: modifierForTerms(normalized, ['presence', 'влияние', 'влиянию']),
      knowledge: modifierForTerms(normalized, ['knowledge', 'знание', 'знанию'])
    }
  };
}

function isPermanentFeatureSheetCard(card: CharacterSheetCard): boolean {
  return card.kind === 'classFeature' ||
    card.kind === 'ancestryFeature' ||
    card.kind === 'communityFeature' ||
    card.kind === 'subclassFeature';
}

function hasPermanentPassiveLanguage(text: string): boolean {
  return /постоянн|permanent|при создании/.test(text) ||
    /(?:получите|получаете|gain)\s+дополнительн/.test(text) ||
    /(?:получите|получаете|gain)\s+(?:бонус\s+)?к\s+порогам\s+урона,\s+равн/.test(text);
}

function modifierForTerms(text: string, terms: string[]): number {
  for (const term of terms) {
    const escaped = escapeRegExp(term);
    const before = text.match(new RegExp(`([+-]\\s*\\d+)\\s*(?:бонус|bonus)?\\s*(?:к|to)?\\s*(?:ваш(?:ему|ей|им|его)?|your)?\\s*${escaped}`, 'i'));
    if (before) return Number(before[1].replace(/\s+/g, ''));
    const after = text.match(new RegExp(`${escaped}\\s*(?:на|by)?\\s*([+-]\\s*\\d+)`, 'i'));
    if (after) return Number(after[1].replace(/\s+/g, ''));
  }
  return 0;
}

function additionalTrackSlots(text: string, terms: string[]): number {
  for (const term of terms) {
    const escaped = escapeRegExp(term);
    const withExplicitAmount = text.match(new RegExp(`(?:получите|получаете|gain)\\s+(\\d+)\\s+дополнительн[a-zа-я]*\\s+ячейк[a-zа-я]*[^.]*${escaped}`, 'i'));
    if (withExplicitAmount) return Number(withExplicitAmount[1]);
    const singular = text.match(new RegExp(`(?:получите|получаете|gain)\\s+дополнительн[a-zа-я]*\\s+ячейк[a-zа-я]*[^.]*${escaped}`, 'i'));
    if (singular) return 1;
  }
  return 0;
}

function thresholdModifierFromProficiency(text: string, proficiency: number): number {
  if (proficiency <= 0) return 0;
  if (/(?:порогам урона|damage thresholds)[^.]*равн[^.]*мастерств/.test(text)) {
    return proficiency;
  }
  if (/(?:порогам урона|damage thresholds)[^.]*equal[^.]*proficiency/.test(text)) {
    return proficiency;
  }
  return 0;
}

function applyTraitModifiers(
  traits: Record<TraitId, number>,
  modifiers: Partial<Record<TraitId, number>>
): Record<TraitId, number> {
  const next: Record<TraitId, number> = { ...traits };
  for (const [trait, value] of Object.entries(modifiers) as Array<[TraitId, number]>) {
    next[trait] = clamp((next[trait] ?? 0) + value, -10, 20);
  }
  return next;
}

function hasModifiers(modifiers: CharacterEffectModifiers): boolean {
  return modifiers.evasion !== 0 ||
    modifiers.hpMax !== 0 ||
    modifiers.stressMax !== 0 ||
    Object.values(modifiers.thresholds).some((value) => value !== undefined && value !== 0) ||
    Object.values(modifiers.traits).some((value) => value !== undefined && value !== 0);
}

function cloneModifiers(modifiers: CharacterEffectModifiers): CharacterEffectModifiers {
  return {
    evasion: modifiers.evasion,
    hpMax: modifiers.hpMax,
    stressMax: modifiers.stressMax,
    thresholds: { ...modifiers.thresholds },
    traits: { ...modifiers.traits }
  };
}

function normalizeRulesText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/−/g, '-')
    .replace(/ё/g, 'е')
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
