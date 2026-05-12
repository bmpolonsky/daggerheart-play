import DiceBox from '@3d-dice/dice-box-threejs';
import type { DiceRendererOptions, PolyhedralDiceRoll, PolyhedralDieVisual } from './types';
import { diceBoxNotationForRoll } from './diceBoxNotation';

const DICE_BOX_ASSET_PATH = './';
type DiceBoxCustomColorset = NonNullable<ConstructorParameters<typeof DiceBox>[1]>['theme_customColorset'];

export class PolyhedralDiceRenderer {
  private readonly layout: HTMLDivElement;
  private renderers: SinglePolyhedralDiceRenderer[] = [];
  private disposed = false;

  constructor(
    container: HTMLElement,
    roll: PolyhedralDiceRoll,
    private readonly options: DiceRendererOptions = {}
  ) {
    container.replaceChildren();
    this.layout = document.createElement('div');
    this.layout.className = 'dice-box-polyhedral-layout';
    container.append(this.layout);
    this.renderRoll(roll);
  }

  setRoll(roll: PolyhedralDiceRoll): void {
    this.renderRoll(roll);
  }

  dispose(): void {
    this.disposed = true;
    this.clearRenderers();
    this.layout.remove();
  }

  private renderRoll(roll: PolyhedralDiceRoll): void {
    if (this.disposed) return;
    this.clearRenderers();
    this.layout.replaceChildren();
    const groups = diceGroupsForRoll(roll);
    if (groups.length === 0) return;
    this.layout.style.gridTemplateColumns = `repeat(${groups.length}, minmax(0, 1fr))`;
    const completionOptions = groupCompletionOptions(roll.id, groups.length, this.options);
    groups.forEach((group) => {
      const host = document.createElement('div');
      host.className = `dice-box-polyhedral-group dice-box-polyhedral-group--${group.tone}`;
      this.layout.append(host);
      this.renderers.push(new SinglePolyhedralDiceRenderer(host, {
        ...roll,
        id: `${roll.id}-${group.tone}`,
        tone: group.tone,
        dice: group.dice
      }, completionOptions));
    });
  }

  private clearRenderers(): void {
    this.renderers.forEach((renderer) => renderer.dispose());
    this.renderers = [];
  }
}

class SinglePolyhedralDiceRenderer {
  private readonly host: HTMLDivElement;
  private readonly selectorId: string;
  private readonly box: DiceBox;
  private readonly ready: Promise<void>;
  private disposed = false;
  private pendingRoll: PolyhedralDiceRoll | null;

  constructor(
    container: HTMLElement,
    roll: PolyhedralDiceRoll,
    private readonly options: DiceRendererOptions = {}
  ) {
    this.selectorId = `dh-dice-box-${roll.id.replace(/[^a-zA-Z0-9_-]/g, '-')}-${Math.random().toString(36).slice(2)}`;
    container.replaceChildren();
    this.pendingRoll = roll;
    this.host = document.createElement('div');
    this.host.id = this.selectorId;
    this.host.className = 'dice-box-threejs-host';
    container.append(this.host);
    this.box = new DiceBox(`#${this.selectorId}`, {
      assetPath: DICE_BOX_ASSET_PATH,
      sounds: false,
      shadows: true,
      color_spotlight: 0xfff1c8,
      theme_surface: 'default',
      theme_texture: '',
      theme_material: 'glass',
      theme_colorset: 'white',
      theme_customColorset: colorsetFor(roll),
      gravity_multiplier: this.options.reducedMotion ? 140 : 420,
      light_intensity: 1.08,
      baseScale: 128,
      strength: this.options.reducedMotion ? 0.62 : 1.18
    });
    disableDiceBoxBumpMapping(this.box);
    this.ready = this.box.initialize().then(() => this.flushPendingRoll());
  }

  setRoll(roll: PolyhedralDiceRoll): void {
    this.pendingRoll = roll;
    void this.ready.then(() => this.flushPendingRoll());
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.box.clearDice();
    } catch {
      // The third-party renderer has no formal dispose API.
    }
    this.host.replaceChildren();
    this.host.remove();
  }

  private async rollNow(roll: PolyhedralDiceRoll): Promise<void> {
    if (this.disposed) return;
    const notation = diceBoxNotationForRoll(roll);
    if (!notation) return;
    await this.box.roll(notation);
    if (!this.disposed) {
      this.options.onComplete?.(roll.id);
    }
  }

  private async flushPendingRoll(): Promise<void> {
    if (this.disposed || !this.pendingRoll) return;
    const roll = this.pendingRoll;
    this.pendingRoll = null;
    await this.rollNow(roll);
  }
}

function groupCompletionOptions(rollId: string, count: number, options: DiceRendererOptions): DiceRendererOptions {
  if (!options.onComplete) return options;
  let remaining = count;
  return {
    ...options,
    onComplete: () => {
      remaining -= 1;
      if (remaining <= 0) {
        options.onComplete?.(rollId);
      }
    }
  };
}

function diceGroupsForRoll(roll: PolyhedralDiceRoll): Array<{ tone: NonNullable<PolyhedralDieVisual['tone']>; dice: PolyhedralDieVisual[] }> {
  const groups = new Map<NonNullable<PolyhedralDieVisual['tone']>, PolyhedralDieVisual[]>();
  roll.dice.forEach((die) => {
    const tone = roll.isCritical ? 'critical' : die.tone ?? roll.tone ?? 'neutral';
    const current = groups.get(tone) ?? [];
    current.push({ ...die, tone });
    groups.set(tone, current);
  });
  return [...groups.entries()].map(([tone, dice]) => ({ tone, dice }));
}

function disableDiceBoxBumpMapping(box: DiceBox): void {
  (box as DiceBox & { DiceFactory?: { setBumpMapping?: (enabled: boolean) => void } }).DiceFactory?.setBumpMapping?.(false);
}

function colorsetFor(roll: PolyhedralDiceRoll): DiceBoxCustomColorset {
  const tone = roll.isCritical ? 'critical' : roll.tone ?? roll.dice[0]?.tone ?? 'neutral';
  const colors: Record<string, DiceBoxCustomColorset> = {
    hope: {
      name: 'dh-hope-yellow',
      foreground: '#231707',
      background: ['#ffcb5e', '#ffcb5e', '#ffcb5e'],
      outline: 'none',
      texture: 'none',
      material: 'glass',
      description: 'Daggerheart Hope'
    },
    fear: {
      name: 'dh-fear-purple',
      foreground: '#fff7ff',
      background: ['#7654e8', '#7654e8', '#7654e8'],
      outline: '#24005f',
      texture: 'none',
      material: 'glass',
      description: 'Daggerheart Fear'
    },
    damage: {
      name: 'dh-damage-red',
      foreground: '#fff4ec',
      background: ['#b72a36', '#b72a36', '#b72a36'],
      outline: '#3f0710',
      texture: 'none',
      material: 'glass',
      description: 'Daggerheart Damage'
    },
    advantage: {
      name: 'dh-advantage-green',
      foreground: '#082612',
      background: ['#67d982', '#67d982', '#67d982'],
      outline: 'none',
      texture: 'none',
      material: 'glass',
      description: 'Daggerheart Advantage'
    },
    disadvantage: {
      name: 'dh-disadvantage-red',
      foreground: '#fff7ff',
      background: ['#ef6a6a', '#ef6a6a', '#ef6a6a'],
      outline: '#7a1717',
      texture: 'none',
      material: 'glass',
      description: 'Daggerheart Disadvantage'
    },
    critical: {
      name: 'dh-critical-gold',
      foreground: '#211407',
      background: ['#f7cf5a', '#f7cf5a', '#f7cf5a'],
      outline: 'none',
      texture: 'none',
      material: 'glass',
      description: 'Daggerheart Critical'
    },
    neutral: {
      name: 'dh-neutral-stone',
      foreground: '#16130f',
      background: ['#f4f2ff', '#f4f2ff', '#f4f2ff'],
      outline: 'none',
      texture: 'none',
      material: 'glass',
      description: 'Daggerheart Neutral'
    }
  };
  return colors[tone] ?? colors.neutral;
}
