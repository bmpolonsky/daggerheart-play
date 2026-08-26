export type LibraryDetailAction = {
  label: string;
  disabled?: boolean;
  onClick: () => string | null;
};

export type LibraryDetailSection = {
  title: string;
  body: string;
  structured?: boolean;
};

export type LibraryEntry = {
  id: string;
  routeSlug?: string;
  title: string;
  kicker: string;
  preview: string;
  imageUrl?: string | null;
  stats: string[];
  sections: LibraryDetailSection[];
  actions: LibraryDetailAction[];
  editable?: {
    collection: EditableContentCollectionKey;
    raw: EditableRawContent;
    isCustom: boolean;
  };
};
import type { EditableContentCollectionKey, EditableRawContent } from '../../../../domain/content/types';
