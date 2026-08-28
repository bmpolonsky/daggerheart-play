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
import { TRAIT_LABELS, domainLabel, rangeLabel } from '../../../../domain/rules/constants';
import type { TraitId } from '../../../../domain/rules/types';
import type { ContentLibraryView } from '../../../../services/ContentService';
import { characterService, contentService, feedService, sceneTableService } from '../../../../services/serviceRegistry';
import type { LibraryDetailAction, LibraryDetailSection, LibraryEntry } from './libraryDetailTypes';

export function buildLibraryEntries(
  libraryView: ContentLibraryView,
  targetCharacterId?: string | null,
  targetRule?: LibraryRuleEntry | null
): LibraryEntry[] {
  let entries: LibraryEntry[];
  switch (libraryView.selectedCollection) {
    case 'adversaries':
      entries = libraryView.adversaries.map(adversaryEntry);
      break;
    case 'classes':
      entries = libraryView.classes.map(classEntry);
      break;
    case 'rules': {
      const rules = targetRule && !libraryView.rules.some((item) => item.id === targetRule.id)
        ? [targetRule, ...libraryView.rules]
        : libraryView.rules;
      entries = rules.map(ruleEntry);
      break;
    }
    case 'environments':
      entries = libraryView.environments.map(environmentEntry);
      break;
    case 'equipment':
      entries = libraryView.equipment.map((item) => equipmentEntry(item, targetCharacterId));
      break;
    case 'beastforms':
      entries = libraryView.beastforms.map(beastformEntry);
      break;
    default:
      entries = libraryView.genericItems.map((item) => genericEntry(item, libraryView.selectedCollection as 'ancestries' | 'communities' | 'subclasses' | 'domainCards'));
  }

  return entries.map((entry) => ({
    ...entry,
    preview: libraryView.searchPreviews[entry.id] || entry.preview
  }));
}

function adversaryEntry(item: LibraryAdversary): LibraryEntry {
  const prepared = contentService.isAdversaryPrepared(item.id);
  const attackRange = formatRange(item.attackRange);
  const stats = [
    `Сложность ${item.difficulty}`,
    `Раны ${item.hp}`,
    item.hordePerHp ? `Противников на Рану ${item.hordePerHp}` : '',
    `Стресс ${item.stress}`,
    `Атака ${item.attackModifier >= 0 ? '+' : ''}${item.attackModifier}`,
    `${item.weaponName}: ${item.damageFormula}`,
    attackRange
  ].filter(Boolean);
  return {
    id: item.id,
    routeSlug: item.slug,
    title: item.name,
    kicker: `Ранг ${item.tier} / ${item.roleName || 'противник'}`,
    preview: item.summary || item.motives || item.mainBody,
    imageUrl: item.imageUrl,
    stats,
    sections: [],
    adversary: item,
    editable: { collection: 'adversaries', raw: item.raw, isCustom: isCustomLibrarySource(item.raw.source_slugs) },
    actions: [
      {
        label: prepared ? 'Подготовлено' : 'Подготовить',
        disabled: prepared,
        onClick: () => contentService.addAdversaryToEncounter(item.id) ? `${item.name} подготовлен` : null
      }
    ]
  };
}

function classEntry(item: LibraryClassItem): LibraryEntry {
  const stats = [`Уклонение ${item.evasion}`, `Раны ${item.hp}`];
  const sections = compactSections([
    ['Свойства', featureSections(item.raw.features)],
    ['Описание', item.body],
    ['Начальные предметы', item.classItems.join('\n')],
    ['Вопросы предыстории', item.backgroundQuestions.join('\n')],
    ['Вопросы связей', item.connectionQuestions.join('\n')]
  ]);
  return {
    id: item.id,
    routeSlug: item.slug,
    title: item.name,
    kicker: item.domains.map(domainLabel).join(' / '),
    preview: item.body,
    imageUrl: item.imageUrl,
    stats,
    sections,
    editable: { collection: 'classes', raw: item.raw, isCustom: isCustomLibrarySource(item.raw.source_slugs) },
    actions: [shareAction(item.name, sections, stats)]
  };
}

function ruleEntry(item: LibraryRuleEntry): LibraryEntry {
  const sections = compactSections([
    ['', item.body || item.summary]
  ]);
  return {
    id: item.id,
    routeSlug: item.slug,
    title: item.name,
    kicker: item.frameName || 'Правило',
    preview: item.summary || item.body,
    stats: [],
    sections,
    actions: [shareAction(item.name, sections)]
  };
}

function environmentEntry(item: LibraryEnvironment): LibraryEntry {
  const prepared = contentService.isEnvironmentPrepared(item.id);
  const stats = [`Ранг ${item.tier}`, `Сложность ${item.difficulty}`];
  const sections = compactSections([
    ['Кратко', item.summary],
    ['Свойства', item.featureText],
    ['Описание', item.body],
    ['Импульсы', item.impulses],
    ['Потенциальные противники', item.potentialAdversaries]
  ]);
  return {
    id: item.id,
    routeSlug: item.slug,
    title: item.name,
    kicker: `Ранг ${item.tier} / ${item.typeName || item.type}`,
    preview: item.summary || item.body || item.featureText,
    imageUrl: item.imageUrl,
    stats,
    sections,
    editable: { collection: 'environments', raw: item.raw, isCustom: isCustomLibrarySource(item.raw.source_slugs) },
    actions: [
      {
        label: prepared ? 'Подготовлено' : 'Подготовить',
        disabled: prepared,
        onClick: () => contentService.addEnvironmentToEncounter(item.id) ? `${item.name} подготовлено` : null
      },
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
  const traitDescription = trait ? `Характеристика ${trait}` : item.usesSpellcastTrait ? 'Заклинание' : '';
  const stats = [
    item.tier ? `Ранг ${item.tier}` : '',
    traitDescription,
    range,
    item.damageFormula,
    item.armorScore ? `Показатель брони ${item.armorScore}` : '',
    item.uses !== null ? `Использований ${item.uses}` : ''
  ].filter(Boolean);
  const sections = compactSections([
    ['Параметры', [
      item.typeName,
      item.tier ? `Ранг ${item.tier}` : '',
      traitDescription,
      item.range ? `Дистанция: ${range}` : '',
      item.damageFormula ? `Урон: ${item.damageFormula} ${damageType}` : '',
      item.burden ? `Хват: ${formatBurden(item.burden)}` : '',
      item.armorScore ? `Показатель брони: ${item.armorScore}` : '',
      item.uses !== null ? `Использований: ${item.uses}` : ''
    ].filter(Boolean).join('\n')],
    ['Свойства', item.featureText],
    ['Пороги брони', item.baseThresholds ? `Ощутимый ${item.baseThresholds.major} / Тяжелый ${item.baseThresholds.severe}` : '']
  ]);
  return {
    id: item.id,
    routeSlug: item.slug,
    title: item.name,
    kicker: item.typeName,
    preview: item.featureText,
    imageUrl: item.imageUrl,
    stats,
    sections,
    editable: { collection: 'equipment', raw: item.raw, isCustom: isCustomLibrarySource(item.raw.source_slugs) },
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
    ['Свойства', item.featureText],
    ['Кратко', item.summary],
    ['Примеры', item.examples],
    ['Преимущества', item.advantages]
  ]);
  return {
    id: item.id,
    routeSlug: item.slug,
    title: item.name,
    kicker: `Ранг ${item.tier}`,
    preview: item.summary || item.featureText,
    stats,
    sections,
    editable: { collection: 'beastforms', raw: item.raw, isCustom: isCustomLibrarySource(item.raw.source_slugs) },
    actions: [shareAction(item.name, sections, stats)]
  };
}

function genericEntry(item: GenericLibraryItem, collection: 'ancestries' | 'communities' | 'subclasses' | 'domainCards'): LibraryEntry {
  const spellcastTrait = traitLabel(item.raw.spellcast_trait);
  const cardType = domainCardTypeLabel(item.raw.card_type);
  const recallCost = domainCardRecallCost(item.raw.stress_cost);
  const stats = [
    item.level ? `Уровень ${item.level}` : '',
    cardType,
    recallCost,
    spellcastTrait ? `Заклинание: ${spellcastTrait}` : ''
  ].filter(Boolean);
  const sections = compactSections([
    ['Свойства', genericFeatureSections(item)],
    ['Описание', item.body]
  ]);
  return {
    id: item.id,
    routeSlug: item.slug,
    title: item.name,
    kicker: item.subtitle || 'Запись справочника',
    preview: item.body,
    imageUrl: item.imageUrl,
    stats,
    listStats: stats.filter((stat) => !stat.startsWith('Заклинание:')),
    sections,
    editable: { collection, raw: item.raw, isCustom: isCustomLibrarySource(item.raw.source_slugs) },
    actions: [shareAction(item.name, sections, stats)]
  };
}

function traitLabel(value: unknown): string | null {
  const key = String(value ?? '').trim().toLowerCase();
  return key in TRAIT_LABELS ? TRAIT_LABELS[key as TraitId] : null;
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
      const characters = characterService.characters$.get();
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

function isCustomLibrarySource(sourceSlugs: unknown): boolean {
  return Array.isArray(sourceSlugs) && sourceSlugs.includes('custom');
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
    titledFeatureSections('Основа', raw.foundation_features),
    titledFeatureSections('Специализация', raw.specialization_features),
    titledFeatureSections('Мастерство', raw.mastery_features)
  ].filter(Boolean).join('\n\n');
}

function titledFeatureSections(title: string, features: RawAdversaryFeature[] | undefined): string {
  const body = featureSections(features);
  return body ? `### ${title}\n${body}` : '';
}

function detailText(sections: LibraryDetailSection[], stats: string[]): string {
  const statText = stats.length > 0 ? `Параметры\n${stats.join('\n')}` : '';
  const text = [statText, ...sections.map((section) => `${section.title}\n${section.body}`)].filter(Boolean).join('\n\n');
  return text || 'Без описания.';
}

function normalizeDetailText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const formatRange = rangeLabel;

function formatDamageType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'magic' || normalized === 'magical') return 'маг.';
  if (normalized === 'physical') return 'физ.';
  if (normalized === 'direct') return 'прям.';
  if (normalized === 'mixed') return 'смеш.';
  if (normalized === 'any') return 'Любой';
  return type;
}

function formatBurden(burden: LibraryEquipmentItem['burden']): string {
  if (burden === 'one-handed') return 'Одноручное';
  if (burden === 'two-handed') return 'Двуручное';
  return '';
}

function domainCardTypeLabel(value: unknown): string {
  const type = String(value ?? '').trim().toLowerCase();
  if (type === 'spell') return 'Заклинание';
  if (type === 'ability') return 'Способность';
  if (type === 'grimoire') return 'Гримуар';
  return '';
}

function domainCardRecallCost(value: unknown): string {
  const cost = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(cost) && cost > 0 ? `Призыв: Стресс ${cost}` : '';
}

function formatTrait(trait: TraitId | null): string {
  return trait ? TRAIT_LABELS[trait] : '';
}
