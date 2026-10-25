import { Store } from '../core/store/Store';
import { createUnifiedRollDraft, type UnifiedRollDraft, type UnifiedRollDraftInput } from '../domain/rules/unifiedRollDraft';
import { gameStore } from '../stores/gameStores';

export interface UnifiedRollDraftState {
  draft: UnifiedRollDraft | null;
  pending: UnifiedRollDraft | null;
  dirty: boolean;
  openRequest: number;
  editor?: UnifiedRollEditorState;
}

export interface UnifiedRollEditorState {
  formulaInput: string | null;
  formulaError: string | null;
  proposal: string | null;
  modifierInput: string | null;
}

export class UnifiedRollDraftService {
  private scopeProvider: () => string = defaultScopeKey;
  private store = new Store<UnifiedRollDraftState>({ draft: null, pending: null, dirty: false, openRequest: 0, editor: emptyEditor() });
  readonly state$ = this.store.toStream();

  setScopeProvider(provider: () => string): () => void {
    this.scopeProvider = provider;
    return () => { if (this.scopeProvider === provider) this.scopeProvider = defaultScopeKey; };
  }

  currentScopeKey(): string {
    return this.scopeProvider();
  }

  request(input: UnifiedRollDraftInput): void {
    const draft = createUnifiedRollDraft({ ...input, scopeKey: input.scopeKey ?? this.currentScopeKey() });
    this.store.update((state) => state.draft && state.dirty
      ? { ...state, pending: draft, openRequest: state.openRequest + 1 }
      : { draft, pending: null, dirty: false, openRequest: state.openRequest + 1, editor: emptyEditor() });
  }

  update(patch: Partial<UnifiedRollDraft> | ((draft: UnifiedRollDraft) => UnifiedRollDraft)): void {
    this.store.update((state) => !state.draft ? state : {
      ...state,
      draft: typeof patch === 'function' ? patch(state.draft) : { ...state.draft, ...patch },
      dirty: true
    });
  }

  choosePending(replace: boolean): void {
    this.store.update((state) => !state.pending ? state : replace
      ? { ...state, draft: state.pending, pending: null, dirty: false, editor: emptyEditor() }
      : { ...state, pending: null });
  }

  markRolled(): void {
    this.store.update((state) => ({ ...state, dirty: false }));
  }

  setEditor(patch: Partial<UnifiedRollEditorState>): void {
    this.store.update((state) => Object.entries(patch).every(([key, value]) => state.editor?.[key as keyof UnifiedRollEditorState] === value) ? state : ({
      ...state,
      editor: { ...emptyEditor(), ...state.editor, ...patch },
      dirty: state.dirty || Boolean(state.draft)
    }));
  }

  clear(): void {
    this.store.update((state) => ({ draft: null, pending: null, dirty: false, openRequest: state.openRequest, editor: emptyEditor() }));
  }
}

export const unifiedRollDraftService = new UnifiedRollDraftService();

function defaultScopeKey(): string {
  return gameStore.get().id;
}

function emptyEditor(): UnifiedRollEditorState {
  return { formulaInput: null, formulaError: null, proposal: null, modifierInput: null };
}
