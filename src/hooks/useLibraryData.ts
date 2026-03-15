import { useCallback, useEffect, useMemo, useState } from "react";
import type { LibraryFilters, SearchResult } from "../shared/types";
import { useDebouncedValue } from "./useDebouncedValue";

export function useLibraryData(filters: LibraryFilters): {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const debouncedQuery = useDebouncedValue(filters.query, 300);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      query: debouncedQuery
    }),
    [debouncedQuery, filters]
  );

  const fetchLibrary = useCallback(async () => {
    try {
      setLoading(true);
      const response = await window.remember.listFiles(effectiveFilters);
      setResults(response);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, [effectiveFilters]);

  useEffect(() => {
    void fetchLibrary();

    const interval = window.setInterval(() => {
      void fetchLibrary();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [fetchLibrary]);

  return {
    results,
    loading,
    error,
    refresh: fetchLibrary
  };
}
