import { exportCardAsPng } from "@cards/lib/exportUtils";
import { editorStore } from "@cards/stores/editor";
import { exportStore } from "@cards/stores/export";

export class ExportService {
  readonly store = exportStore;

  async exportCurrentCard(cardElement: HTMLElement) {
    exportStore.update((state) => ({
      ...state,
      exportError: null,
      isExporting: true,
    }));

    try {
      const { cardFields } = editorStore.getState();
      await exportCardAsPng(cardElement, cardFields.title || "карта");
    } catch (err) {
      console.error("PNG export failed", err);
      exportStore.update((state) => ({
        ...state,
        exportError: "Не удалось экспортировать PNG. Попробуйте ещё раз.",
      }));
    } finally {
      exportStore.update((state) => ({
        ...state,
        isExporting: false,
      }));
    }
  }
}

export const exportService = new ExportService();
