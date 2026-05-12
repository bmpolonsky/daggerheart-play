import { nowIso } from '../../core/utils/date';
import type { CharacterBeastformState, CharacterSheetCard, TraitId, Weapon } from '../rules/types';
import type { LibraryBeastform } from './types';

export function beastformToSheetCard(beastform: LibraryBeastform): Partial<CharacterSheetCard> {
  return {
    kind: 'subclassFeature',
    name: `Звериный облик: ${beastform.name}`,
    subtitle: `Ранг ${beastform.tier}${beastform.level ? ` / уровень ${beastform.level}` : ''}`,
    text: [
      beastform.summary,
      beastform.examples ? `Примеры: ${beastform.examples}` : '',
      beastform.advantages ? `Преимущества: ${beastform.advantages}` : '',
      beastform.featureText
    ].filter(Boolean).join('\n\n'),
    sourceId: beastform.sourceId ?? beastform.id
  };
}

export function beastformToWeapon(beastform: LibraryBeastform): Partial<Weapon> | null {
  if (!beastform.attackFormula) return null;
  return {
    name: `${beastform.name}: атака`,
    trait: beastform.attackTrait,
    range: beastform.attackRange,
    damageFormula: beastform.attackFormula,
    damageType: beastform.attackDamageType,
    notes: [
      `Звериный облик, ранг ${beastform.tier}`,
      beastform.traitType ? `Бонус ${beastform.traitBonus >= 0 ? '+' : ''}${beastform.traitBonus} к ${beastform.traitType}` : '',
      beastform.evasionModifier ? `Модификатор уклонения ${beastform.evasionModifier >= 0 ? '+' : ''}${beastform.evasionModifier}` : ''
    ].filter(Boolean).join('\n')
  };
}

export function beastformToActiveState(beastform: LibraryBeastform, evolutionTrait?: TraitId | null): CharacterBeastformState {
  return {
    sourceId: beastform.sourceId,
    slug: beastform.slug,
    name: beastform.name,
    tier: beastform.tier,
    level: beastform.level,
    evasionModifier: beastform.evasionModifier,
    traitType: beastform.traitType,
    traitBonus: beastform.traitBonus,
    evolutionTrait: evolutionTrait ?? null,
    attackTrait: beastform.attackTrait,
    attackRange: beastform.attackRange,
    attackFormula: beastform.attackFormula,
    attackDamageType: beastform.attackDamageType,
    featureText: [
      beastform.summary,
      beastform.advantages ? `Преимущества: ${beastform.advantages}` : '',
      beastform.featureText
    ].filter(Boolean).join('\n\n'),
    activatedAt: nowIso()
  };
}
