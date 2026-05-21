import React, { memo, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Archive, Copy, ExternalLink, FileText, FolderOpen, Image as ImageIcon, Info, Link2, ListTree, Music, Play, RefreshCcw, Pencil, StickyNote, Type } from "lucide-react";
import { FileRecord, NodeNote, PreviewPayload } from "../types";
import { formatBytes, formatDate, isArchiveFile, isAudioFile, isFontFile, isImageFile, isPdfFile, isTextFile, isVideoFile, shortPath } from "../utils";
import { AboutPanel } from "./inspector/AboutPanel";
import { BacklinksPanel } from "./inspector/BacklinksPanel";
import { CodeAnalysisPanel } from "./inspector/CodeAnalysisPanel";
import { ImageAnalysisPanel } from "./inspector/ImageAnalysisPanel";
import { MarkdownAnalysisPanel } from "./inspector/MarkdownAnalysisPanel";
import { NotesPanel } from "./inspector/NotesPanel";
import { useIconTheme } from "../hooks/useIconTheme";
import { tauriInvoke } from "../lib/tauriCommands";
import { highlightSource, languageForFile } from "../lib/syntax";
import { renderMarkdown } from "../lib/markdown";
import "highlight.js/styles/atom-one-dark.css";

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown"]);
function isMarkdownFile(extension?: string | null): boolean {
  if (!extension) return false;
  return MARKDOWN_EXTENSIONS.has(extension.toLowerCase());
}

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

type PreviewKind = "text" | "image" | "audio" | "video" | "pdf" | "font" | "archive" | "directory" | "binary" | "error";
type InspectorTab = "preview" | "context" | "notes";

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
  // Mirror of the most-recently loaded/saved NodeNote so sibling panels
  // (BacklinksPanel) can react to changes from NotesPanel without re-
  // fetching. NotesPanel owns the get/save lifecycle; the inspector just
  // keeps a reference for surface-area sharing.
  const [currentNote, setCurrentNote] = useState<NodeNote | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>("preview");
  useEffect(() => {
    // Reset on file switch so the previous note's backlinks don't briefly
    // appear under the new selection.
    setCurrentNote(null);
    setActiveTab("preview");
  }, [record?.path]);

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

  // Show preview if it's a known type OR the backend already returned a payload.
  // This lets unknown-extension files (e.g. "Procfile", scripts without extension)
  // preview when the backend successfully reads them as text.
  const canPreview =
    !record.isDir &&
    (
      isTextFile(record.extension) ||
      isImageFile(record.extension) ||
      isAudioFile(record.extension) ||
      isVideoFile(record.extension) ||
      isPdfFile(record.extension) ||
      isFontFile(record.extension) ||
      isArchiveFile(record.extension) ||
      preview !== null
    );
  const previewKind = (preview?.kind ?? (record.isDir ? "directory" : "binary")) as PreviewKind;
  const previewTitle = preview?.title || record.name;
  const previewSummary = preview?.summary || (record.isDir ? "Folder" : "No preview available");

  const recordType = record.isDir ? "Folder" : record.mimeType || record.extension || "File";
  const noteLinkCount = currentNote?.links.length ?? 0;
  const backlinkCount = currentNote?.backlinks.length ?? 0;
  const contextCount = (record.parentPath ? 1 : 0) + noteLinkCount + backlinkCount;
  const notesCount = noteLinkCount + backlinkCount;
  const activeInspectorTab = canPreview ? activeTab : activeTab === "preview" ? "context" : activeTab;

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
                  </>
                )}
              </div>
            </div>
          );
        })()}

        <div className="metadata-section metadata-section--glance">
          <h4>At a glance</h4>
          <dl className="meta-grid meta-grid--compact">
            <dt>
              <span className="meta-dot" style={{ background: "#94a3b8" }} aria-hidden />
              Kind
            </dt>
            <dd>{recordType}</dd>

            {!record.isDir && (
              <>
                <dt>
                  <span className="meta-dot" style={{ background: "#fbbf24" }} aria-hidden />
                  Size
                </dt>
                <dd>{formatBytes(record.sizeBytes)}</dd>
              </>
            )}

            <dt>
              <span className="meta-dot" style={{ background: "#f59e0b" }} aria-hidden />
              Modified
            </dt>
            <dd>{formatDate(record.modifiedAt)}</dd>
          </dl>
        </div>

        <InspectorTabs
          active={activeInspectorTab}
          canPreview={canPreview}
          contextCount={contextCount}
          notesCount={notesCount}
          onChange={setActiveTab}
        />

        {activeInspectorTab === "preview" && canPreview && (
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

        {activeInspectorTab === "context" && (
          <>
            <ContextSummaryPanel
              record={record}
              preview={preview}
              rootPath={rootPath}
              currentNote={currentNote}
              onOpen={onOpen}
              onNavigate={onNavigate}
              onSelectPath={onSelectPath}
            />
            <AboutPanel record={record} />
            {!record.isDir && isImageFile(record.extension) && (
              <ImageAnalysisPanel
                record={record}
                rootPath={rootPath}
                onOpenFile={onSelectPath ?? onOpen}
              />
            )}
            {!record.isDir && isTextFile(record.extension) && (
              <CodeAnalysisPanel
                filePath={record.path}
                onOpenFile={onSelectPath ?? onOpen}
              />
            )}
            {!record.isDir && isMarkdownFile(record.extension) && (
              <MarkdownAnalysisPanel
                filePath={record.path}
                onOpenFile={onSelectPath ?? onOpen}
              />
            )}
          </>
        )}

        <div hidden={activeInspectorTab !== "notes"}>
          <NotesPanel
            path={record.path}
            rootPath={rootPath}
            onResolveWikilink={onSelectPath ?? onNavigate}
            onNoteChanged={setCurrentNote}
          />
          <BacklinksPanel
            backlinks={currentNote?.backlinks ?? []}
            hasLoaded={currentNote !== null}
            onOpen={onSelectPath ?? onNavigate}
          />
        </div>
      </div>
    </div>
  );
}

interface InspectorTabsProps {
  active: InspectorTab;
  canPreview: boolean;
  contextCount: number;
  notesCount: number;
  onChange: (tab: InspectorTab) => void;
}

function InspectorTabs({ active, canPreview, contextCount, notesCount, onChange }: InspectorTabsProps) {
  const tabs: Array<{ id: InspectorTab; label: string; icon: React.ReactNode; count?: number; disabled?: boolean }> = [
    { id: "preview", label: "Preview", icon: <FileText size={12} />, disabled: !canPreview },
    { id: "context", label: "Context", icon: <ListTree size={12} />, count: contextCount },
    { id: "notes", label: "Notes", icon: <StickyNote size={12} />, count: notesCount },
  ];
  return (
    <div className="inspector-tabs" role="tablist" aria-label="Inspector sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`inspector-tab ${active === tab.id ? "active" : ""}`}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.count ? <span className="inspector-tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

interface ContextSummaryPanelProps {
  record: FileRecord;
  preview: PreviewPayload | null;
  rootPath?: string;
  currentNote: NodeNote | null;
  onOpen: (path: string) => void;
  onNavigate?: (path: string) => void;
  onSelectPath?: (path: string) => void;
}

function ContextSummaryPanel({ record, preview, rootPath, currentNote, onOpen, onNavigate, onSelectPath }: ContextSummaryPanelProps) {
  const relativePath = rootPath && record.path.startsWith(rootPath)
    ? record.path.slice(rootPath.length).replace(/^\/+/, "") || record.name
    : record.path;
  const meta = compactPreviewMetadata(preview);
  return (
    <section className="context-summary-panel">
      <div className="panel-header">
        <h4><Info size={12} strokeWidth={2} /> Context</h4>
      </div>
      <div className="context-path-card">
        <span className="context-path-label">Relative path</span>
        <code title={record.path}>{relativePath}</code>
        <div className="context-path-actions">
          <button type="button" className="link-button" onClick={() => void navigator.clipboard?.writeText(record.path)}>Copy full path</button>
          {relativePath !== record.path && (
            <button type="button" className="link-button" onClick={() => void navigator.clipboard?.writeText(relativePath)}>Copy relative</button>
          )}
        </div>
      </div>
      <div className="context-chip-grid">
        <ContextChip label="Kind" value={record.isDir ? "Folder" : record.mimeType || record.extension || "File"} />
        {!record.isDir && <ContextChip label="Size" value={formatBytes(record.sizeBytes)} />}
        <ContextChip label="Modified" value={formatDate(record.modifiedAt)} />
        {record.createdAt && <ContextChip label="Created" value={formatDate(record.createdAt)} />}
        {meta.map((item) => <ContextChip key={item.key} label={item.key} value={item.value} />)}
      </div>
      <div className="relationship-card">
        <div className="relationship-card-title"><Link2 size={12} /> Relationships</div>
        <button type="button" disabled={!record.parentPath || !onNavigate} onClick={() => record.parentPath && onNavigate?.(record.parentPath)}>
          Parent folder <strong>{record.parentPath ? shortPath(record.parentPath) : "—"}</strong>
        </button>
        <button type="button" disabled={(currentNote?.links.length ?? 0) === 0} onClick={() => onSelectPath?.(currentNote?.links[0]?.target ?? "")}>
          Note links <strong>{currentNote?.links.length ?? 0}</strong>
        </button>
        <button type="button" disabled={(currentNote?.backlinks.length ?? 0) === 0} onClick={() => onSelectPath?.(currentNote?.backlinks[0]?.sourcePath ?? "")}>
          Backlinks <strong>{currentNote?.backlinks.length ?? 0}</strong>
        </button>
      </div>
      <div className="context-action-row">
        <button type="button" onClick={() => onOpen(record.path)}><ExternalLink size={12} /> Open externally</button>
        {record.parentPath && onNavigate && <button type="button" onClick={() => onNavigate(record.parentPath!)}><FolderOpen size={12} /> Show parent</button>}
      </div>
    </section>
  );
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="context-chip" title={`${label}: ${value}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function compactPreviewMetadata(preview: PreviewPayload | null): Array<{ key: string; value: string }> {
  if (!preview?.metadata?.length) return [];
  const noisy = new Set(["type", "size", "modified"]);
  return preview.metadata.filter((item) => !noisy.has(item.key.toLowerCase())).slice(0, 8);
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
  const [wrapPreview, setWrapPreview] = useState(true);
  const isImage = previewKind === "image";
  const isText = previewKind === "text";
  const isAudio = previewKind === "audio" || isAudioFile(record.extension);
  const isVideo = previewKind === "video" || isVideoFile(record.extension);
  const isPdf = previewKind === "pdf" || isPdfFile(record.extension);
  const isFont = previewKind === "font" || isFontFile(record.extension);
  const isArchive = previewKind === "archive" || isArchiveFile(record.extension);

  const headerIcon = isImage ? <ImageIcon size={12} strokeWidth={2} />
    : isAudio ? <Music size={12} strokeWidth={2} />
    : isVideo ? <Play size={12} strokeWidth={2} />
    : isPdf ? <FileText size={12} strokeWidth={2} />
    : isFont ? <Type size={12} strokeWidth={2} />
    : isArchive ? <Archive size={12} strokeWidth={2} />
    : <RefreshCcw size={12} strokeWidth={2} />;

  return (
    <section className="preview-section">
      <div className="panel-header">
        <h4>
          {headerIcon}
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
        <AudioPreview
          path={record.path}
          title={previewTitle}
          mime={previewMime(preview)}
          onOpen={onOpen}
        />
      ) : isVideo ? (
        <div className="preview-content preview-content-video">
          <video
            controls
            src={convertFileSrc(record.path)}
            className="video-player"
            preload="metadata"
          >
            Your browser does not support video playback.
          </video>
        </div>
      ) : isPdf ? (
        <div className="preview-content preview-content-pdf">
          {/* WebKit's built-in PDF viewer handles the embed via the asset
              protocol. No external dependency needed; degrades to an
              "Open externally" button if the platform lacks a PDF plugin. */}
          <iframe
            src={convertFileSrc(record.path)}
            className="pdf-frame"
            title={previewTitle}
          />
        </div>
      ) : isFont ? (
        <FontPreview path={record.path} />
      ) : isArchive ? (
        <div className="preview-empty">
          <Archive size={20} strokeWidth={1.6} />
          <span>{previewSummary || "Archive contents listing not yet supported."}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => onOpen(record.path)}
          >
            Open externally
          </button>
        </div>
      ) : preview ? (
        <div className={`preview-content preview-content-${preview.kind}`}>
          {isImage && preview.content && (
            <div className="image-preview">
              <img src={preview.content} alt={preview.title} />
            </div>
          )}

          {isText && isMarkdownFile(record.extension) && (
            <div className={`text-preview text-preview-markdown ${wrapPreview ? "text-preview--wrap" : ""}`}>
              <div className="preview-code-header">
                <span className="preview-lang">
                  <span className="codicon codicon-file-code" />
                  <span>{languageLabel(record)}</span>
                </span>
                <button
                  type="button"
                  className={`preview-wrap-toggle ${wrapPreview ? "active" : ""}`}
                  onClick={() => setWrapPreview((value) => !value)}
                  aria-pressed={wrapPreview}
                  title={wrapPreview ? "Keep markdown/code wrapped" : "Wrap markdown/code to inspector width"}
                >
                  Wrap
                </button>
              </div>
              <MarkdownPreview source={preview.content || ""} onNavigate={onNavigate} />
            </div>
          )}

          {isText && !isMarkdownFile(record.extension) && (
            <div className={`text-preview ${wrapPreview ? "text-preview--wrap" : ""}`}>
              <div className="preview-code-header">
                <span className="preview-lang">
                  <span className="codicon codicon-file-code" />
                  <span>{languageLabel(record)}</span>
                </span>
                <span className="preview-code-stat">
                  {(preview.content?.split("\n").length ?? 0) || 1}{" "}
                  {(preview.content?.split("\n").length ?? 0) === 1 ? "line" : "lines"}
                </span>
                <button
                  type="button"
                  className={`preview-wrap-toggle ${wrapPreview ? "active" : ""}`}
                  onClick={() => setWrapPreview((value) => !value)}
                  aria-pressed={wrapPreview}
                  title={wrapPreview ? "Keep code wrapped" : "Wrap code to inspector width"}
                >
                  Wrap
                </button>
              </div>
              <div className="preview-code-body">
                <HighlightedCode
                  source={preview.content || ""}
                  language={languageForFile(record.extension, record.name)}
                />
              </div>
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
        <details className="preview-details">
          <summary>
            <span>Details</span>
            <span>{preview.metadata.length}</span>
          </summary>
          <dl className="preview-meta">
            {preview.metadata.map((item) => (
              <React.Fragment key={item.key}>
                <dt>{item.key}</dt>
                <dd title={item.value}>{item.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </details>
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

function previewMime(preview: PreviewPayload | null): string | undefined {
  return preview?.metadata.find((item) => item.key.toLowerCase() === "mime")?.value;
}

interface AudioPreviewProps {
  path: string;
  title: string;
  mime?: string;
  onOpen: (path: string) => void;
}

function AudioPreview({ path, title, mime, onOpen }: AudioPreviewProps) {
  const [playbackError, setPlaybackError] = useState(false);
  const src = React.useMemo(() => convertFileSrc(path), [path]);

  useEffect(() => {
    setPlaybackError(false);
  }, [path]);

  return (
    <div className="preview-content preview-content-audio">
      <div className="audio-preview audio-preview--card">
        <div className="audio-preview-art" aria-hidden>
          <Music size={28} strokeWidth={1.6} />
        </div>
        <div className="audio-preview-main">
          <div className="audio-preview-title" title={title}>{title}</div>
          <audio
            controls
            className="audio-player"
            preload="metadata"
            onCanPlay={() => setPlaybackError(false)}
            onError={() => setPlaybackError(true)}
          >
            <source src={src} type={mime || undefined} />
            Your browser does not support audio playback.
          </audio>
          {playbackError && (
            <div className="audio-preview-error">
              Embedded playback could not decode this file. Open it in your system player instead.
            </div>
          )}
          <div className="audio-preview-actions">
            {mime && <span className="audio-preview-mime">{mime}</span>}
            <button type="button" className="link-button" onClick={() => onOpen(path)}>
              Open in mpv/system player
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FontPreviewProps {
  path: string;
}

/**
 * Live font preview for `.ttf` / `.otf` / `.woff` / `.woff2` files.
 *
 * The file is loaded via the FontFace constructor pointed at Tauri's asset
 * protocol URL (no base64 round-trip — large fonts stream straight from
 * disk). On success the font is registered with the document so the
 * preview pangram and size ladder render in the user's actual typeface.
 *
 * The temporary FontFace is cleaned up when the component unmounts or the
 * path changes so we don't leak font registrations between previews.
 */
function FontPreview({ path }: FontPreviewProps) {
  // A deterministic family name so reloads with the same path are idempotent.
  const fontFamily = React.useMemo(
    () => `orbit-font-preview-${btoa(unescape(encodeURIComponent(path))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`,
    [path],
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let fontFace: FontFace | null = null;
    setStatus("loading");
    try {
      fontFace = new FontFace(fontFamily, `url(${convertFileSrc(path)})`);
      fontFace.load()
        .then((loaded) => {
          if (cancelled) return;
          document.fonts.add(loaded);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    } catch {
      setStatus("error");
    }
    return () => {
      cancelled = true;
      if (fontFace) document.fonts.delete(fontFace);
    };
  }, [path, fontFamily]);

  if (status === "error") {
    return (
      <div className="preview-empty">
        <Type size={20} strokeWidth={1.6} />
        <span>Couldn’t load this font for preview.</span>
      </div>
    );
  }

  return (
    <div className="preview-content preview-content-font">
      <div className="font-preview" style={{ fontFamily, opacity: status === "ready" ? 1 : 0.5 }}>
        <div className="font-preview-pangram">
          The quick brown fox jumps over the lazy dog.
        </div>
        <div className="font-preview-ladder">
          {[12, 14, 18, 24, 32, 48].map((size) => (
            <div key={size} className="font-preview-row" style={{ fontSize: size }}>
              <span className="font-preview-size">{size}px</span>
              <span className="font-preview-sample">Sphinx of black quartz, judge my vow.</span>
            </div>
          ))}
        </div>
        <div className="font-preview-alphabet">
          ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
        </div>
      </div>
    </div>
  );
}

interface MarkdownPreviewProps {
  source: string;
  onNavigate?: (path: string) => void;
}

/**
 * Render markdown previews (`.md` / `.mdx`) as styled HTML.
 *
 * Wikilinks (`[[Note Name]]`) get pre-processed into anchors carrying a
 * `data-wikilink` attribute; we intercept clicks on them here and forward
 * the decoded target to `onNavigate` so the workspace can resolve it the
 * same way the explorer does.
 *
 * Fenced code blocks render as plain `<pre><code>` first, then get
 * upgraded asynchronously by highlight.js once the language module loads —
 * keeps the markdown render itself synchronous and instant.
 */
function MarkdownPreview({ source, onNavigate }: MarkdownPreviewProps) {
  const html = React.useMemo(() => renderMarkdown(source), [source]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Walk fenced code blocks and run highlight.js on each one.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const blocks = container.querySelectorAll<HTMLElement>("pre > code");
    blocks.forEach((codeEl) => {
      // marked sets `class="language-xxx"` on the <code> element for fenced
      // blocks. Extract the language id and try to highlight; bail silently
      // if unknown.
      const langClass = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
      const language = langClass ? langClass.replace("language-", "") : null;
      if (!language) return;
      const original = codeEl.textContent ?? "";
      highlightSource(original, language).then((highlighted) => {
        if (cancelled || highlighted == null) return;
        codeEl.innerHTML = highlighted;
        codeEl.classList.add("hljs");
      });
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  // Intercept wikilink clicks and forward to onNavigate.
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest<HTMLAnchorElement>("a.md-wikilink");
    if (!anchor) return;
    event.preventDefault();
    const raw = anchor.getAttribute("data-wikilink");
    if (raw && onNavigate) onNavigate(decodeURIComponent(raw));
  };

  return (
    <div
      ref={containerRef}
      className="markdown-preview"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface HighlightedCodeProps {
  source: string;
  language: string | null;
}

/**
 * Code preview with line numbers and async syntax highlighting via hljs.
 *
 * Renders the plain-text version immediately so the preview is never blank,
 * then upgrades to highlighted markup once `highlightSource` resolves. The
 * gutter and per-line container stay the same in both states so there's no
 * layout jump when highlighting lands.
 *
 * Files without a known language id (or where highlighting fails) keep the
 * plain-text rendering — never an error, never a flash of broken markup.
 */
function HighlightedCode({ source, language }: HighlightedCodeProps) {
  const [highlightedLines, setHighlightedLines] = useState<string[] | null>(null);

  useEffect(() => {
    setHighlightedLines(null);
    if (!language || !source) return;
    let cancelled = false;
    highlightSource(source, language)
      .then((html) => {
        if (cancelled || html == null) return;
        // highlight.js emits a single HTML string — split on newline so each
        // line gets its own gutter row. Empty lines are preserved as " " so
        // the row still occupies vertical space.
        const lines = html.split("\n").map((line) => (line.length ? line : " "));
        setHighlightedLines(lines);
      })
      .catch(() => {
        if (!cancelled) setHighlightedLines(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source, language]);

  const plainLines = source.split("\n");

  return (
    <>
      {plainLines.map((line, index) => {
        const html = highlightedLines?.[index];
        return (
          <div key={index} className="preview-code-line">
            <span className="preview-code-gutter">{index + 1}</span>
            {html !== undefined ? (
              <span
                className="preview-code-text hljs"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <span className="preview-code-text">{line || " "}</span>
            )}
          </div>
        );
      })}
    </>
  );
}

export const Inspector = memo(InspectorComponent);
export default Inspector;
