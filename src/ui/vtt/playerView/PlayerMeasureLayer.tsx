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
      {origin && PLAYER_RANGE_CELLS.map((cells) => (
        <span
          className="player-range-band-label"
          key={`band-${cells}`}
          style={rangeBandLabelPosition(origin, cells)}
        >
          {rangeCategoryForCells(cells)}
        </span>
      ))}
    </div>
  );
}

function rangeBandLabelPosition(origin: PlayerViewToken, cells: number): { left: string; top: string } {
  const radius = cells * PLAYER_TACTICAL_GRID_SIZE;
  const x = origin.x + radius * 0.78;
  const y = origin.y - Math.max(34, radius * 0.34);
  return {
    left: `${(x / PLAYER_SCENE_WIDTH) * 100}%`,
    top: `${(y / PLAYER_SCENE_HEIGHT) * 100}%`
  };
}
