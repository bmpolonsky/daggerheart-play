import type { EditableContentCollectionKey, EditableRawContent, RawAdversaryFeature } from './types';
import { cleanMarkdownValue } from '../../core/utils/markdownText';

export type CustomContentDraft = EditableRawContent & Record<string, unknown>;

export function createCustomContentDraft(collection: EditableContentCollectionKey, raw: EditableRawContent): CustomContentDraft {
  const cleanedRaw = cleanMarkdownValue(raw);
  const common = { ...cleanedRaw, name: text(cleanedRaw.name ?? cleanedRaw.title), source_slugs: ['custom'] } as CustomContentDraft;
  switch (collection) {
    case 'adversaries': return { tier: 1, type_slug: 'standard', difficulty: 12, hp: 4, stress: 0, attack_bonus: 0, damage_die_count: 1, damage_die_size: 6, damage_bonus: 0, damage_type: 'physical', features: [], ...common };
    case 'environments': return { tier: 1, difficulty: 12, type_name: 'Окружение', features: [], ...common };
    case 'classes': return { evasion: 10, hp: 6, domain_slugs: [], features: [], class_items: [], background_questions: [], connection_questions: [], ...common };
    case 'subclasses': return { foundation_features: [], specialization_features: [], mastery_features: [], ...common };
    case 'domainCards': return { level: 1, card_type: 'ability', stress_cost: 0, features: [], ...common };
    case 'equipment': return { type_slug: 'item', tier: 1, die_num: 1, die_size: 8, bonus: 0, damage_ty: 'physical', burden: 1, armor_score: 0, base_thresholds: [0, 0], features: [], ...common };
    case 'beastforms': return { tier: 1, evasion: 0, attack_trait: 'agility', attack_die: 8, attack_bonus: 0, attack_type: 'physical', features: [], ...common };
    default: return { features: [], ...common };
  }
}

export function cleanCustomContentDraft(draft: CustomContentDraft): EditableRawContent {
  const next = { ...draft };
  for (const key of ['features', 'foundation_features', 'specialization_features', 'mastery_features']) {
    if (Array.isArray(next[key])) next[key] = featureArray(next[key]).filter((feature) => text(feature.name) || text(feature.main_body ?? feature.text));
  }
  for (const key of ['class_items', 'background_questions', 'connection_questions', 'domain_slugs']) {
    if (Array.isArray(next[key])) next[key] = next[key].map((item) => text(item)).filter(Boolean);
  }
  return cleanMarkdownValue(next) as EditableRawContent;
}

export function validateCustomContentDraft(collection: EditableContentCollectionKey, draft: CustomContentDraft): string | null {
  if (!text(draft.name ?? draft.title).trim()) return 'Заполните название.';
  const range = (key: string, label: string, min: number, max = Number.POSITIVE_INFINITY, optional = false) => {
    if (optional && (draft[key] === null || draft[key] === undefined || draft[key] === '')) return null;
    const value = Number(draft[key]);
    return Number.isFinite(value) && value >= min && value <= max ? null : `${label}: допустимо от ${min}${Number.isFinite(max) ? ` до ${max}` : ''}.`;
  };
  const thresholds = (key: string) => {
    const values = draft[key];
    if (!Array.isArray(values) || values.length < 2) return null;
    const major = Number(values[0]);
    const severe = Number(values[1]);
    return major >= 0 && severe >= major ? null : 'Тяжёлый порог должен быть не меньше ощутимого.';
  };

  switch (collection) {
    case 'adversaries':
      return range('tier', 'Ранг', 1, 4) || range('difficulty', 'Сложность', 0) || range('hp', 'Раны', 1) || range('stress', 'Стресс', 0) || range('damage_die_count', 'Количество костей', 0) || range('damage_die_size', 'Грани', 0) || (text(draft.type_slug).toLowerCase() === 'horde' ? range('horde_per_hp', 'Противников на Рану', 1) : null) || thresholds('damage_thresholds');
    case 'environments': return range('tier', 'Ранг', 1, 4) || range('difficulty', 'Сложность', 0);
    case 'classes': {
      const domains = Array.isArray(draft.domain_slugs)
        ? draft.domain_slugs.map((domain) => text(domain).trim().toLowerCase()).filter(Boolean)
        : [];
      return range('evasion', 'Уклонение', 0) || range('hp', 'Раны', 1) ||
        (new Set(domains).size === 2 && domains.length === 2 ? null : 'Выберите два разных домена.');
    }
    case 'subclasses': return text(draft.class_slug).trim() ? null : 'Выберите класс.';
    case 'domainCards': return range('level', 'Уровень', 1, 10) || range('stress_cost', 'Стоимость призыва', 0);
    case 'equipment': {
      const type = text(draft.type_slug, 'item');
      const weapon = type === 'primary-weapon' || type === 'secondary-weapon' || type === 'combat-wheelchair';
      const armor = type === 'armor';
      return range('tier', 'Ранг', 1, 4) || range('uses', 'Использования', 0, Number.POSITIVE_INFINITY, true) ||
        (weapon ? range('die_num', 'Количество костей', 0) || range('die_size', 'Грани', 0) : null) ||
        (armor ? range('armor_score', 'Показатель брони', 0) || thresholds('base_thresholds') : null);
    }
    case 'beastforms': return range('tier', 'Ранг', 1, 4) || range('level', 'Уровень', 1, 10, true) || range('attack_die', 'Грани урона', 0);
    default: return null;
  }
}

function featureArray(value: unknown): RawAdversaryFeature[] {
  return Array.isArray(value)
    ? value.filter((item): item is RawAdversaryFeature => Boolean(item && typeof item === 'object')).map((item) => ({ ...item }))
    : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}
