import { Store } from "@cards/lib/store";

export interface ExportState {
  isExporting: boolean;
  exportError: string | null;
}

const initialState: ExportState = {
  isExporting: false,
  exportError: null,
};

export const exportStore = new Store<ExportState>(initialState);
