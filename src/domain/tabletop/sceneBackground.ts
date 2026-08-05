export type SceneBackgroundFit = 'fit' | 'fill';
export type SceneBackgroundRotation = 0 | 90 | 180 | 270;

export interface SceneBackgroundFraming {
  fit: SceneBackgroundFit;
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: SceneBackgroundRotation;
}

type SceneBackgroundFramingInput = Partial<Omit<SceneBackgroundFraming, 'rotation'>> & { rotation?: number };

export const DEFAULT_SCENE_BACKGROUND_FRAMING: Readonly<SceneBackgroundFraming> = Object.freeze({
  fit: 'fit',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0
});

export const MIN_SCENE_BACKGROUND_ZOOM = 0.25;
export const MAX_SCENE_BACKGROUND_ZOOM = 2.5;

export function normalizeSceneBackgroundFraming(value: SceneBackgroundFramingInput | null | undefined): SceneBackgroundFraming {
  return {
    fit: 'fit',
    zoom: clampFinite(value?.zoom, MIN_SCENE_BACKGROUND_ZOOM, MAX_SCENE_BACKGROUND_ZOOM, DEFAULT_SCENE_BACKGROUND_FRAMING.zoom),
    offsetX: clampFinite(value?.offsetX, -1, 1, DEFAULT_SCENE_BACKGROUND_FRAMING.offsetX),
    offsetY: clampFinite(value?.offsetY, -1, 1, DEFAULT_SCENE_BACKGROUND_FRAMING.offsetY),
    rotation: normalizeQuarterTurn(value?.rotation)
  };
}

export function sceneBackgroundTransform(value: SceneBackgroundFramingInput | null | undefined): string {
  const framing = normalizeSceneBackgroundFraming(value);
  const x = roundCssNumber(framing.offsetX * 50);
  const y = roundCssNumber(framing.offsetY * 50);
  const rotation = framing.rotation ? ` rotate(${framing.rotation}deg)` : '';
  return `translate(${x}%, ${y}%) scale(${roundCssNumber(framing.zoom)})${rotation}`;
}

function normalizeQuarterTurn(value: number | undefined): SceneBackgroundRotation {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return (((Math.round(value / 90) * 90) % 360 + 360) % 360) as SceneBackgroundRotation;
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function roundCssNumber(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
