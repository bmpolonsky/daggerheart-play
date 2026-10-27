import { Store } from '../core/store/Store';
import { changeUnifiedRollActor, createUnifiedRollDraft, resetUnifiedRollDraft, type UnifiedRollActor, type UnifiedRollActorChangeOptions, type UnifiedRollDraft, type UnifiedRollDraftInput } from '../domain/rules/unifiedRollDraft';
import { applyUnifiedFormulaEdit, setUnifiedRollEditableModifier } from '../domain/rules/unifiedRollPresentation';
import { parseManualRollModifier } from '../domain/rules/manualRollModifier';
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

  /** Formula and modifier are two editors for the same effective flat value. */
  editFormula(text: string, staticModifier = 0): void {
    this.store.update((state) => {
      if (!state.draft) return state;
      const editor = { ...emptyEditor(), ...state.editor, formulaInput: text, formulaError: null, proposal: null };
      try {
        const next = applyUnifiedFormulaEdit(state.draft, text, staticModifier);
        return { ...state, draft: next.draft, dirty: true,
          editor: { ...editor, proposal: next.requiresManual ? text : null,
            modifierInput: next.requiresManual ? editor.modifierInput : null } };
      } catch (error) {
        return { ...state, dirty: true, editor: { ...editor, formulaError: error instanceof Error ? error.message : 'Некорректная формула.' } };
      }
    });
  }

  finishFormulaEdit(): void {
    this.store.update((state) => state.editor?.formulaError || state.editor?.proposal ? state : {
      ...state, editor: { ...emptyEditor(), ...state.editor, formulaInput: null }
    });
  }

  /** Incomplete signed input is retained; it never silently replaces the last valid value. */
  editModifier(text: string): void {
    this.store.update((state) => {
      if (!state.draft) return state;
      const parsed = parseManualRollModifier(text);
      const editor = { ...emptyEditor(), ...state.editor, modifierInput: text };
      if (!parsed.valid) return { ...state, dirty: true, editor };
      try {
        return { ...state, draft: setUnifiedRollEditableModifier(state.draft, parsed.value), dirty: true,
          editor: { ...editor, formulaInput: null, formulaError: null, proposal: null } };
      } catch (error) {
        // A source formula must be corrected before its effective flat can be edited.
        return { ...state, dirty: true, editor: { ...editor, formulaError: error instanceof Error ? error.message : 'Некорректный модификатор.' } };
      }
    });
  }

  setModifier(value: number): void {
    if (!Number.isSafeInteger(value)) throw new Error('Модификатор должен быть целым числом.');
    this.editModifier(String(value));
  }

  resetDraft(): void {
    this.store.update((state) => !state.draft ? state : {
      ...state, draft: resetUnifiedRollDraft(state.draft), dirty: true, editor: emptyEditor()
    });
  }

  changeActor(actor: UnifiedRollActor, options: UnifiedRollActorChangeOptions = {}): void {
    this.store.update((state) => !state.draft ? state : {
      ...state, draft: changeUnifiedRollActor(state.draft, actor, options), dirty: true, editor: emptyEditor()
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
