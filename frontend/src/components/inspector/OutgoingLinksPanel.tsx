import { memo, useCallback, useState } from "react";
import { ArrowDownRight, FilePlus2, Link2Off } from "lucide-react";
import type { NoteLink } from "../../types";
import { tauriInvoke } from "../../lib/tauriCommands";
import { clearWikilinkCache, resolveWikilink } from "../../lib/wikilinkResolver";

interface OutgoingLinksPanelProps {
  links: NoteLink[];
  rootPath?: string;
  hasLoaded: boolean;
  onOpen?: (path: string) => void;
}

function OutgoingLinksPanelComponent({ links, rootPath, hasLoaded, onOpen }: OutgoingLinksPanelProps) {
  const [creatingTarget, setCreatingTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openOrCreate = useCallback(
    async (target: string) => {
      if (!rootPath) return;
      setError(null);
      const resolved = await resolveWikilink(target, rootPath);
      if (resolved) {
        onOpen?.(resolved);
        return;
      }
      setCreatingTarget(target);
      try {
        const createdPath = await tauriInvoke("create_note_from_wikilink", { rootPath, target });
        clearWikilinkCache();
        onOpen?.(createdPath);
      } catch (err) {
        setError(String(err));
      } finally {
        setCreatingTarget(null);
      }
    },
    [rootPath, onOpen],
  );

  if (!hasLoaded) return null;

  return (
    <section className="outgoing-links-panel">
      <div className="panel-header">
        <h4>
          <ArrowDownRight size={12} strokeWidth={2} />
          Outgoing links
          {links.length > 0 && <span className="panel-count">{links.length}</span>}
        </h4>
      </div>
      {error && <div className="empty-state small notes-error">{error}</div>}
      {links.length === 0 ? (
        <div className="empty-state small backlinks-empty">
          <Link2Off size={14} strokeWidth={1.6} />
          <span>This note does not link out yet.</span>
        </div>
      ) : (
        <ul className="backlinks-list">
          {links.map((link) => (
            <li key={`${link.target}-${link.label}`}>
              <button
                type="button"
                className="backlinks-row"
                disabled={!rootPath || creatingTarget === link.target}
                onClick={() => void openOrCreate(link.target)}
                title={rootPath ? `Open or create [[${link.target}]]` : "Open a workspace first"}
              >
                <span className="backlinks-row-label">{link.label || link.target}</span>
                <span className="backlinks-row-target">
                  {creatingTarget === link.target ? "creating…" : `[[${link.target}]]`}
                  {creatingTarget === link.target && <FilePlus2 size={11} strokeWidth={1.8} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const OutgoingLinksPanel = memo(OutgoingLinksPanelComponent);
export default OutgoingLinksPanel;
