import { useMemo } from 'preact/hooks';
import { useStream } from '../../core/hooks/useStream';
import type { ContentState, LibraryClassItem, LibraryEquipmentItem } from '../../domain/content/types';
import { CharacterBuilderService } from './CharacterBuilderService';

export function useCharacterBuilder({
  content,
  classes,
  equipment,
  includePlaytest = false
}: {
  content: ContentState['generic'];
  classes: LibraryClassItem[];
  equipment: LibraryEquipmentItem[];
  includePlaytest?: boolean;
}) {
  const service = useMemo(() => new CharacterBuilderService(), []);
  const draft = useStream(service.draft$);
  return service.buildModel({ content, classes, equipment, includePlaytest, draft });
}
