declare module '@3d-dice/dice-box-threejs' {
  export interface DiceBoxRollResult {
    notation: string;
    sets: Array<{
      num: number;
      type: string;
      sides: number;
      rolls: Array<{ value: number; [key: string]: unknown }>;
      total: number;
    }>;
    modifier: number;
    total: number;
  }

  export interface DiceBoxOptions {
    assetPath?: string;
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    shadows?: boolean;
    color_spotlight?: number;
    theme_surface?: string;
    theme_colorset?: string;
    theme_customColorset?: {
      name: string;
      foreground: string;
      background: string | string[];
      outline?: string;
      texture?: string;
      material?: string;
      description?: string;
      category?: string;
    } | null;
    theme_texture?: string;
    theme_material?: 'none' | 'metal' | 'wood' | 'glass' | 'plastic' | string;
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
    onRollComplete?: (result: DiceBoxRollResult) => void;
  }

  export default class DiceBox {
    constructor(selector: string, options?: DiceBoxOptions);
    initialize(): Promise<void>;
    roll(notation: string): Promise<DiceBoxRollResult>;
    clearDice(): void;
  }
}
