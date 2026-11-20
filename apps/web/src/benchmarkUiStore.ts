import { create } from "zustand";

/**
 * Which benchmark screens are open. The model picker, the usage card and Settings all open the same
 * two screens, and `BenchmarkHost` (mounted once in the chat view) draws them.
 */
interface BenchmarkUiState {
  /** The Artificial Analysis key dialog. */
  keyDialogOpen: boolean;
  /** The benchmarks window. */
  windowOpen: boolean;
  /** The model the window opens on, as the provider names it; null shows the whole list. */
  focusModel: string | null;
  openKeyDialog: () => void;
  closeKeyDialog: () => void;
  openWindow: (focusModel?: string | null) => void;
  closeWindow: () => void;
}

export const useBenchmarkUi = create<BenchmarkUiState>((set) => ({
  keyDialogOpen: false,
  windowOpen: false,
  focusModel: null,
  openKeyDialog: () => set({ keyDialogOpen: true }),
  closeKeyDialog: () => set({ keyDialogOpen: false }),
  openWindow: (focusModel = null) => set({ windowOpen: true, focusModel }),
  closeWindow: () => set({ windowOpen: false, focusModel: null }),
}));
