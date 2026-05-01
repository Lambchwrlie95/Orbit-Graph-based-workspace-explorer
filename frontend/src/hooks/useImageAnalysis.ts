import { useCallback, useEffect, useState } from "react";
import { tauriInvoke } from "../lib/tauriCommands";
import {
  ColorExtractionResult,
  FileRecord,
  ImageAnalysisData,
  ImageColor,
  ImageMetadataResult,
} from "../types";
import { isImageFile } from "../utils";

export type { ImageAnalysisData, ImageColor } from "../types";

interface UseImageAnalysisReturn {
  analysis: ImageAnalysisData | null;
  colors: ImageColor[];
  loading: boolean;
  error: string | null;
  isImage: boolean;
  refresh: () => void;
}

export function useImageAnalysis(record: FileRecord | null): UseImageAnalysisReturn {
  const [analysis, setAnalysis] = useState<ImageAnalysisData | null>(null);
  const [colors, setColors] = useState<ImageColor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isImage = Boolean(record && !record.isDir && isImageFile(record.extension));

  const fetchAnalysis = useCallback(async () => {
    if (!record || record.isDir || !isImageFile(record.extension)) {
      setAnalysis(null);
      setColors([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [imageResult, colorsResult] = await Promise.all([
        tauriInvoke("analyze_image_file", {
          fileId: record.id,
          filePath: record.path,
        }).catch(() => null),
        tauriInvoke("extract_colors", {
          fileId: record.id,
          filePath: record.path,
          colorCount: 5,
        }).catch(() => null),
      ] satisfies [Promise<ImageMetadataResult | null>, Promise<ColorExtractionResult | null>]);

      setAnalysis(imageResult?.analysis ?? null);
      setColors(colorsResult?.colors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAnalysis(null);
      setColors([]);
    } finally {
      setLoading(false);
    }
  }, [record]);

  useEffect(() => {
    void fetchAnalysis();
  }, [fetchAnalysis]);

  return {
    analysis,
    colors,
    loading,
    error,
    isImage,
    refresh: fetchAnalysis,
  };
}

export default useImageAnalysis;
