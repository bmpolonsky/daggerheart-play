/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Copy, Dices, RotateCw } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import { formatNpc, NPC_GENDER_LABELS } from '../../../../domain/generators/npc';
import { npcGeneratorService } from '../../../../services/serviceRegistry';
import { Button, IconButton, Notice, SectionHeader } from '../../../components/common';
import styles from './NpcGenerator.module.css';

export function NpcGenerator() {
  const { npc, status } = useStream(npcGeneratorService.state$);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const text = npc ? formatNpc(npc) : '';
  useEffect(() => npcGeneratorService.connect(), []);
  useEffect(() => setMessage(undefined), [npc]);

  const copy = async () => {
    if (!npc) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ text: 'NPC скопирован.' });
    } catch {
      setMessage({ text: 'Не удалось скопировать автоматически.', error: true });
    }
  };

  return (
    <section className="player-tools-section" aria-label="Генератор NPC">
      <SectionHeader title="NPC" actions={<>
        <Button size="sm" disabled={status !== 'ready'} iconBefore={<Dices size={15} aria-hidden="true" />} onClick={() => npcGeneratorService.regenerate()}>Сгенерировать</Button>
        <IconButton size="sm" variant="ghost" disabled={!npc} title="Скопировать NPC целиком" aria-label="Скопировать NPC целиком" onClick={() => void copy()}><Copy size={15} aria-hidden="true" /></IconButton>
      </>} />
      {status === 'loading' && <div role="status"><Notice>Загружаю родословные и сообщества…</Notice></div>}
      {status === 'error' && <Notice tone="error">Не удалось загрузить справочник. Попробуйте ещё раз.</Notice>}
      {status === 'empty' && <Notice>В доступных источниках нет родословных или сообществ. Проверьте справочник и настройки источников игры.</Notice>}
      {(status === 'error' || status === 'empty') && <Button size="sm" onClick={() => void npcGeneratorService.reload()}>Обновить справочник</Button>}
      {npc && <section className={styles.npc} aria-label="Сгенерированный NPC">
        <div className={styles.name} role="group" aria-label="Имя">
          <h3 data-npc-value>{npc.name}</h3>
          <IconButton size="md" variant="ghost" disabled={status !== 'ready'} aria-label="Перебросить имя" title="Перебросить имя" onClick={() => npcGeneratorService.reroll('name')}><RotateCw size={16} aria-hidden="true" /></IconButton>
        </div>
        <div className={styles.gender} role="group" aria-label="Пол">
          <span>Пол: <span data-npc-gender>{NPC_GENDER_LABELS[npc.gender]}</span></span>
          <Button size="xs" variant="ghost" disabled={status !== 'ready'} onClick={() => npcGeneratorService.reroll('gender')}>Изменить пол и имя</Button>
        </div>
        <dl className={styles.fields}>
          {([
            ['ancestry', 'Родословная', 'Перебросить родословную', npc.ancestry.name],
            ['community', 'Сообщество', 'Перебросить сообщество', npc.community.name],
            ['occupation', 'Занятие', 'Перебросить занятие', npc.occupation],
            ['appearance', 'Внешность', 'Перебросить внешность', npc.appearance],
            ['motive', 'Мотив', 'Перебросить мотив', npc.motive]
          ] as const).map(([field, label, action, value]) => <div key={field} className={styles.field} role="group" aria-label={label}>
            <dt>{label}</dt>
            <dd data-npc-value>{value}</dd>
            <IconButton className={styles.reroll} size="md" variant="ghost" disabled={status !== 'ready'} aria-label={action} title={action} onClick={() => npcGeneratorService.reroll(field)}><RotateCw size={16} aria-hidden="true" /></IconButton>
          </div>)}
        </dl>
      </section>}
      <div role="status" aria-live="polite">{message && <Notice tone={message.error ? 'error' : 'success'}>{message.text}</Notice>}</div>
    </section>
  );
}
