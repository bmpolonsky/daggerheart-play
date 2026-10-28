/** @jsxImportSource preact */
import { useStream } from '../../../../../core/hooks/useStream';
import { buildCharacterSummary } from '../../../../../domain/tabletop/playerView';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { characterService, contentService } from '../../../../../services/serviceRegistry';
import { BeastformControls } from '../../BeastformControls';
import { FeedCardHeader } from './RollFeedCard';

export function BeastformFeedCard({item}: {item: TableFeedItem}) {
  const characters = useStream(characterService.characters$);
  const content = useStream(contentService.content$);
  const character = item.beastformEditor ? characters.entities[item.beastformEditor.characterId] : null;
  if (!character) return null;
  return <><FeedCardHeader item={item} label={item.kicker} /><BeastformControls character={buildCharacterSummary(character)} beastforms={content.beastforms} /></>;
}
