import type { Adversary } from "@combat/lib/api";
import { buildDuplicateTemplate } from "@combat/lib/customAdversaries";
import { customAdversaryEditorStore } from "@combat/stores/customAdversaryEditor";

export class CustomAdversaryEditorService {
  readonly editor$ = customAdversaryEditorStore.toStream();

  openCreate() {
    customAdversaryEditorStore.update(() => ({
      mode: "create",
      adversary: null,
    }));
  }

  openEdit(adversary: Adversary) {
    if (!adversary.isCustom) return;

    customAdversaryEditorStore.update(() => ({
      mode: "edit",
      adversary,
    }));
  }

  openDuplicate(adversary: Adversary) {
    customAdversaryEditorStore.update(() => ({
      mode: "create",
      adversary: buildDuplicateTemplate(adversary),
    }));
  }

  close() {
    customAdversaryEditorStore.update(() => null);
  }
}

export const customAdversaryEditorService = new CustomAdversaryEditorService();
