import type { Adversary } from "@combat/lib/api";
import { Store } from "../../../core/store/Store";

export type CustomAdversaryEditorMode = "create" | "edit";

export interface CustomAdversaryEditorState {
  mode: CustomAdversaryEditorMode;
  adversary: Adversary | null;
}

export const customAdversaryEditorStore = new Store<CustomAdversaryEditorState | null>(null);
