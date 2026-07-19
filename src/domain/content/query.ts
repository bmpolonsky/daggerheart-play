import type {
  GenericLibraryItem,
  LibraryAdversary,
  LibraryBeastform,
  LibraryClassItem,
  LibraryEnvironment,
  LibraryEquipmentItem,
  LibraryRuleEntry
} from './types';

export interface LibraryQueryInput {
  query: string;
  adversaries: LibraryAdversary[];
  classes: LibraryClassItem[];
  references: GenericLibraryItem[];
  domainCards: GenericLibraryItem[];
  equipment: LibraryEquipmentItem[];
  rules: LibraryRuleEntry[];
  environments: LibraryEnvironment[];
  beastforms: LibraryBeastform[];
}

export interface LibraryQueryResult {
  adversaries: LibraryAdversary[];
  classes: LibraryClassItem[];
  references: GenericLibraryItem[];
  domainCards: GenericLibraryItem[];
  equipment: LibraryEquipmentItem[];
  rules: LibraryRuleEntry[];
  environments: LibraryEnvironment[];
  beastforms: LibraryBeastform[];
}

const LIMITS = {
  adversaries: 24,
  classes: 9,
  references: 12,
  domainCards: 12,
  equipment: 12,
  rules: 80,
  environments: 12,
  beastforms: 12
} as const;

export function queryLibraryContent(input: LibraryQueryInput): LibraryQueryResult {
  const query = normalizeSearch(input.query);
  return {
    adversaries: filterLimit(input.adversaries, query, adversarySearchText, LIMITS.adversaries),
    classes: filterLimit(input.classes, query, classSearchText, LIMITS.classes),
    references: filterLimit(input.references, query, genericSearchText, LIMITS.references),
    domainCards: filterLimit(input.domainCards, query, genericSearchText, LIMITS.domainCards),
    equipment: filterLimit(input.equipment, query, equipmentSearchText, LIMITS.equipment),
    rules: filterLimit(input.rules, query, ruleSearchText, LIMITS.rules),
    environments: filterLimit(input.environments, query, environmentSearchText, LIMITS.environments),
    beastforms: filterLimit(input.beastforms, query, beastformSearchText, LIMITS.beastforms)
  };
}

function filterLimit<T>(items: T[], query: string, searchText: (item: T) => string, limit: number): T[] {
  return items
    .filter((item) => (query ? normalizeSearch(searchText(item)).includes(query) : true))
    .slice(0, limit);
}

function adversarySearchText(item: LibraryAdversary): string {
  return [item.name, item.roleName, item.summary, item.motives, item.experiencesText, rawFeaturesText(item.raw.features)].join(' ');
}

function classSearchText(item: LibraryClassItem): string {
  return [item.name, item.domains.join(' '), item.body, rawFeaturesText(item.raw.features)].join(' ');
}

function genericSearchText(item: GenericLibraryItem): string {
  return [item.name, item.subtitle, item.body, rawFeaturesText([
    ...(item.raw.features ?? []),
    ...(item.raw.foundation_features ?? []),
    ...(item.raw.specialization_features ?? []),
    ...(item.raw.mastery_features ?? [])
  ])].join(' ');
}

function equipmentSearchText(item: LibraryEquipmentItem): string {
  return [item.name, item.typeName, item.featureText].join(' ');
}

function ruleSearchText(item: LibraryRuleEntry): string {
  return [item.name, item.summary, item.body, item.frameName ?? ''].join(' ');
}

function environmentSearchText(item: LibraryEnvironment): string {
  return [item.name, item.typeName, item.summary, item.impulses, item.potentialAdversaries].join(' ');
}

function beastformSearchText(item: LibraryBeastform): string {
  return [item.name, item.summary, item.examples, item.advantages, item.featureText].join(' ');
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function rawFeaturesText(features: Array<{ name?: unknown; main_body?: unknown; text?: unknown }> | undefined): string {
  if (!Array.isArray(features)) return '';
  return features.map((feature) => [feature.name, feature.main_body ?? feature.text].filter((value) => typeof value === 'string').join(' ')).join(' ');
}
