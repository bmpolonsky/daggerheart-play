export type SceneBackgroundFit = 'fit' | 'fill';

export interface SceneBackgroundFraming {
  fit: SceneBackgroundFit;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_SCENE_BACKGROUND_FRAMING: Readonly<SceneBackgroundFraming> = Object.freeze({
  fit: 'fit',
  zoom: 1,
  offsetX: 0,
  offsetY: 0
});

export const MIN_SCENE_BACKGROUND_ZOOM = 0.25;
export const MAX_SCENE_BACKGROUND_ZOOM = 2.5;

export function normalizeSceneBackgroundFraming(value: Partial<SceneBackgroundFraming> | null | undefined): SceneBackgroundFraming {
  return {
    fit: 'fit',
    zoom: clampFinite(value?.zoom, MIN_SCENE_BACKGROUND_ZOOM, MAX_SCENE_BACKGROUND_ZOOM, DEFAULT_SCENE_BACKGROUND_FRAMING.zoom),
    offsetX: clampFinite(value?.offsetX, -1, 1, DEFAULT_SCENE_BACKGROUND_FRAMING.offsetX),
    offsetY: clampFinite(value?.offsetY, -1, 1, DEFAULT_SCENE_BACKGROUND_FRAMING.offsetY)
  };
}

export function sceneBackgroundTransform(value: Partial<SceneBackgroundFraming> | null | undefined): string {
  const framing = normalizeSceneBackgroundFraming(value);
  const x = roundCssNumber(framing.offsetX * 50);
  const y = roundCssNumber(framing.offsetY * 50);
  return `translate(${x}%, ${y}%) scale(${roundCssNumber(framing.zoom)})`;
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function roundCssNumber(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
