/** @jsxImportSource preact */
import type { CharacterUsageTracker } from '../../../domain/rules/types';
import { AssetImage, Badge, ListItem, SectionHeader } from '../../components/common';
import type { PlayerViewDomainCard } from './domainCards/types';

export function CharacterSheetDomainCards({ cards, handLimit, usageTrackers, onPreview }: {
  cards: PlayerViewDomainCard[];
  handLimit: number;
  usageTrackers: CharacterUsageTracker[];
  onPreview: (cardId: string) => void;
}) {
  const hand = cards.filter((card) => card.inHand);
  const vault = cards.filter((card) => !card.inHand);
  return (
    <div className="player-domain-card-zones">
      <DomainCardZone title="Рука" label="Рука карт доменов" count={`${hand.length}/${handLimit}`} cards={hand} usageTrackers={usageTrackers} onPreview={onPreview} />
      {vault.length > 0 && <DomainCardZone title="Хранилище" label="Хранилище карт доменов" count={`${vault.length}`} cards={vault} usageTrackers={usageTrackers} onPreview={onPreview} />}
    </div>
  );
}

function DomainCardZone({ title, label, count, cards, usageTrackers, onPreview }: {
  title: string;
  label: string;
  count: string;
  cards: PlayerViewDomainCard[];
  usageTrackers: CharacterUsageTracker[];
  onPreview: (cardId: string) => void;
}) {
  return (
    <section className="player-domain-card-zone" aria-label={label}>
      <SectionHeader title={title} subtitle={count} />
      {cards.map((card) => (
        <DomainCardRow key={card.id} card={card} tracker={usageTrackers.find((item) => item.targetKind === 'card' && item.targetId === card.id)} onPreview={onPreview} />
      ))}
    </section>
  );
}

function DomainCardRow({ card, tracker, onPreview }: {
  card: PlayerViewDomainCard;
  tracker?: CharacterUsageTracker;
  onPreview: (cardId: string) => void;
}) {
  const status = card.permanentlyVaulted ? 'Навсегда — вернуть нельзя' : card.loadoutChoicePending ? 'Новая — ждёт выбора' : '';
  return (
    <ListItem
      aria-label={card.name}
      className="player-domain-card-row"
      align="start"
      tone={card.inHand ? 'featured' : 'default'}
      title={card.name}
      subtitle={`${card.domainLabel} ${card.level}${status ? ` — ${status}` : ''}`}
      leftAccessory={card.imageUrl ? <AssetImage className="player-domain-card-thumb" src={card.imageUrl} alt="" /> : undefined}
      rightAccessory={tracker ? <Badge size="xs" aria-label={`${tracker.label}: ${tracker.current} из ${tracker.max}`}>{tracker.current}/{tracker.max}</Badge> : undefined}
      onClick={() => onPreview(card.id)}
    />
  );
}
