import { useCallback, useEffect, useState } from "react";
import { tauriInvoke } from "../lib/tauriCommands";
import type { MarkdownAnalysis } from "../types";

export interface UseMarkdownAnalysisReturn {
  analysis: MarkdownAnalysis | null;
  loading: boolean;
  error: string | null;
  isMarkdown: boolean;
  refresh: () => void;
}

export function useMarkdownAnalysis(filePath: string | null): UseMarkdownAnalysisReturn {
  const [analysis, setAnalysis] = useState<MarkdownAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMarkdown, setIsMarkdown] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    if (!filePath) {
      setAnalysis(null);
      setIsMarkdown(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isMd = await tauriInvoke("is_analyzable_markdown_file", { path: filePath });
      setIsMarkdown(isMd);

      if (isMd) {
        const result = await tauriInvoke("analyze_markdown_file", { path: filePath });
        setAnalysis(result);
      } else {
        setAnalysis(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return { analysis, loading, error, isMarkdown, refresh: fetchAnalysis };
}
