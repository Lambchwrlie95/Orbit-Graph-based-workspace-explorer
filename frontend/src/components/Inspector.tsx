import React, { memo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Copy, ExternalLink, FolderOpen, Image as ImageIcon, Music, RefreshCcw, Pencil } from "lucide-react";
import { FileRecord, PreviewPayload } from "../types";
import { formatBytes, formatDate, isAudioFile, isImageFile, isTextFile, shortPath } from "../utils";
import { AboutPanel } from "./inspector/AboutPanel";
import { CodeAnalysisPanel } from "./inspector/CodeAnalysisPanel";
import { ImageAnalysisPanel } from "./inspector/ImageAnalysisPanel";
import { MarkdownAnalysisPanel } from "./inspector/MarkdownAnalysisPanel";
import { useIconTheme } from "../hooks/useIconTheme";
import { tauriInvoke } from "../lib/tauriCommands";

interface InspectorProps {
  record: FileRecord | null;
  preview: PreviewPayload | null;
  isLoadingPreview?: boolean;
  rootPath?: string;
  onOpen: (path: string) => void;
  onSelectPath?: (path: string) => void;
  onNavigate?: (path: string) => void;
  onRenamed?: (oldPath: string, newPath: string) => void;
}

type PreviewKind = "text" | "image" | "audio" | "directory" | "binary" | "error";

function InspectorComponent({
  record,
  preview,
  isLoadingPreview,
  rootPath,
  onOpen,
  onSelectPath,
  onNavigate,
  onRenamed,
}: InspectorProps) {
  const { resolve: resolveIcon } = useIconTheme();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const startRename = () => {
    if (!record) return;
    setRenameValue(record.name);
    setRenameError(null);
    setRenaming(true);
  };
  const submitRename = async () => {
    if (!record || !renameValue.trim() || renameValue === record.name) {
      setRenaming(false);
      return;
    }
    try {
      const newPath = await tauriInvoke("rename", {
        path: record.path,
        newName: renameValue.trim(),
      });
      onRenamed?.(record.path, newPath);
      setRenaming(false);
    } catch (e) {
      setRenameError(String(e));
    }
  };
  if (!record) {
    return (
      <div className="inspector sidebar-panel">
        <div className="panel-shell">
          <h2>⬡ Inspector</h2>
          <div className="empty-state small">◌ Select a file or folder to view details</div>
        </div>
      </div>
    );
  }

  // Show preview if it's a known text/image type OR the backend already returned a payload.
  // This lets unknown-extension files (e.g. "Procfile", scripts without extension) preview
  // when the backend successfully reads them as text.
  const canPreview =
    !record.isDir &&
    (isTextFile(record.extension) || isImageFile(record.extension) || isAudioFile(record.extension) || preview !== null);
  const previewKind = (preview?.kind ?? (record.isDir ? "directory" : "binary")) as PreviewKind;
  const previewTitle = preview?.title || record.name;
  const previewSummary = preview?.summary || (record.isDir ? "Folder" : "No preview available");

  const recordType = record.isDir ? "Folder" : record.mimeType || record.extension || "File";

  return (
    <div className="inspector sidebar-panel">
      <div className="panel-shell">
        <div className="panel-title-row">
          <div className="panel-title-copy">
            <h2>Inspector</h2>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              onClick={() => onOpen(record.path)}
              title={record.isDir ? "Open folder externally" : "Open file externally"}
            >
              <ExternalLink size={13} strokeWidth={2} />
            </button>
            {record.parentPath && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(record.parentPath!)}
                title="Show in parent folder"
              >
                <FolderOpen size={13} strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(record.path)}
              title="Copy path"
            >
              <Copy size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={startRename}
              title="Rename"
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
          </div>
        </div>

        {(() => {
          const icon = resolveIcon(record.path, record.isDir, false);
          return (
            <div className="record-header">
              <span
                className={`file-icon large ${record.isDir ? "folder" : ""}`}
                style={icon.fg ? { color: icon.fg } : undefined}
              >
                {icon.text}
              </span>
              <div className="record-title">
                {renaming ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      className="inspector-rename-input"
                      value={renameValue}
                      onChange={(e) => {
                        setRenameValue(e.target.value);
                        setRenameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitRename();
                        else if (e.key === "Escape") setRenaming(false);
                      }}
                      onBlur={() => void submitRename()}
                    />
                    {renameError && <p className="inspector-rename-error">{renameError}</p>}
                  </>
                ) : (
                  <>
                    <h3 title={record.name}>{record.name}</h3>
                    <p title={record.path}>{shortPath(record.path)}</p>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        <div className="metadata-section">
          <h4>◈ Information</h4>
          <dl className="meta-grid">
            <dt>
              <span className="meta-dot" style={{ background: "#94a3b8" }} aria-hidden />
              Type
            </dt>
            <dd>{recordType}</dd>

            <dt>
              <span className="meta-dot" style={{ background: "#fbbf24" }} aria-hidden />
              Size
            </dt>
            <dd>{record.isDir ? "—" : formatBytes(record.sizeBytes)}</dd>

            {record.extension && (
              <>
                <dt>
                  <span className="meta-dot" style={{ background: "#a78bfa" }} aria-hidden />
                  Ext
                </dt>
                <dd>.{record.extension}</dd>
              </>
            )}

            <dt>
              <span className="meta-dot" style={{ background: "#f59e0b" }} aria-hidden />
              Modified
            </dt>
            <dd>{formatDate(record.modifiedAt)}</dd>

            {record.createdAt && (
              <>
                <dt>
                  <span className="meta-dot" style={{ background: "#22c55e" }} aria-hidden />
                  Created
                </dt>
                <dd>{formatDate(record.createdAt)}</dd>
              </>
            )}

            <dt>
              <span className="meta-dot" style={{ background: "#475569" }} aria-hidden />
              ID
            </dt>
            <dd>{record.id}</dd>
          </dl>
        </div>

{/* Quick-action text buttons removed — the icon row at the top of the panel
            already exposes Open / Show in folder / Copy path / Edit. */}

        <AboutPanel record={record} />

        {canPreview && (
          <PreviewSection
            record={record}
            preview={preview}
            isLoadingPreview={isLoadingPreview}
            previewKind={previewKind}
            previewTitle={previewTitle}
            previewSummary={previewSummary}
            onOpen={onOpen}
            onNavigate={onNavigate}
          />
        )}

        {!record.isDir && (
          <ImageAnalysisPanel
            record={record}
            rootPath={rootPath}
            onOpenFile={onSelectPath ?? onOpen}
          />
        )}

        {!record.isDir && (
          <CodeAnalysisPanel
            filePath={record.path}
            onOpenFile={onSelectPath ?? onOpen}
          />
        )}

        {!record.isDir && (
          <MarkdownAnalysisPanel
            filePath={record.path}
            onOpenFile={onSelectPath ?? onOpen}
          />
        )}
      </div>
    </div>
  );
}

interface PreviewSectionProps {
  record: FileRecord;
  preview: PreviewPayload | null;
  isLoadingPreview?: boolean;
  previewKind: PreviewKind;
  previewTitle: string;
  previewSummary: string;
  onOpen: (path: string) => void;
  onNavigate?: (path: string) => void;
}

function PreviewSection({
  record,
  preview,
  isLoadingPreview,
  previewKind,
  previewTitle,
  previewSummary,
  onOpen,
  onNavigate,
}: PreviewSectionProps) {
  const isImage = previewKind === "image";
  const isText = previewKind === "text";
  const isAudio = previewKind === "audio" || isAudioFile(record.extension);

  return (
    <section className="preview-section">
      <div className="panel-header">
        <h4>
          {isImage ? <ImageIcon size={12} strokeWidth={2} /> : isAudio ? <Music size={12} strokeWidth={2} /> : <RefreshCcw size={12} strokeWidth={2} />}
          Preview
        </h4>
        <div className="panel-actions panel-actions--compact">
          <button type="button" onClick={() => onOpen(record.path)} title="Open externally">
            <ExternalLink size={12} strokeWidth={2} />
          </button>
          {record.parentPath && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate(record.parentPath!)}
              title="Show parent folder"
            >
              <FolderOpen size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

{/* For images we keep the heading minimal — the file name and path are
          already shown in the record header above. Avoid repeating them. */}
      {!isImage && (
        <div className="preview-heading-block">
          <div className="preview-title-row">
            <div className="preview-title" title={previewTitle}>
              {previewTitle}
            </div>
            <span className={`preview-kind-badge preview-kind-${previewKind}`}>
              {previewKind}
            </span>
          </div>
          <p className="preview-summary">{previewSummary}</p>
        </div>
      )}

      {isLoadingPreview ? (
        <div className="empty-state small">
          <span className="scanning-indicator">⟳ Loading preview…</span>
        </div>
      ) : isAudio ? (
        <div className="preview-content preview-content-audio">
          <div className="audio-preview">
            <audio
              controls
              src={convertFileSrc(record.path)}
              className="audio-player"
              preload="metadata"
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        </div>
      ) : preview ? (
        <div className={`preview-content preview-content-${preview.kind}`}>
          {isImage && preview.content && (
            <div className="image-preview">
              <img src={preview.content} alt={preview.title} />
            </div>
          )}

          {isText && (
            <div className="text-preview">
              <div className="preview-code-header">
                <span className="preview-lang">
                  <span className="codicon codicon-file-code" />
                  <span>{languageLabel(record)}</span>
                </span>
                <span className="preview-code-stat">
                  {(preview.content?.split("\n").length ?? 0) || 1}{" "}
                  {(preview.content?.split("\n").length ?? 0) === 1 ? "line" : "lines"}
                </span>
              </div>
              <div className="preview-code-body">{renderCodePreview(preview.content || "")}</div>
            </div>
          )}

          {previewKind === "directory" && (
            <div className="preview-empty">
              <span className="codicon codicon-folder-opened" />
              <span>{preview.summary}</span>
            </div>
          )}

          {previewKind === "binary" && (
            <div className="preview-empty">
              <span className="codicon codicon-file-binary" />
              <span>{preview.summary}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state small">◌ No preview available</div>
      )}

      {preview?.metadata.length ? (
        <div className="preview-details">
          <div className="section-title">◈ Details</div>
          <dl className="preview-meta">
            {preview.metadata.map((item) => (
              <React.Fragment key={item.key}>
                <dt>{item.key}</dt>
                <dd title={item.value}>{item.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function languageLabel(record: FileRecord): string {
  const ext = record.extension?.toLowerCase();
  if (ext === "ts" || ext === "tsx") return "TypeScript";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "JavaScript";
  if (ext === "py" || ext === "pyi") return "Python";
  if (ext === "rs") return "Rust";
  if (ext === "md" || ext === "mdx") return "Markdown";
  if (ext === "json") return "JSON";
  if (ext === "yaml" || ext === "yml") return "YAML";
  if (ext === "toml") return "TOML";
  if (ext === "html" || ext === "htm") return "HTML";
  if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") return "CSS";
  if (ext === "svg") return "SVG";
  return record.extension?.toUpperCase() || "Text";
}

function renderCodePreview(content: string): React.ReactNode {
  const lines = content.split("\n");
  return lines.map((line, index) => (
    <div key={`${index}-${line.slice(0, 20)}`} className="preview-code-line">
      <span className="preview-code-gutter">{index + 1}</span>
      <span className="preview-code-text">{line || " "}</span>
    </div>
  ));
}

export const Inspector = memo(InspectorComponent);
export default Inspector;
