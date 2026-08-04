/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { Copy, Dices, ScrollText } from 'lucide-react';
import { formatNpc, generateNpc, type GeneratedNpc } from '../../../../domain/generators/npc';
import { feedService, gameService } from '../../../../services/serviceRegistry';
import { Button, ListItem, Notice, SectionHeader, Surface, Toolbar } from '../../../components/common';

export function SharedToolsGeneratorsTab({ npc, onNpcChange }: { npc: GeneratedNpc; onNpcChange: (npc: GeneratedNpc) => void }) {
  const [message, setMessage] = useState('');
  const text = formatNpc(npc);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('NPC скопирован.');
    } catch {
      setMessage('Не удалось скопировать автоматически.');
    }
  };

  const addToChronicle = () => {
    feedService.addMessage(gameService.game$.get().gmName || 'Мастер', text, { title: `NPC · ${npc.name}`, publication: 'gm' });
    setMessage('Добавлено в приватную хронику мастера.');
  };

  return (
    <section className="player-tools-section player-tools-generators-section">
      <SectionHeader title="NPC" subtitle="Локальный генератор для быстрой импровизации" />
      <Surface className="player-tools-npc" tone="subtle">
        <strong>{npc.name}</strong>
        <div className="player-tools-npc__traits">
          <ListItem density="compact" lines={2} title="Внешность" subtitle={npc.appearance} />
          <ListItem density="compact" lines={2} title="Манера" subtitle={npc.manner} />
          <ListItem density="compact" lines={2} title="Мотив" subtitle={npc.motive} />
          <ListItem density="compact" lines={2} title="Деталь" subtitle={npc.detail} />
        </div>
      </Surface>
      <Toolbar>
        <Button size="sm" iconBefore={<Dices size={15} aria-hidden="true" />} onClick={() => { onNpcChange(generateNpc()); setMessage(''); }}>Сгенерировать ещё</Button>
        <Button size="sm" variant="ghost" iconBefore={<Copy size={15} aria-hidden="true" />} onClick={() => void copy()}>Скопировать</Button>
        <Button size="sm" variant="ghost" iconBefore={<ScrollText size={15} aria-hidden="true" />} onClick={addToChronicle}>В хронику мастера</Button>
      </Toolbar>
      {message && <Notice tone="success">{message}</Notice>}
    </section>
  );
}
