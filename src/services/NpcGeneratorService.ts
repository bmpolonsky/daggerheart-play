import { Store } from '../core/store/Store';
import type { StreamLike } from '../core/store/Stream';
import { buildNpcCatalog, generateNpc, rerollNpcField, type GeneratedNpc, type NpcField } from '../domain/generators/npc';
import type { GameState } from '../domain/rules/types';
import type { ContentService } from './ContentService';

interface NpcGeneratorState {
  npc: GeneratedNpc | null;
  status: 'loading' | 'ready' | 'empty' | 'error';
}

export class NpcGeneratorService {
  private store = new Store<NpcGeneratorState>({ npc: null, status: 'loading' });
  readonly state$ = this.store.toStream();
  private gameId: string | null = null;

  constructor(
    private contentService: Pick<ContentService, 'content$' | 'ensureLoaded' | 'reload'>,
    private game$: StreamLike<Pick<GameState, 'id' | 'includeVoidContent'>>,
    private rng: () => number = Math.random
  ) {}

  connect(): () => void {
    const sync = () => this.sync();
    const stopContent = this.contentService.content$.subscribe(sync);
    const stopGame = this.game$.subscribe(sync);
    this.contentService.ensureLoaded();
    this.sync();
    return () => { stopContent(); stopGame(); };
  }

  regenerate(): void {
    this.sync(true);
  }

  reroll(field: NpcField): void {
    this.sync();
    const current = this.store.get();
    if (current.status !== 'ready' || !current.npc) return;
    const catalog = buildNpcCatalog(this.contentService.content$.get().generic, this.game$.get().includeVoidContent);
    const npc = rerollNpcField(current.npc, catalog, field, this.rng);
    if (npc !== current.npc) this.store.set({ ...current, npc });
  }

  reload(): Promise<void> {
    return this.contentService.reload();
  }

  private sync(regenerate = false): void {
    const content = this.contentService.content$.get();
    const game = this.game$.get();
    const current = this.store.get();
    const catalog = buildNpcCatalog(content.generic, game.includeVoidContent);
    const status = content.isLoading || (!content.lastLoadedAt && !content.error) ? 'loading'
      : content.error ? 'error'
      : !catalog.ancestries.length || !catalog.communities.length ? 'empty' : 'ready';
    let npc = game.id === this.gameId ? current.npc : null;
    this.gameId = game.id;
    if (status === 'empty') npc = null;
    if (status === 'ready' && (regenerate || !npc
      || !catalog.ancestries.some((item) => item.id === npc!.ancestry.id)
      || !catalog.communities.some((item) => item.id === npc!.community.id))) {
      npc = generateNpc(catalog, this.rng, npc ?? undefined);
    }
    if (npc !== current.npc || status !== current.status) this.store.set({ npc, status });
  }
}
