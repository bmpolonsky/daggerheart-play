import { Store } from '../core/store/Store';
import { generateNames, type GeneratedName, type NameOptions } from '../domain/generators/names';

interface NameGeneratorState {
  options: NameOptions;
  results: GeneratedName[];
}

export class NameGeneratorService {
  private store: Store<NameGeneratorState>;
  readonly state$;
  private recent: GeneratedName[] = [];
  private fullNames: GeneratedName[] = [];

  constructor(private rng: () => number = Math.random) {
    const options: NameOptions = { kind: 'character', style: 'latin', gender: 'any', withSurname: false };
    this.store = new Store<NameGeneratorState>({ options, results: this.draw(options) });
    this.state$ = this.store.toStream();
  }

  configure(options: NameOptions): void {
    const current = this.store.get().options;
    if (options.kind === 'character' && current.kind === 'character'
      && options.style === current.style && options.gender === current.gender) {
      this.store.set({ options, results: this.visibleNames(options) });
      return;
    }
    this.store.set({ options, results: this.draw(options) });
  }

  selectKind(kind: NameOptions['kind']): void {
    if (kind === this.store.get().options.kind) return;
    this.configure(kind === 'character'
      ? { kind, style: 'latin', gender: 'any', withSurname: false }
      : { kind, style: 'russian' });
  }

  regenerate(): void {
    this.store.update((state) => ({ ...state, results: this.draw(state.options) }));
  }

  private draw(options: NameOptions): GeneratedName[] {
    this.fullNames = generateNames(options.kind === 'character' ? { ...options, withSurname: true } : options,
      { previous: this.recent }, this.rng);
    this.recent = [...this.recent, ...this.fullNames].slice(-200);
    return this.visibleNames(options);
  }

  private visibleNames(options: NameOptions): GeneratedName[] {
    return options.kind === 'character' && !options.withSurname
      ? this.fullNames.map((value) => ({ ...value, surname: '' }))
      : this.fullNames;
  }
}
