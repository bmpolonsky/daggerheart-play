/** @jsxImportSource preact */
import { Eye } from 'lucide-react';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { feedService } from '../../../../../services/serviceRegistry';
import { cssImageUrl } from '../../helpers';
import { playerViewUiActions } from '../../playerViewUiState';
import { renderRulesText } from '../../sheetText';
import { FeedCardHeader } from './RollFeedCard';

export function HandoutFeedCard({ item }: { item: TableFeedItem }) {
  const handout = item.handout;
  const canPublish = Boolean(item.ephemeral && handout);
  const publish = () => {
    if (!handout) return;
    feedService.addHandout('Мастер', handout, { title: 'Раздатка' });
    playerViewUiActions.setEphemeralFeedItem(null);
  };
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker || 'Материал'}>
        {canPublish && (
          <button
            className="feed-card-action"
            type="button"
            aria-label={`Показать раздатку ${handout?.title || item.title}`}
            title="Показать игрокам"
            onClick={publish}
          >
            <Eye size={13} />
            <span>Показать</span>
          </button>
        )}
      </FeedCardHeader>
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
