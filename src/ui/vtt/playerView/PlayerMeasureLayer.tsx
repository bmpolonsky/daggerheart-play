/** @jsxImportSource preact */
import type { PlayerViewToken } from '../../../domain/tabletop/playerView';
import { rangeCategoryForCells } from '../../../domain/tabletop/logic';
import { PLAYER_RANGE_CELLS, PLAYER_SCENE_HEIGHT, PLAYER_SCENE_WIDTH, PLAYER_TACTICAL_GRID_SIZE } from './constants';

export function PlayerMeasureLayer({ origin }: { origin: PlayerViewToken | null }) {
  return (
    <div className="player-measure-layer" aria-hidden="true">
      {origin && PLAYER_RANGE_CELLS.map((cells) => (
        <i
          className="player-range-ring"
          key={`ring-${cells}`}
          style={{
            left: `${(origin.x / PLAYER_SCENE_WIDTH) * 100}%`,
            top: `${(origin.y / PLAYER_SCENE_HEIGHT) * 100}%`,
            width: `${((cells * PLAYER_TACTICAL_GRID_SIZE * 2) / PLAYER_SCENE_WIDTH) * 100}%`
          }}
        />
      ))}
      {origin && PLAYER_RANGE_CELLS.slice(1).map((cells, index) => (
        <span
          className="player-range-band-label"
          key={`band-${cells}`}
          style={rangeBandLabelPosition(origin, cells, index + 1)}
        >
          {rangeCategoryForCells(cells)}
        </span>
      ))}
    </div>
  );
}

function rangeBandLabelPosition(origin: PlayerViewToken, cells: number, index: number): { left: string; top: string } {
  const outerRadius = cells * PLAYER_TACTICAL_GRID_SIZE;
  const innerRadius = index > 0
    ? PLAYER_RANGE_CELLS[index - 1] * PLAYER_TACTICAL_GRID_SIZE
    : Math.max(origin.width, origin.height) / 2;
  const radius = (innerRadius + outerRadius) / 2;
  const availableSpace = {
    left: origin.x,
    right: PLAYER_SCENE_WIDTH - origin.x,
    top: origin.y,
    bottom: PLAYER_SCENE_HEIGHT - origin.y
  };
  const freerSide = (sides: Array<keyof typeof availableSpace>) => sides
    .reduce((best, candidate) => availableSpace[candidate] > availableSpace[best] ? candidate : best);
  const side = freerSide(['right', 'left', 'bottom', 'top']);
  const x = origin.x + (side === 'right' ? radius : side === 'left' ? -radius : 0);
  const y = origin.y + (side === 'bottom' ? radius : side === 'top' ? -radius : 0);
  return {
    left: `${(x / PLAYER_SCENE_WIDTH) * 100}%`,
    top: `${(y / PLAYER_SCENE_HEIGHT) * 100}%`
  };
}
