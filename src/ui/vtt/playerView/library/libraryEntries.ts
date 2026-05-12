import type {
  GenericLibraryItem,
  LibraryAdversary,
  LibraryBeastform,
  LibraryClassItem,
  LibraryEnvironment,
  LibraryEquipmentItem,
  LibraryRuleEntry,
  RawAdversaryFeature
} from '../../../../domain/content/types';
import { RANGE_LABELS, TRAIT_LABELS, domainLabel } from '../../../../domain/rules/constants';
import type { TraitId } from '../../../../domain/rules/types';
import type { ContentLibraryView } from '../../../../services/ContentService';
import { characterService, contentService, feedService, sceneTableService } from '../../../../services/serviceRegistry';
import type { LibraryDetailAction, LibraryDetailSection, LibraryEntry } from './libraryDetailTypes';

export function buildLibraryEntries(libraryView: ContentLibraryView, targetCharacterId?: string | null): LibraryEntry[] {
  if (libraryView.selectedCollection === 'adversaries') return libraryView.adversaries.map(adversaryEntry);
  if (libraryView.selectedCollection === 'classes') return libraryView.classes.map(classEntry);
  if (libraryView.selectedCollection === 'rules') return libraryView.rules.map(ruleEntry);
  if (libraryView.selectedCollection === 'environments') return libraryView.environments.map(environmentEntry);
  if (libraryView.selectedCollection === 'equipment') return libraryView.equipment.map((item) => equipmentEntry(item, targetCharacterId));
  if (libraryView.selectedCollection === 'beastforms') return libraryView.beastforms.map(beastformEntry);
  return libraryView.genericItems.map(genericEntry);
}

function adversaryEntry(item: LibraryAdversary): LibraryEntry {
  const attackRange = formatRange(item.attackRange);
  const damageType = formatDamageType(item.damageType);
  const stats = [
    `Сложность ${item.difficulty}`,
    `Раны ${item.hp}`,
    `Стресс ${item.stress}`,
    `Атака ${item.attackModifier >= 0 ? '+' : ''}${item.attackModifier}`,
    `${item.weaponName}: ${item.damageFormula}`,
    attackRange
  ].filter(Boolean);
  const sections = compactSections([
    ['Кратко', item.summary],
    ['Боевые параметры', [
      `Роль: ${item.roleName || item.type}`,
      `Сложность: ${item.difficulty}`,
      `Раны: ${item.hp}`,
      `Стресс: ${item.stress}`,
      `Пороги: ${item.thresholds.major} / ${item.thresholds.severe}`,
      `ATK: ${item.attackModifier >= 0 ? '+' : ''}${item.attackModifier}`,
      `Атака: ${item.weaponName}`,
      `Урон: ${item.damageFormula} ${damageType}`,
      `Дистанция: ${attackRange}`
    ].join('\n')],
    ['Мотивы и тактика', item.motives],
    ['Опыт', item.experiencesText],
    ['Описание', item.mainBody],
    ['Особенности', featureSections(item.raw.features)]
  ]);
  return {
    id: item.id,
    title: item.name,
    kicker: `Ранг ${item.tier} / ${item.roleName || 'противник'}`,
    preview: item.summary || item.motives || item.mainBody,
    imageUrl: item.imageUrl,
    stats,
    sections,
    actions: [
      {
        label: 'Добавить в столкновение',
        onClick: () => contentService.addAdversaryToEncounter(item.id) ? `${item.name} добавлен в список столкновения` : null
      }
    ]
  };
}

function classEntry(item: LibraryClassItem): LibraryEntry {
  const stats = [`Уклонение ${item.evasion}`, `Раны ${item.hp}`];
  const sections = compactSections([
    ['Описание', item.body],
    ['Особенности', featureSections(item.raw.features)],
    ['Предметы класса', item.classItems.join('\n')],
    ['Вопросы предыстории', item.backgroundQuestions.join('\n')],
    ['Вопросы связей', item.connectionQuestions.join('\n')]
  ]);
  return {
    id: item.id,
    title: item.name,
    kicker: item.domains.map(domainLabel).join(' / '),
    preview: item.body,
    imageUrl: item.imageUrl,
    stats,
    sections,
    actions: [shareAction(item.name, sections, stats)]
  };
}

function ruleEntry(item: LibraryRuleEntry): LibraryEntry {
  const sections = compactSections([
    ['Правило', item.body || item.summary]
  ]);
  return {
    id: item.id,
    title: item.name,
    kicker: item.frameName || 'Правило',
    preview: item.summary || item.body,
    stats: [],
    sections,
    actions: [shareAction(item.name, sections)]
  };
}

function environmentEntry(item: LibraryEnvironment): LibraryEntry {
  const stats = [`Ранг ${item.tier}`, `Сложность ${item.difficulty}`];
  const sections = compactSections([
    ['Кратко', item.summary],
    ['Описание', item.body],
    ['Особенности', item.featureText],
    ['Импульсы', item.impulses],
    ['Потенциальные противники', item.potentialAdversaries]
  ]);
  return {
    id: item.id,
    title: item.name,
    kicker: `Ранг ${item.tier} / ${item.typeName || item.type}`,
    preview: item.summary || item.body || item.featureText,
    imageUrl: item.imageUrl,
    stats,
    sections,
    actions: [
      {
        label: 'Создать сцену',
        onClick: () => {
          sceneTableService.createScene({ name: item.name, subtitle: item.summary, backgroundUrl: item.imageUrl ?? '', notes: item.body });
          return `Сцена создана: ${item.name}`;
        }
      }
    ]
  };
}

function equipmentEntry(item: LibraryEquipmentItem, targetCharacterId?: string | null): LibraryEntry {
  const range = formatRange(item.range);
  const damageType = formatDamageType(item.damageType);
  const trait = formatTrait(item.trait);
  const stats = [
    item.tier ? `Ранг ${item.tier}` : '',
    trait ? `Характеристика ${trait}` : '',
    range,
    item.damageFormula,
    item.armorScore ? `Броня ${item.armorScore}` : ''
  ].filter(Boolean);
  const sections = compactSections([
    ['Параметры', [
      item.typeName,
      item.tier ? `Ранг ${item.tier}` : '',
      trait ? `Характеристика: ${trait}` : '',
      item.range ? `Дистанция: ${range}` : '',
      item.damageFormula ? `Урон: ${item.damageFormula} ${damageType}` : '',
      item.burden ? `Занятость: ${item.burden}` : '',
      item.armorScore ? `Броня: ${item.armorScore}` : ''
    ].filter(Boolean).join('\n')],
    ['Описание', item.featureText],
    ['Пороги брони', item.baseThresholds ? `Ощутимый ${item.baseThresholds.major} / Тяжелый ${item.baseThresholds.severe}` : '']
  ]);
  return {
    id: item.id,
    title: item.name,
    kicker: item.typeName,
    preview: item.featureText,
    imageUrl: item.imageUrl,
    stats,
    sections,
    actions: [equipmentAction(item, targetCharacterId), shareAction(item.name, sections, stats)]
  };
}

function beastformEntry(item: LibraryBeastform): LibraryEntry {
  const attackRange = formatRange(item.attackRange);
  const damageType = formatDamageType(item.attackDamageType);
  const trait = formatTrait(item.traitType);
  const stats = [
    item.level ? `Уровень ${item.level}` : '',
    `Уклонение ${item.evasionModifier >= 0 ? '+' : ''}${item.evasionModifier}`,
    item.attackFormula,
    attackRange
  ].filter(Boolean);
  const sections = compactSections([
    ['Параметры', [
      `Ранг ${item.tier}`,
      item.level ? `Уровень ${item.level}` : '',
      `Уклонение: ${item.evasionModifier >= 0 ? '+' : ''}${item.evasionModifier}`,
      item.attackFormula ? `Атака: ${item.attackFormula} ${damageType}` : '',
      item.attackRange ? `Дистанция: ${attackRange}` : '',
      trait ? `Характеристика: ${trait} ${item.traitBonus >= 0 ? '+' : ''}${item.traitBonus}` : ''
    ].filter(Boolean).join('\n')],
    ['Кратко', item.summary],
    ['Примеры', item.examples],
    ['Преимущества', item.advantages],
    ['Особенности', item.featureText]
  ]);
  return {
    id: item.id,
    title: item.name,
    kicker: `Ранг ${item.tier}`,
    preview: item.summary || item.featureText,
    stats,
    sections,
    actions: [shareAction(item.name, sections, stats)]
  };
}

function genericEntry(item: GenericLibraryItem): LibraryEntry {
  const stats = item.level ? [`Уровень ${item.level}`] : [];
  const sections = compactSections([
    ['Описание', item.body],
    ['Особенности', genericFeatureSections(item)]
  ]);
  return {
    id: item.id,
    title: item.name,
    kicker: item.subtitle || 'Запись справочника',
    preview: item.body,
    imageUrl: item.imageUrl,
    stats,
    sections,
    actions: [shareAction(item.name, sections, stats)]
  };
}

function shareAction(title: string, sections: LibraryDetailSection[], stats: string[] = []): LibraryDetailAction {
  return {
    label: 'Показать игрокам',
    onClick: () => {
      feedService.addSystem(title, detailText(sections, stats));
      return `${title} отправлено игрокам`;
    }
  };
}

function equipmentAction(item: LibraryEquipmentItem, targetCharacterId?: string | null): LibraryDetailAction {
  return {
    label: equipmentActionLabel(item),
    onClick: () => {
      const characters = characterService.charactersStore.getSnapshot();
      const characterId = targetCharacterId && characters.entities[targetCharacterId] ? targetCharacterId : null;
      const character = characterId ? characters.entities[characterId] : null;
      if (!character) return 'Выберите персонажа';
      const result = characterService.addEquipmentItem(character.id, item);
      if (!result) return null;
      return [equipmentActionMessage(item, character.name), ...result.warnings].join(' ');
    }
  };
}

function equipmentActionLabel(item: LibraryEquipmentItem): string {
  if (item.type === 'armor') return 'Надеть';
  if (item.type === 'primary-weapon' || item.type === 'secondary-weapon') return 'Экипировать';
  return 'В инвентарь';
}

function equipmentActionMessage(item: LibraryEquipmentItem, characterName: string): string {
  if (item.type === 'armor') return `${item.name} надето: ${characterName}`;
  if (item.type === 'primary-weapon' || item.type === 'secondary-weapon') return `${item.name} экипировано: ${characterName}`;
  return `${item.name} добавлено в инвентарь: ${characterName}`;
}

function compactSections(sections: Array<[string, string]>): LibraryDetailSection[] {
  return sections
    .map(([title, body]) => ({ title, body: normalizeDetailText(body) }))
    .filter((section) => section.body.length > 0);
}

function featureSections(features: RawAdversaryFeature[] | undefined): string {
  if (!Array.isArray(features)) return '';
  return features
    .map((feature) => {
      const title = normalizeDetailText(feature.name ?? '');
      const body = normalizeDetailText(feature.main_body ?? feature.text ?? '');
      if (!title) return body;
      if (!body) return `### ${title}`;
      return `### ${title}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function genericFeatureSections(item: GenericLibraryItem): string {
  const raw = item.raw;
  return [
    featureSections(raw.features),
    featureSections(raw.foundation_features),
    featureSections(raw.specialization_features),
    featureSections(raw.mastery_features)
  ].filter(Boolean).join('\n\n');
}

function detailText(sections: LibraryDetailSection[], stats: string[]): string {
  const statText = stats.length > 0 ? `Параметры\n${stats.join('\n')}` : '';
  const text = [statText, ...sections.map((section) => `${section.title}\n${section.body}`)].filter(Boolean).join('\n\n');
  return text || 'Описание отсутствует в импортированных данных.';
}

function normalizeDetailText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatRange(range: string): string {
  const compact = range.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const byCompact: Record<string, string> = {
    melee: 'Вплотную',
    veryclose: 'Близко',
    close: 'Средне',
    far: 'Далеко',
    veryfar: 'Очень далеко',
    any: 'Любая'
  };
  return byCompact[compact] ?? RANGE_LABELS[range] ?? range;
}

function formatDamageType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'magic' || normalized === 'magical') return 'маг.';
  if (normalized === 'physical') return 'физ.';
  if (normalized === 'direct') return 'прям.';
  if (normalized === 'mixed') return 'смеш.';
  if (normalized === 'any') return 'Любой';
  return type;
}

function formatTrait(trait: TraitId | null): string {
  return trait ? TRAIT_LABELS[trait] : '';
}
