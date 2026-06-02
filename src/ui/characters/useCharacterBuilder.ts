import { useMemo } from 'preact/hooks';
import { useStore } from '../../core/hooks/useStore';
import type { ContentState, LibraryClassItem, LibraryEquipmentItem } from '../../domain/content/types';
import { CharacterBuilderService } from './CharacterBuilderService';

export function useCharacterBuilder({ content, classes, equipment }: { content: ContentState['generic']; classes: LibraryClassItem[]; equipment: LibraryEquipmentItem[] }) {
  const service = useMemo(() => new CharacterBuilderService(), []);
  const draft = useStore(service.draftStore);
  return service.buildModel({ content, classes, equipment, draft });
}
