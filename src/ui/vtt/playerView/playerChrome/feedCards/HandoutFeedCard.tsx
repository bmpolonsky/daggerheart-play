/** @jsxImportSource preact */
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { cssImageUrl } from '../../helpers';
import { renderRulesText } from '../../sheetText';
import { FeedCardHeader } from './RollFeedCard';

export function HandoutFeedCard({ item }: { item: TableFeedItem }) {
  const handout = item.handout;
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker || 'Материал'} />
      <div className="feed-handout-card">
        {handout?.imageUrl && <img src={cssImageUrl(handout.imageUrl)} alt="" />}
        <div>
          <strong>{handout?.title ?? item.title}</strong>
          <p>{renderRulesText(handout?.body || item.body)}</p>
        </div>
      </div>
    </>
  );
}
