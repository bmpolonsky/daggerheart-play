import type { TemplateCard } from "@cards/lib/api";
import {
  DEFAULT_CARD_TYPE_ID,
  type CardFields,
  type CardTypeId,
  createEmptyCardFields,
} from "@cards/lib/cardTypes";
import { Store } from "@cards/lib/store";

export interface EditorState {
  selectedCard: TemplateCard | null;
  selectedTypeId: CardTypeId;
  cardFields: CardFields;
  customImage: string | null;
  customImageSource: string | null;
  selectedFeatureIndex: number;
  customCardId: string | null;
}

const initialState: EditorState = {
  selectedCard: null,
  selectedTypeId: DEFAULT_CARD_TYPE_ID,
  cardFields: createEmptyCardFields(),
  customImage: null,
  customImageSource: null,
  selectedFeatureIndex: 0,
  customCardId: null,
};

export const editorStore = new Store<EditorState>(initialState);
