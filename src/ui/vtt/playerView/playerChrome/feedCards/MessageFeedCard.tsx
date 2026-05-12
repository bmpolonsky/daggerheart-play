/** @jsxImportSource preact */
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { renderRulesText } from '../../sheetText';
import { FeedCardHeader } from './RollFeedCard';

export function MessageFeedCard({ item }: { item: TableFeedItem }) {
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker} />
      <strong>{item.title}</strong>
      <p>{renderRulesText(item.body)}</p>
    </>
  );
}
