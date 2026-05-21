import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FilePlus2, NotebookPen, Pencil, X } from "lucide-react";
import { tauriInvoke } from "../../lib/tauriCommands";
import { renderMarkdown } from "../../lib/markdown";
import { highlightSource } from "../../lib/syntax";
import { clearWikilinkCache, normalizeWikilinkTarget, resolveWikilink } from "../../lib/wikilinkResolver";
import type { NodeNote } from "../../types";

interface NotesPanelProps {
  /**
   * Absolute path of the file being annotated. Notes are keyed by path,
   * so switching the selected file in the inspector loads a different note.
   */
  path: string;
  /**
   * Workspace root, used to resolve `[[wikilinks]]` to actual files.
   * Without it wikilinks render as decoration only — clicks become no-ops.
   */
  rootPath?: string;
  /**
   * Receives the resolved absolute path when a wikilink resolves to a
   * real workspace file. Inspector forwards this to its existing
   * onSelectPath handler so the graph + inspector both jump.
   */
  onResolveWikilink?: (resolvedPath: string) => void;
  /**
   * Notify the parent when this panel's NodeNote payload changes so
   * sibling panels (BacklinksPanel) can update without re-fetching.
   */
  onNoteChanged?: (note: NodeNote | null) => void;
}

/**
 * Inspector panel for reading and editing the workspace-local note attached
 * to a file path.
 *
 * Two modes, switchable by the pencil icon:
 *   - Read    — markdown preview rendered via the shared `renderMarkdown`
 *               helper. Fenced code blocks lazy-highlight via hljs.
 *               Wikilinks intercept clicks and call `resolveWikilink`.
 *   - Edit    — plain textarea. Save commits via `save_node_note`.
 *               Cancel discards the in-flight draft.
 *
 * Drafts live in component state, NOT a per-path memo, because switching
 * selections always loads the latest persisted body anyway.
 *
 * Empty notes (no body persisted yet) render an inviting "Add a note"
 * affordance instead of a blank surface.
 */
function NotesPanelComponent({
  path,
  rootPath,
  onResolveWikilink,
  onNoteChanged,
}: NotesPanelProps) {
  const [note, setNote] = useState<NodeNote | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCreateTarget, setPendingCreateTarget] = useState<string | null>(null);
  const [isCreatingMissing, setIsCreatingMissing] = useState(false);

  // Reload note whenever the selected file path changes. We also reset the
  // mode to "read" so the user starts in the safer view.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setMode("read");
    setPendingCreateTarget(null);
    tauriInvoke("get_node_note", { path })
      .then((value) => {
        if (cancelled) return;
        setNote(value);
        setDraft(value.body ?? "");
        onNoteChanged?.(value);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, onNoteChanged]);

  const startEditing = useCallback(() => {
    setDraft(note?.body ?? "");
    setMode("edit");
  }, [note]);

  const cancelEditing = useCallback(() => {
    setDraft(note?.body ?? "");
    setMode("read");
  }, [note]);

  const save = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await tauriInvoke("save_node_note", { path, body: draft });
      setNote(saved);
      setDraft(saved.body ?? "");
      setMode("read");
      setPendingCreateTarget(null);
      onNoteChanged?.(saved);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  }, [draft, path, onNoteChanged]);

  const createMissingNote = useCallback(async () => {
    if (!rootPath || !pendingCreateTarget) return;
    setIsCreatingMissing(true);
    setError(null);
    try {
      const createdPath = await tauriInvoke("create_note_from_wikilink", {
        rootPath,
        target: pendingCreateTarget,
      });
      clearWikilinkCache();
      setPendingCreateTarget(null);
      onResolveWikilink?.(createdPath);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsCreatingMissing(false);
    }
  }, [rootPath, pendingCreateTarget, onResolveWikilink]);

  const hasBody = (note?.body ?? "").trim().length > 0;
  const isDirty = mode === "edit" && draft !== (note?.body ?? "");

  return (
    <section className="notes-panel">
      <div className="panel-header">
        <h4>
          <NotebookPen size={12} strokeWidth={2} />
          Notes
          {note?.updatedAt && (
            <span className="panel-meta" title={new Date(note.updatedAt * 1000).toLocaleString()}>
              · saved
            </span>
          )}
        </h4>
        <div className="panel-actions panel-actions--compact">
          {mode === "read" ? (
            <button type="button" onClick={startEditing} title="Edit note">
              <Pencil size={12} strokeWidth={2} />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={save}
                disabled={isSaving || !isDirty}
                title={isDirty ? "Save note" : "No changes"}
              >
                <Check size={12} strokeWidth={2} />
              </button>
              <button type="button" onClick={cancelEditing} title="Cancel">
                <X size={12} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="empty-state small notes-error">{error}</div>}

      {isLoading ? (
        <div className="empty-state small">
          <span className="scanning-indicator">⟳ Loading note…</span>
        </div>
      ) : mode === "edit" ? (
        <textarea
          className="notes-editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Markdown supported · [[wikilinks]] link to other files…"
          spellCheck
          autoFocus
        />
      ) : hasBody ? (
        <NotesReadView
          body={note?.body ?? ""}
          rootPath={rootPath}
          onResolveWikilink={onResolveWikilink}
          onMissingWikilink={setPendingCreateTarget}
        />
      ) : (
        <button type="button" className="notes-empty" onClick={startEditing}>
          <NotebookPen size={16} strokeWidth={1.6} />
          <span>No note here yet.</span>
          <span className="notes-empty-hint">Click to add one.</span>
        </button>
      )}

      {pendingCreateTarget && mode === "read" && (
        <div className="missing-wikilink-card">
          <div>
            <strong>[[{normalizeWikilinkTarget(pendingCreateTarget)}]] does not exist yet.</strong>
            <span>Create it as a Markdown note at the workspace root.</span>
          </div>
          <button
            type="button"
            className="link-button"
            disabled={!rootPath || isCreatingMissing}
            onClick={() => void createMissingNote()}
          >
            <FilePlus2 size={12} strokeWidth={2} />
            {isCreatingMissing ? "Creating…" : "Create note"}
          </button>
        </div>
      )}
    </section>
  );
}

interface NotesReadViewProps {
  body: string;
  rootPath?: string;
  onResolveWikilink?: (resolvedPath: string) => void;
  onMissingWikilink?: (target: string) => void;
}

/**
 * Read-mode rendering for the note body.
 *
 * Shares the same markdown render + lazy hljs upgrade pipeline as
 * MarkdownPreview, but is duplicated here (rather than imported) because
 * Notes need to RESOLVE wikilinks against `rootPath` and forward only
 * resolved hits to the navigator — not pass raw target strings.
 */
function NotesReadView({ body, rootPath, onResolveWikilink, onMissingWikilink }: NotesReadViewProps) {
  const html = useMemo(() => renderMarkdown(body), [body]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [unresolvedLinks, setUnresolvedLinks] = useState<Set<string>>(new Set());

  // Lazy-highlight any fenced code blocks once hljs loads.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const blocks = container.querySelectorAll<HTMLElement>("pre > code");
    blocks.forEach((codeEl) => {
      const langClass = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
      const language = langClass ? langClass.replace("language-", "") : null;
      if (!language) return;
      const source = codeEl.textContent ?? "";
      highlightSource(source, language).then((highlighted) => {
        if (cancelled || highlighted == null) return;
        codeEl.innerHTML = highlighted;
        codeEl.classList.add("hljs");
      });
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  const handleClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest<HTMLAnchorElement>("a.md-wikilink");
      if (!anchor) return;
      event.preventDefault();
      const raw = anchor.getAttribute("data-wikilink");
      if (!raw) return;
      const decoded = decodeURIComponent(raw);
      if (!rootPath) return;
      const resolved = await resolveWikilink(decoded, rootPath);
      if (resolved) {
        onResolveWikilink?.(resolved);
        return;
      }
      onMissingWikilink?.(decoded);
      // Cache the miss so we can decorate the link as "broken" without
      // re-querying on every click.
      setUnresolvedLinks((prev) => {
        if (prev.has(decoded)) return prev;
        const next = new Set(prev);
        next.add(decoded);
        return next;
      });
      anchor.classList.add("md-wikilink-missing");
    },
    [rootPath, onResolveWikilink, onMissingWikilink],
  );

  // After hljs may have asynchronously injected content, re-decorate any
  // wikilinks that we already know are misses.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || unresolvedLinks.size === 0) return;
    container.querySelectorAll<HTMLAnchorElement>("a.md-wikilink").forEach((anchor) => {
      const raw = anchor.getAttribute("data-wikilink");
      if (raw && unresolvedLinks.has(decodeURIComponent(raw))) {
        anchor.classList.add("md-wikilink-missing");
      }
    });
  }, [html, unresolvedLinks]);

  return (
    <div
      ref={containerRef}
      className="markdown-preview notes-body"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export const NotesPanel = memo(NotesPanelComponent);
export default NotesPanel;
