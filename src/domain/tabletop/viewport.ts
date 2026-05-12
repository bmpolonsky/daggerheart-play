import { DEFAULT_SCENE_HEIGHT, DEFAULT_SCENE_WIDTH } from './logic';
import type { TokenState } from './types';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportRect extends ViewportSize {
  left: number;
  top: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ClientPoint {
  clientX: number;
  clientY: number;
}

export interface RangeLineGeometry {
  left: number;
  top: number;
  width: number;
  angle: number;
  labelLeft: number;
  labelTop: number;
}

export type ViewportStyle = Record<string, string>;

export const DEFAULT_TABLETOP_VIEWPORT: ViewportSize = {
  width: DEFAULT_SCENE_WIDTH,
  height: DEFAULT_SCENE_HEIGHT
};

export function worldToPercent(point: ViewportPoint, viewport: ViewportSize = DEFAULT_TABLETOP_VIEWPORT): ViewportPoint {
  return {
    x: (point.x / viewport.width) * 100,
    y: (point.y / viewport.height) * 100
  };
}

export function clientPointToWorld(point: ClientPoint, rect: ViewportRect, viewport: ViewportSize = DEFAULT_TABLETOP_VIEWPORT): ViewportPoint {
  return {
    x: ((point.clientX - rect.left) / rect.width) * viewport.width,
    y: ((point.clientY - rect.top) / rect.height) * viewport.height
  };
}

export function tokenPositionStyle(token: Pick<TokenState, 'x' | 'y' | 'width'>, viewport: ViewportSize = DEFAULT_TABLETOP_VIEWPORT): ViewportStyle {
  const position = worldToPercent(token, viewport);
  return {
    '--dh-token-x': `${position.x * 10}%`,
    '--dh-token-y': `${position.y}%`,
    '--dh-token-size': `${token.width}px`,
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: 'translate(-50%, -50%)'
  };
}

export function rangeLineStyle(line: RangeLineGeometry, viewport: ViewportSize = DEFAULT_TABLETOP_VIEWPORT): ViewportStyle {
  const position = worldToPercent({ x: line.left, y: line.top }, viewport);
  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
    width: `${(line.width / viewport.width) * 100}%`,
    transform: `rotate(${line.angle}rad)`
  };
}

export function rangeLabelStyle(line: RangeLineGeometry, viewport: ViewportSize = DEFAULT_TABLETOP_VIEWPORT): ViewportStyle {
  const position = worldToPercent({ x: line.labelLeft, y: line.labelTop }, viewport);
  return {
    left: `${position.x}%`,
    top: `${position.y}%`
  };
}
