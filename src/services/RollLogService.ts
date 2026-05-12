import { createId } from '../core/utils/id';
import { nowIso } from '../core/utils/date';
import type { DomainCardRecord, FeedActorReference, ManualLogEntry, RollLogEntry, RollPublication } from '../domain/rules/types';
import type { TableVisibility } from '../domain/tabletop/types';
import { rollLogStore } from '../stores/gameStores';
import { FeedService } from './FeedService';

const MAX_LOG_ENTRIES = 200;

interface ManualLogOptions {
  authorName?: string;
  visibility?: TableVisibility;
  publication?: RollPublication;
  feedType?: 'message' | 'system' | 'card';
  card?: DomainCardRecord;
  actor?: FeedActorReference;
  skipFeed?: boolean;
}

export class RollLogService {
  readonly rollLogStore = rollLogStore;
  private readonly feedService = new FeedService();

  append(entry: RollLogEntry): void {
    rollLogStore.update((log) => [entry, ...log].slice(0, MAX_LOG_ENTRIES));
  }

  addManual(title: string, text: string, options: ManualLogOptions = {}): ManualLogEntry {
    const entry: ManualLogEntry = {
      id: createId('log'),
      type: 'manual',
      createdAt: nowIso(),
      title: title || 'Заметка',
      text
    };
    this.append(entry);
    if (!options.skipFeed) {
      if (options.feedType === 'system') {
        this.feedService.addSystem(title || 'Событие игры', text, { visibility: options.visibility, publication: options.publication });
      } else if (options.feedType === 'card' && options.card) {
        this.feedService.addCard(options.authorName ?? title, options.card, text, { title, visibility: options.visibility, publication: options.publication, actor: options.actor });
      } else {
        this.feedService.addMessage(options.authorName ?? title, text, { title, visibility: options.visibility, publication: options.publication });
      }
    }
    return entry;
  }

  clear(): void {
    rollLogStore.set([]);
  }
}
