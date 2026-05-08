import React, { memo } from "react";
import { Copy, ExternalLink, FileCode, FolderOpen, Image as ImageIcon, RefreshCcw } from "lucide-react";
import { FileRecord, PreviewPayload } from "../types";
import { formatBytes, formatDate, isImageFile, isTextFile, shortPath } from "../utils";
import { isEditableFile } from "./CodeMode";
import { CodeAnalysisPanel } from "./inspector/CodeAnalysisPanel";
import { ImageAnalysisPanel } from "./inspector/ImageAnalysisPanel";
import { MarkdownAnalysisPanel } from "./inspector/MarkdownAnalysisPanel";

interface InspectorProps {
  record: FileRecord | null;
  preview: PreviewPayload | null;
  isLoadingPreview?: boolean;
  rootPath?: string;
  onOpen: (path: string) => void;
  onSelectPath?: (path: string) => void;
  onNavigate?: (path: string) => void;
  onEdit?: (record: FileRecord) => void;
}

type PreviewKind = "text" | "image" | "directory" | "binary" | "error";

function fileTypeGlyph(ext?: string | null): string {
  const e = (ext ?? "").toLowerCase();
  if (e === "ts" || e === "tsx") return "⬡";
  if (e === "js" || e === "jsx" || e === "mjs" || e === "cjs") return "◈";
  if (e === "rs") return "⬖";
  if (e === "py" || e === "pyi" || e === "pyw") return "◇";
  if (e === "go") return "⬡";
  if (e === "java" || e === "kt" || e === "scala") return "◉";
  if (e === "c" || e === "cpp" || e === "cc" || e === "h" || e === "hpp") return "◑";
  if (e === "cs") return "◎";
  if (e === "rb") return "◆";
  if (e === "swift") return "◐";
  if (e === "sh" || e === "bash" || e === "zsh") return "▸";
  if (e === "md" || e === "mdx") return "≡";
  if (e === "html" || e === "htm") return "◫";
  if (e === "css" || e === "scss" || e === "sass" || e === "less") return "◌";
  if (e === "json") return "⊞";
  if (e === "toml" || e === "yaml" || e === "yml" || e === "xml" || e === "ini") return "⊟";
  if (e === "sql") return "⊞";
  if (e === "svg" || e === "png" || e === "jpg" || e === "jpeg" || e === "gif" || e === "webp") return "◈";
  if (e === "pdf") return "≡";
  return "·";
}

function InspectorComponent({
  record,
  preview,
  isLoadingPreview,
  rootPath,
  onOpen,
  onSelectPath,
  onNavigate,
  onEdit,
}: InspectorProps) {
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

  const canPreview = !record.isDir && (isTextFile(record.extension) || isImageFile(record.extension));
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
            <p className="panel-subtitle" title={record.path}>
              {shortPath(record.path)}
            </p>
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
            {!record.isDir && onEdit && isEditableFile(record) && (
              <button
                type="button"
                className="panel-action-primary"
                onClick={() => onEdit(record)}
                title="Open in code editor"
              >
                <FileCode size={13} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        <div className="record-header">
          <span className={`file-icon large ${record.isDir ? "folder" : ""}`}>
            {record.isDir ? "⊞" : fileTypeGlyph(record.extension)}
          </span>
          <div className="record-title">
            <h3 title={record.name}>{record.name}</h3>
            <p title={record.path}>{record.path}</p>
          </div>
        </div>

        <div className="metadata-section">
          <h4>◈ Information</h4>
          <dl className="meta-grid">
            <dt>⊟ Type</dt>
            <dd>{recordType}</dd>

            <dt>⊞ Size</dt>
            <dd>{record.isDir ? "—" : formatBytes(record.sizeBytes)}</dd>

            {record.extension && (
              <>
                <dt>· Ext</dt>
                <dd>.{record.extension}</dd>
              </>
            )}

            <dt>✎ Modified</dt>
            <dd>{formatDate(record.modifiedAt)}</dd>

            {record.createdAt && (
              <>
                <dt>✦ Created</dt>
                <dd>{formatDate(record.createdAt)}</dd>
              </>
            )}

            <dt># ID</dt>
            <dd>{record.id}</dd>
          </dl>
        </div>

        <div className="actions-section">
          <h4>⚡ Actions</h4>
          <div className="action-row">
            <button className="primary" onClick={() => onOpen(record.path)}>
              {record.isDir ? "Open Folder" : "Open File"}
            </button>
            {!record.isDir && onEdit && isEditableFile(record) && (
              <button
                className="secondary"
                onClick={() => onEdit(record)}
                title="Edit in Code Mode"
              >
                <FileCode size={14} style={{ marginRight: 4, display: "inline" }} />
                Edit
              </button>
            )}
            <button onClick={() => void navigator.clipboard?.writeText(record.path)}>
              Copy Path
            </button>
          </div>

          {record.parentPath && onNavigate && (
            <button
              className="secondary"
              onClick={() => onNavigate(record.parentPath!)}
            >
              Show in Folder
            </button>
          )}
        </div>

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
            onEdit={onEdit}
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
  onEdit?: (record: FileRecord) => void;
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
  onEdit,
}: PreviewSectionProps) {
  const isImage = previewKind === "image";
  const isText = previewKind === "text";
  const isEditable = !record.isDir && isEditableFile(record);

  return (
    <section className="preview-section">
      <div className="panel-header">
        <h4>
          {isImage ? <ImageIcon size={12} strokeWidth={2} /> : <RefreshCcw size={12} strokeWidth={2} />}
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
          {isEditable && onEdit && (
            <button
              type="button"
              className="panel-action-primary"
              onClick={() => onEdit(record)}
              title="Open in code editor"
            >
              <FileCode size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

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
        <span className="preview-path-label" title={record.path}>
          {record.path}
        </span>
      </div>

      {isLoadingPreview ? (
        <div className="empty-state small">
          <span className="scanning-indicator">⟳ Loading preview…</span>
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
