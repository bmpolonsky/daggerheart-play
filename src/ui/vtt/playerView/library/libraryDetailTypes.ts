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
  listStats?: string[];
  sections: LibraryDetailSection[];
  actions: LibraryDetailAction[];
  adversary?: LibraryAdversary;
  editable?: {
    collection: EditableContentCollectionKey;
    raw: EditableRawContent;
    isCustom: boolean;
  };
};
import type { EditableContentCollectionKey, EditableRawContent, LibraryAdversary } from '../../../../domain/content/types';
