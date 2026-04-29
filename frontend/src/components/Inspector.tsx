import React from "react";
import { FileRecord, PreviewPayload } from "../types";
import { formatBytes, formatDate, isTextFile, isImageFile } from "../utils";
import { CodeAnalysisPanel } from "./inspector/CodeAnalysisPanel";
import { isCodeFile } from "../hooks/useCodeAnalysis";

interface InspectorProps {
  record: FileRecord | null;
  preview: PreviewPayload | null;
  isLoadingPreview?: boolean;
  onOpen: (path: string) => void;
  onNavigate?: (path: string) => void;
}

export function Inspector({ record, preview, isLoadingPreview, onOpen, onNavigate, onEdit }: InspectorProps) {
  if (!record) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <div className="empty-state small">Select a file or folder to view details</div>
      </aside>
    );
  }

  const canPreview = !record.isDir && (isTextFile(record.extension) || isImageFile(record.extension));

  return (
    <aside className="inspector">
      <h2>Inspector</h2>

      <div className="record-header">
        <span className={`file-icon large ${record.isDir ? "folder" : ""}`}>
          {record.isDir ? "D" : (record.extension || "F").slice(0, 2).toUpperCase()}
        </span>
        <div className="record-title">
          <h3 title={record.name}>{record.name}</h3>
          <p title={record.path}>{record.path}</p>
        </div>
      </div>

      <div className="metadata-section">
        <h4>Information</h4>
        <dl className="meta-grid">
          <dt>Type</dt>
          <dd>{record.isDir ? "Folder" : record.mimeType || record.extension || "File"}</dd>

          <dt>Size</dt>
          <dd>{record.isDir ? "—" : formatBytes(record.sizeBytes)}</dd>

          {record.extension && (
            <>
              <dt>Extension</dt>
              <dd>.{record.extension}</dd>
            </>
          )}

          <dt>Modified</dt>
          <dd>{formatDate(record.modifiedAt)}</dd>

          {record.createdAt && (
            <>
              <dt>Created</dt>
              <dd>{formatDate(record.createdAt)}</dd>
            </>
          )}

          <dt>ID</dt>
          <dd>{record.id}</dd>
        </dl>
      </div>

      <div className="actions-section">
        <h4>Actions</h4>
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
              <FileCode size={14} style={{ marginRight: '4px' }} />
              Edit
            </button>
          )}
          <button onClick={() => navigator.clipboard?.writeText(record.path)}>
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
        isLoadingPreview ? (
          <div className="preview-section">
            <h4>Preview</h4>
            <div className="empty-state small">
              <span className="scanning-indicator">Loading preview...</span>
            </div>
          </div>
        ) : preview ? (
          <PreviewSection preview={preview} />
        ) : null
      )}

      {/* Code Analysis Panel */}
      {record && !record.isDir && isCodeFile(record.path) && (
        <CodeAnalysisPanel
          filePath={record.path}
          onOpenFile={onOpen}
        />
      )}
    </aside>
  );
}

interface PreviewSectionProps {
  preview: PreviewPayload;
}

function PreviewSection({ preview }: PreviewSectionProps) {
  const isImage = preview.kind === "image";
  const isText = preview.kind === "text";

  return (
    <div className="preview-section">
      <h4>Preview</h4>

      {isImage && preview.content && (
        <div className="image-preview">
          <img src={preview.content} alt={preview.title} />
        </div>
      )}

      {isText && (
        <div className="text-preview">
          <pre>{preview.content || "(empty file)"}</pre>
        </div>
      )}

      <p className="preview-summary">{preview.summary}</p>

      {preview.metadata.length > 0 && (
        <dl className="meta-grid small">
          {preview.metadata.map((item) => (
            <React.Fragment key={item.key}>
              <dt>{item.key}</dt>
              <dd>{item.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
