/** @jsxImportSource preact */
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from '../../domainCards/types';
import type { TableViewRole } from '../../types';
import { CountdownComposerFeedCard } from './CountdownComposerFeedCard';
import { DomainCardFeedCard } from './DomainCardFeedCard';
import { FeatureFeedCard } from './FeatureFeedCard';
import { DeathMoveFeedCard } from './DeathMoveFeedCard';
import { HandoutFeedCard } from './HandoutFeedCard';
import { MessageFeedCard } from './MessageFeedCard';
import { RestFeedCard } from './RestFeedCard';
import { RollFeedCard } from './RollFeedCard';
import { TeamworkFeedCard } from './TeamworkFeedCard';
import { WealthFeedCard } from './WealthFeedCard';

export function FeedCard({
  actorId,
  item,
  waitingForResult,
  role,
  onRevealToPublic,
  onDomainCardMacro
}: {
  actorId: string | null;
  item: TableFeedItem;
  waitingForResult: boolean;
  role: TableViewRole;
  onRevealToPublic: (item: TableFeedItem) => void;
  onDomainCardMacro?: (card: PlayerViewDomainCard, macro: PlayerViewDomainCardMacro, item: TableFeedItem) => void;
}) {
  if (item.kind === 'roll') {
    return <RollFeedCard item={item} waitingForResult={waitingForResult} role={role} onRevealToPublic={onRevealToPublic} />;
  }
  if (item.kind === 'card') {
    const canRunMacro = Boolean(onDomainCardMacro && (role === 'gm' || !item.actor?.actorId || item.actor.actorId === actorId));
    return <DomainCardFeedCard item={item} role={role} onMacro={canRunMacro ? (card, macro) => onDomainCardMacro?.(card, macro, item) : undefined} />;
  }
  if (item.kind === 'feature') {
    const canRunMacro = Boolean(onDomainCardMacro && (role === 'gm' || !item.actor?.actorId || item.actor.actorId === actorId));
    return <FeatureFeedCard item={item} role={role} onMacro={canRunMacro ? (card, macro) => onDomainCardMacro?.(card, macro, item) : undefined} />;
  }
  if (item.kind === 'rest') {
    return <RestFeedCard actorId={actorId} item={item} role={role} />;
  }
  if (item.kind === 'teamwork') {
    return <TeamworkFeedCard actorId={actorId} item={item} role={role} />;
  }
  if (item.kind === 'deathMove') {
    return <DeathMoveFeedCard actorId={actorId} item={item} role={role} />;
  }
  if (item.kind === 'countdownComposer') {
    return role === 'gm' ? <CountdownComposerFeedCard item={item} /> : <MessageFeedCard item={item} />;
  }
  if (item.kind === 'handout') {
    return <HandoutFeedCard item={item} />;
  }
  if (item.kind === 'wealth') {
    return <WealthFeedCard item={item} />;
  }
  return <MessageFeedCard item={item} />;
}
