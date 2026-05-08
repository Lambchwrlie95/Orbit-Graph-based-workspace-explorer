import React, { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Image as ImageIcon } from "lucide-react";
import { FileRecord, SimilarImage } from "../../types";
import { useImageAnalysis } from "../../hooks/useImageAnalysis";
import { tauriInvoke } from "../../lib/tauriCommands";
import { formatBytes, isImageFile } from "../../utils";

interface ImageAnalysisPanelProps {
  record: FileRecord;
  rootPath?: string;
  onOpenFile?: (path: string) => void;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function aspectRatioLabel(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "-";
  if (ratio >= 1) {
    return `${ratio.toFixed(ratio >= 4 ? 0 : 2)}:1`;
  }
  return `1:${(1 / ratio).toFixed(2)}`;
}

export function ImageAnalysisPanel({ record, rootPath, onOpenFile }: ImageAnalysisPanelProps) {
  const { analysis, colors, loading, error, isImage, refresh } = useImageAnalysis(record);
  const aspectRatio = analysis?.aspectRatio ?? analysis?.aspect_ratio ?? 0;
  const formatLabel = typeof analysis?.format === "string"
    ? analysis.format
    : analysis?.format
      ? Object.values(analysis.format)[0] ?? "Other"
      : "-";

  if (!isImage && !loading) {
    return null;
  }

  return (
    <section className="analysis-panel image-analysis-panel">
      <div className="panel-header">
        <h4>
          <ImageIcon size={12} strokeWidth={2} />
          Image Analysis
        </h4>
        <button type="button" className="refresh-btn" onClick={refresh} title="Refresh image analysis">
          <RefreshCcw size={12} strokeWidth={2} />
        </button>
      </div>

      {loading && <div className="analysis-note">⟳ Analyzing image metadata…</div>}

      {error && <div className="analysis-error">✗ {error}</div>}

      {analysis && (
        <div className="analysis-grid">
          <div>
            <span className="analysis-label">⊞ Dimensions</span>
            <strong>{analysis.width} × {analysis.height}</strong>
          </div>
          <div>
            <span className="analysis-label">⬡ Aspect</span>
            <strong>{aspectRatioLabel(aspectRatio)}</strong>
          </div>
          <div>
            <span className="analysis-label">◈ Format</span>
            <strong>{formatLabel}</strong>
          </div>
          <div>
            <span className="analysis-label">⊟ Size</span>
            <strong>{formatBytes(record.sizeBytes)}</strong>
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <div className="analysis-colors">
          <div className="analysis-label">◉ Dominant colors</div>
          <div className="analysis-color-list">
            {colors.map((color) => {
              const hex = rgbToHex(color.r, color.g, color.b);
              return (
                <button
                  key={`${hex}-${color.percentage.toFixed(2)}`}
                  type="button"
                  className="analysis-color-chip"
                  title={hex}
                  onClick={() => void navigator.clipboard?.writeText(hex)}
                >
                  <span
                    className="analysis-color-swatch"
                    style={{ backgroundColor: hex }}
                    aria-hidden
                  />
                  <span className="analysis-color-meta">
                    <span>{hex}</span>
                    <span>{color.percentage.toFixed(0)}%</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isImage && rootPath && (
        <SimilarImages
          record={record}
          rootPath={rootPath}
          onOpenFile={onOpenFile}
        />
      )}
    </section>
  );
}

interface SimilarImagesProps {
  record: FileRecord;
  rootPath: string;
  onOpenFile?: (path: string) => void;
}

function SimilarImages({ record, rootPath, onOpenFile }: SimilarImagesProps) {
  const [similar, setSimilar] = useState<SimilarImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    if (!record || record.isDir || !isImageFile(record.extension)) return;
    setLoading(true);
    setError(null);
    try {
      const matches = await tauriInvoke("find_similar_images", {
        fileId: record.id,
        filePath: record.path,
        rootPath,
        maxDistance: 10,
      });
      setSimilar(matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSimilar([]);
    } finally {
      setLoading(false);
    }
  }, [record, rootPath]);

  useEffect(() => {
    void lookup();
  }, [lookup]);

  if (!isImageFile(record.extension)) return null;

  return (
    <div className="analysis-similar">
      <div className="analysis-similar-header">
        <span className="analysis-label">⌘ Similar images</span>
        <button
          type="button"
          className="refresh-btn"
          onClick={lookup}
          title="Refresh similar images"
          disabled={loading}
        >
          ↻
        </button>
      </div>
      {loading && <div className="analysis-note">⟳ Searching…</div>}
      {!loading && error && <div className="analysis-error">✗ {error}</div>}
      {!loading && !error && similar.length === 0 && (
        <div className="analysis-note">◌ No similar images found</div>
      )}
      {!loading && similar.length > 0 && (
        <ul className="similar-image-list">
          {similar.map((m) => (
            <li key={m.fileId} className="similar-image-item">
              <button
                type="button"
                className="similar-image-link"
                onClick={() => onOpenFile?.(m.path)}
                title={m.path}
              >
                <span className="similar-image-name">
                  {m.path.split("/").pop() || m.path}
                </span>
                <span
                  className="similar-image-distance"
                  title={`Hamming distance ${m.distance}/64`}
                >
                  {distanceLabel(m.distance)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function distanceLabel(d: number): string {
  if (d === 0) return "exact";
  if (d <= 3) return "near-dup";
  if (d <= 6) return "similar";
  return `${d}`;
}

export default ImageAnalysisPanel;
