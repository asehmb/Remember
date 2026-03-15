import { create } from "zustand";
import type { LibraryFilters } from "../shared/types";

export type LibraryViewMode = "grid" | "list";

const initialFilters: LibraryFilters = {
  query: "",
  fileType: null,
  dominantColor: null,
  sentiment: null,
  uploadedWithin: "all",
  selectedTag: null
};

interface UIStoreState {
  viewMode: LibraryViewMode;
  filters: LibraryFilters;
  selectedFileId: string | null;
  setViewMode: (mode: LibraryViewMode) => void;
  setFilter: <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => void;
  clearFilter: (key: keyof LibraryFilters) => void;
  resetFilters: () => void;
  setSelectedFileId: (id: string | null) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  viewMode: "grid",
  filters: initialFilters,
  selectedFileId: null,
  setViewMode: (mode) => set({ viewMode: mode }),
  setFilter: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value
      }
    })),
  clearFilter: (key) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: initialFilters[key]
      }
    })),
  resetFilters: () => set({ filters: initialFilters }),
  setSelectedFileId: (id) => set({ selectedFileId: id })
}));
