import React, { memo } from "react";
import { FileCode } from "lucide-react";
import { FileRecord, Mode, PreviewPayload } from "../types";
import { ModeSwitcher } from "./ModeSwitcher";
import { formatBytes, formatDate, isTextFile, isImageFile } from "../utils";

interface InspectorProps {
  record: FileRecord | null;
  preview: PreviewPayload | null;
  isLoadingPreview?: boolean;
  onOpen: (path: string) => void;
  onNavigate?: (path: string) => void;
  onEdit?: (record: FileRecord) => void;
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
}

// Text/code file extensions that can be edited
const EDITABLE_EXTENSIONS = new Set([
  // TypeScript/JavaScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  // Python
  '.py', '.pyw', '.pyi',
  // Rust
  '.rs',
  // Go
  '.go',
  // Java
  '.java', '.kt', '.scala',
  // C/C++
  '.c', '.cpp', '.cc', '.h', '.hpp',
  // C#
  '.cs',
  // Ruby
  '.rb',
  // PHP
  '.php',
  // Swift
  '.swift',
  // Shell
  '.sh', '.bash', '.zsh',
  // Config/Data
  '.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.conf', '.cfg',
  // Markdown
  '.md', '.mdx',
  // CSS/SCSS
  '.css', '.scss', '.sass', '.less',
  // HTML
  '.html', '.htm', '.svg',
  // SQL
  '.sql',
  // GraphQL
  '.graphql', '.gql',
  // Lua
  '.lua',
  // Perl
  '.pl',
  // R
  '.r', '.R',
  // Julia
  '.jl',
  // Dart
  '.dart',
  // Elixir
  '.ex', '.exs',
  // Erlang
  '.erl',
  // Haskell
  '.hs',
  // Clojure
  '.clj', '.cljs',
  // F#
  '.fs',
  // PowerShell
  '.ps1', '.psm1',
  // Batch
  '.bat', '.cmd',
  // Log/Text
  '.log', '.txt',
]);

// Files without extensions that can be edited
const EDITABLE_FILENAMES = new Set([
  'dockerfile',
  'makefile',
  'makefile.am',
  'makefile.in',
  'cmakelists.txt',
  'license',
  'readme',
  'changelog',
  'authors',
  'contributors',
  'copying',
  'install',
  'configure',
  'rakefile',
  'gemfile',
  'procfile',
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.editorconfig',
  '.eslintignore',
  '.prettierignore',
  '.npmignore',
  '.yarnignore',
  '.nvmrc',
  '.node-version',
  '.python-version',
  '.ruby-version',
  '.tool-versions',
  'manifest',
  'robots.txt',
  'humans.txt',
  'sitemap.xml',
]);

/**
 * Check if a file can be edited in the code editor
 */
function isEditableFile(file: FileRecord): boolean {
  if (file.isDir) {
    return false;
  }

  const fileName = file.name.toLowerCase();

  // Check for editable filenames (no extension or special names)
  if (EDITABLE_FILENAMES.has(fileName)) {
    return true;
  }

  // Check extension
  const lastDotIndex = file.name.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // No extension - allow editing (likely a script)
    return true;
  }

  const extension = file.name.slice(lastDotIndex).toLowerCase();
  return EDITABLE_EXTENSIONS.has(extension);
}

function InspectorComponent({
  record,
  preview,
  isLoadingPreview,
  onOpen,
  onNavigate,
  onEdit,
  currentMode,
  onModeChange,
}: InspectorProps) {
  const codeTab = (
    <>
      <h2>Code</h2>
      <ModeSwitcher
        currentMode={currentMode}
        onModeChange={onModeChange}
        modes={["code"]}
        className="inspector-nav"
      />
    </>
  );

  if (!record) {
    return (
      <aside className="inspector">
        {codeTab}
        <h2>Inspector</h2>
        <div className="empty-state small">Select a file or folder to view details</div>
      </aside>
    );
  }

  const canPreview = !record.isDir && (isTextFile(record.extension) || isImageFile(record.extension));

  return (
    <aside className="inspector">
      {codeTab}
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
              <FileCode size={14} style={{ marginRight: '4px', display: 'inline' }} />
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

export const Inspector = memo(InspectorComponent);
export default Inspector;
