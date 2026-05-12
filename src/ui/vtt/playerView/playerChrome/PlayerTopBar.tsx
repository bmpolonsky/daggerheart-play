/** @jsxImportSource preact */
import type { PlayerViewModel } from '../../../../domain/tabletop/playerView';
import { gameService } from '../../../../services/serviceRegistry';
import type { TableViewRole } from '../types';

export function PlayerTopBar({ model, role }: { model: PlayerViewModel; role: TableViewRole }) {
  return (
    <header className="player-topbar" aria-label="Состояние сцены">
      <div className="player-fear-track" aria-label={`Страх ${model.fear.value} из ${model.fear.max}`}>
        <span className="player-fear-track__label">СТРАХ</span>
        <div className="player-fear-track__pips">
          {Array.from({ length: model.fear.max }).map((_, index) => (
            role === 'gm' ? (
              <button
                key={index}
                className={index < model.fear.value ? 'is-filled' : ''}
                type="button"
                aria-label={`Страх ${index + 1}`}
                onClick={() => gameService.setFear(index + 1 === model.fear.value ? index : index + 1)}
              />
            ) : (
              <i key={index} className={index < model.fear.value ? 'is-filled' : ''} />
            )
          ))}
        </div>
        <strong className="player-fear-track__value" aria-label={`Страх ${model.fear.value} из ${model.fear.max}`}>
          {model.fear.value}/{model.fear.max}
        </strong>
      </div>
    </header>
  );
}
