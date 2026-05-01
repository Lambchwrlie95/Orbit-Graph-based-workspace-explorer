import React from "react";
import { RefreshCcw, Image as ImageIcon } from "lucide-react";
import { FileRecord } from "../../types";
import { useImageAnalysis } from "../../hooks/useImageAnalysis";
import { formatBytes } from "../../utils";

interface ImageAnalysisPanelProps {
  record: FileRecord;
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

export function ImageAnalysisPanel({ record }: ImageAnalysisPanelProps) {
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

      {loading && <div className="analysis-note">Analyzing image metadata...</div>}

      {error && <div className="analysis-error">Error: {error}</div>}

      {analysis && (
        <div className="analysis-grid">
          <div>
            <span className="analysis-label">Dimensions</span>
            <strong>{analysis.width} x {analysis.height}</strong>
          </div>
          <div>
            <span className="analysis-label">Aspect</span>
            <strong>{aspectRatioLabel(aspectRatio)}</strong>
          </div>
          <div>
            <span className="analysis-label">Format</span>
            <strong>{formatLabel}</strong>
          </div>
          <div>
            <span className="analysis-label">Size</span>
            <strong>{formatBytes(record.sizeBytes)}</strong>
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <div className="analysis-colors">
          <div className="analysis-label">Dominant colors</div>
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
    </section>
  );
}

export default ImageAnalysisPanel;
