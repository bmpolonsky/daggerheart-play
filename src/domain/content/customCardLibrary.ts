import type { GameCustomContent } from '../game/gameDocument';
import type { RawContentItem } from './types';

export interface RawCustomCardCollections {
  ancestries: RawContentItem[];
  communities: RawContentItem[];
  subclasses: RawContentItem[];
  domainCards: RawContentItem[];
}

export function readRawCustomCardCollections(content: Pick<GameCustomContent, 'ancestries' | 'communities' | 'subclasses' | 'domainCards'>): RawCustomCardCollections {
  return {
    ancestries: readRawCollection(content.ancestries),
    communities: readRawCollection(content.communities),
    subclasses: readRawCollection(content.subclasses),
    domainCards: readRawCollection(content.domainCards)
  };
}

function readRawCollection(values: unknown[]): RawContentItem[] {
  return values.filter(isRawContentItem);
}

function isRawContentItem(value: unknown): value is RawContentItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === 'string' && item.name.trim().length > 0;
}
