/** @jsxImportSource preact */
import { Eye } from 'lucide-react';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { feedService } from '../../../../../services/serviceRegistry';
import { AssetImage } from '../../../../components/common/AssetImage';
import { Button } from '../../../../components/common/Button';
import { renderRulesText } from '../../sheetText';
import { FeedCardHeader } from './RollFeedCard';

export function HandoutFeedCard({ item, onPublish }: { item: TableFeedItem; onPublish?: () => void }) {
  const handout = item.handout;
  const canPublish = Boolean(item.ephemeral && handout);
  const publish = () => {
    if (!handout) return;
    feedService.addHandout('Мастер', handout, { title: 'Раздатка' });
    onPublish?.();
  };
  const content = (
    <div className={`feed-handout-card${canPublish ? ' feed-handout-card--preview' : ''}`}>
      {handout?.imageUrl && <AssetImage src={handout.imageUrl} alt="" />}
      <div>
        <strong>{handout?.title ?? item.title}</strong>
        <p>{renderRulesText(handout?.body || item.body)}</p>
        {canPublish && (
          <Button
            className="feed-handout-card__publish"
            variant="secondary"
            size="sm"
            type="button"
            aria-label={`Отправить в чат раздатку ${handout?.title || item.title}`}
            title="Отправить в чат"
            onClick={publish}
            iconBefore={<Eye size={13} aria-hidden="true" />}
          >
            Отправить в чат
          </Button>
        )}
      </div>
    </div>
  );
  if (canPublish) return content;
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker || 'Раздатка'} />
      {content}
    </>
  );
}
