/** @jsxImportSource preact */
import { Eye } from 'lucide-react';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { feedService } from '../../../../../services/serviceRegistry';
import { Button } from '../../../../components/common/Button';
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
          <Button
            className="feed-card-action"
            variant="ghost"
            size="xs"
            type="button"
            aria-label={`Показать раздатку ${handout?.title || item.title}`}
            title="Показать игрокам"
            onClick={publish}
            iconBefore={<Eye size={13} aria-hidden="true" />}
          >
            Показать
          </Button>
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
