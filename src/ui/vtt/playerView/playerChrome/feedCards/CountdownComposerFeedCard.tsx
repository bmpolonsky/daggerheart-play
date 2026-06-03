/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { encounterService } from '../../../../../services/serviceRegistry';
import { Button } from '../../../../components/common/Button';
import { NumberControl, TextControl } from '../../../../components/common/Field';
import { playerViewUiActions } from '../../playerViewUiState';
import { FeedCardHeader } from './RollFeedCard';

export function CountdownComposerFeedCard({ item }: { item: TableFeedItem }) {
  const draft = item.countdownComposer;
  const [name, setName] = useState(draft?.name ?? '');
  const [current, setCurrent] = useState(draft?.current ?? 0);
  const [max, setMax] = useState(draft?.max ?? 4);
  const [privateToGm, setPrivateToGm] = useState(draft?.visibility !== 'public');
  const safeMax = Math.max(1, Math.min(20, Math.trunc(max || 1)));
  const safeCurrent = Math.max(0, Math.min(safeMax, Math.trunc(current || 0)));

  const launch = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    encounterService.addCountdown({
      name: trimmedName,
      current: safeCurrent,
      max: safeMax,
      direction: 'up',
      visibility: privateToGm ? 'gm' : 'public'
    });
    playerViewUiActions.setEphemeralFeedItem(null);
  };

  return (
    <>
      <FeedCardHeader item={item} label={item.kicker} />
      <section className="player-countdown-composer" aria-label="Создать отсчет">
        <strong>Новый отсчет</strong>
        <label>
          <span>Название</span>
          <TextControl value={name} placeholder="Опасность нарастает" onInput={(event) => setName(event.currentTarget.value)} />
        </label>
        <div className="player-countdown-composer__grid">
          <label>
            <span>Текущее</span>
            <NumberControl min={0} max={safeMax} value={current} onInput={(event) => setCurrent(Number(event.currentTarget.value))} />
          </label>
          <label>
            <span>Макс</span>
            <NumberControl min={1} max={20} value={max} onInput={(event) => setMax(Number(event.currentTarget.value))} />
          </label>
        </div>
        <footer className="player-countdown-composer__footer">
          <label className="player-countdown-composer__checkbox">
            <input checked={privateToGm} type="checkbox" onChange={(event) => setPrivateToGm(event.currentTarget.checked)} />
            <span>Приватно</span>
          </label>
          <Button
            fullWidth
            size="lg"
            variant="primary"
            type="button"
            onClick={launch}
            disabled={!name.trim()}
          >
            Запустить
          </Button>
        </footer>
      </section>
    </>
  );
}
