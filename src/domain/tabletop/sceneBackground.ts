export type SceneBackgroundFit = 'fit' | 'fill';

export interface SceneBackgroundFraming {
  fit: SceneBackgroundFit;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_SCENE_BACKGROUND_FRAMING: Readonly<SceneBackgroundFraming> = Object.freeze({
  fit: 'fill',
  zoom: 1,
  offsetX: 0,
  offsetY: 0
});

export function normalizeSceneBackgroundFraming(value: Partial<SceneBackgroundFraming> | null | undefined): SceneBackgroundFraming {
  return {
    fit: value?.fit === 'fit' ? 'fit' : 'fill',
    zoom: clampFinite(value?.zoom, 1, 2.5, DEFAULT_SCENE_BACKGROUND_FRAMING.zoom),
    offsetX: clampFinite(value?.offsetX, -1, 1, DEFAULT_SCENE_BACKGROUND_FRAMING.offsetX),
    offsetY: clampFinite(value?.offsetY, -1, 1, DEFAULT_SCENE_BACKGROUND_FRAMING.offsetY)
  };
}

export function sceneBackgroundTransform(value: Partial<SceneBackgroundFraming> | null | undefined): string {
  const framing = normalizeSceneBackgroundFraming(value);
  const maximumShift = (framing.zoom - 1) * 50;
  const x = roundCssNumber(framing.offsetX * maximumShift);
  const y = roundCssNumber(framing.offsetY * maximumShift);
  return `translate(${x}%, ${y}%) scale(${roundCssNumber(framing.zoom)})`;
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function roundCssNumber(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
