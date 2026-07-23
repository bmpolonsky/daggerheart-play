import { clamp } from '../../core/utils/clamp';
import { effectiveHopeMax } from './deathMoves';
import { automaticFeatureRuleEffects, type FeatureRuleEffect, type FeatureStatDeltaEffect } from './featureEffects';
import type { Character, CharacterSheetCard, HopeTrack, Thresholds, TrackSlots, TraitId } from './types';

export interface CharacterEffectModifiers {
  evasion: number;
  armorScore: number;
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
  rules: FeatureRuleEffect[];
}

export interface EffectiveCharacterStats {
  effects: CharacterEffect[];
  evasion: number;
  armorScore: number;
  hope: HopeTrack;
  hp: TrackSlots;
  stress: TrackSlots;
  thresholds: Thresholds;
  traits: Record<TraitId, number>;
}

const EMPTY_MODIFIERS: CharacterEffectModifiers = {
  evasion: 0,
  armorScore: 0,
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
    armorScore: clamp(character.armor.score + modifiers.armorScore, 0, 12),
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
  const effects: CharacterEffect[] = [];

  for (const card of character.sheetCards ?? []) {
    if (!isPermanentFeatureSheetCard(card)) continue;
    const rules = automaticFeatureRuleEffects(card.text ?? '').filter(isStatDeltaEffect);
    const modifiers = statModifiersFromRules(rules, character.proficiency);
    if (!hasModifiers(modifiers)) continue;
    effects.push({
      id: `sheet-card:${card.id}`,
      sourceId: card.id,
      sourceName: card.name,
      modifiers,
      rules
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
      rules: [],
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
    merged.armorScore += effect.modifiers.armorScore;
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

function statModifiersFromRules(rules: FeatureStatDeltaEffect[], proficiency: number): CharacterEffectModifiers {
  const modifiers = cloneModifiers(EMPTY_MODIFIERS);
  for (const rule of rules) {
    const amount = rule.amountSource === 'proficiency' ? rule.amount * proficiency : rule.amount;
    if (rule.target === 'hpMax') modifiers.hpMax += amount;
    if (rule.target === 'stressMax') modifiers.stressMax += amount;
    if (rule.target === 'evasion') modifiers.evasion += amount;
    if (rule.target === 'armorScore') modifiers.armorScore += amount;
    if (rule.target === 'thresholdMajor') modifiers.thresholds.major = (modifiers.thresholds.major ?? 0) + amount;
    if (rule.target === 'thresholdSevere') modifiers.thresholds.severe = (modifiers.thresholds.severe ?? 0) + amount;
    if (isTraitTarget(rule.target)) modifiers.traits[rule.target] = (modifiers.traits[rule.target] ?? 0) + amount;
  }
  return modifiers;
}

function isStatDeltaEffect(effect: FeatureRuleEffect): effect is FeatureStatDeltaEffect {
  return effect.kind === 'statDelta';
}

function isTraitTarget(target: FeatureStatDeltaEffect['target']): target is TraitId {
  return target === 'agility' || target === 'strength' || target === 'finesse' ||
    target === 'instinct' || target === 'presence' || target === 'knowledge';
}

function isPermanentFeatureSheetCard(card: CharacterSheetCard): boolean {
  return card.kind === 'classFeature' ||
    card.kind === 'ancestryFeature' ||
    card.kind === 'communityFeature' ||
    card.kind === 'subclassFeature' ||
    card.kind === 'custom';
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
    modifiers.armorScore !== 0 ||
    modifiers.hpMax !== 0 ||
    modifiers.stressMax !== 0 ||
    Object.values(modifiers.thresholds).some((value) => value !== undefined && value !== 0) ||
    Object.values(modifiers.traits).some((value) => value !== undefined && value !== 0);
}

function cloneModifiers(modifiers: CharacterEffectModifiers): CharacterEffectModifiers {
  return {
    evasion: modifiers.evasion,
    armorScore: modifiers.armorScore,
    hpMax: modifiers.hpMax,
    stressMax: modifiers.stressMax,
    thresholds: { ...modifiers.thresholds },
    traits: { ...modifiers.traits }
  };
}
