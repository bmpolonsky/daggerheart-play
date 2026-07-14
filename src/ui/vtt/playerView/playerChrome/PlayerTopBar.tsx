/** @jsxImportSource preact */
import type { PlayerViewModel } from '../../../../domain/tabletop/playerView';
import { gameService } from '../../../../services/serviceRegistry';
import { ResourcePips } from '../../../components/common';
import type { TableViewRole } from '../types';

export function PlayerTopBar({ model, role }: { model: PlayerViewModel; role: TableViewRole }) {
  return (
    <header className="player-topbar" aria-label="Состояние сцены">
      <div className="player-fear-track" aria-label={`Страх ${model.fear.value} из ${model.fear.max}`}>
        <span className="player-fear-track__label">СТРАХ</span>
        <ResourcePips
          className="player-fear-track__pips"
          current={model.fear.value}
          label="Страх"
          max={model.fear.max}
          onChange={role === 'gm' ? (next) => gameService.setFear(next) : undefined}
          showHeader={false}
          tone="fear"
        />
        <strong className="player-fear-track__value" aria-label={`Страх ${model.fear.value} из ${model.fear.max}`}>
          {model.fear.value}/{model.fear.max}
        </strong>
      </div>
    </header>
  );
}
