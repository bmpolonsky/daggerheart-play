import type {
  GenericLibraryItem,
  LibraryAdversary,
  LibraryBeastform,
  LibraryClassItem,
  LibraryEnvironment,
  LibraryEquipmentItem,
  LibraryRuleEntry
} from './types';
import { contentSearchDocuments, rankContentSearch } from './search';

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
  return {
    adversaries: searchLimit(input.adversaries, input.query, contentSearchDocuments.adversary, LIMITS.adversaries),
    classes: searchLimit(input.classes, input.query, contentSearchDocuments.classItem, LIMITS.classes),
    references: searchLimit(input.references, input.query, contentSearchDocuments.generic, LIMITS.references),
    domainCards: searchLimit(input.domainCards, input.query, contentSearchDocuments.generic, LIMITS.domainCards),
    equipment: searchLimit(input.equipment, input.query, contentSearchDocuments.equipment, LIMITS.equipment),
    rules: searchLimit(input.rules, input.query, contentSearchDocuments.rule, LIMITS.rules),
    environments: searchLimit(input.environments, input.query, contentSearchDocuments.environment, LIMITS.environments),
    beastforms: searchLimit(input.beastforms, input.query, contentSearchDocuments.beastform, LIMITS.beastforms)
  };
}

function searchLimit<T>(
  items: T[],
  query: string,
  documentFor: Parameters<typeof rankContentSearch<T>>[2],
  limit: number
): T[] {
  return rankContentSearch(items, query, documentFor)
    .map((match) => match.item)
    .slice(0, limit);
}
