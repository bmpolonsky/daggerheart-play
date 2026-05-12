export type LibraryDetailAction = {
  label: string;
  onClick: () => string | null;
};

export type LibraryDetailSection = {
  title: string;
  body: string;
  structured?: boolean;
};

export type LibraryEntry = {
  id: string;
  title: string;
  kicker: string;
  preview: string;
  imageUrl?: string | null;
  stats: string[];
  sections: LibraryDetailSection[];
  actions: LibraryDetailAction[];
};
