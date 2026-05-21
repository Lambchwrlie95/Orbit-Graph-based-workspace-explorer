import { memo } from "react";
import { ArrowUpRight, Link2Off } from "lucide-react";
import type { NoteBacklink } from "../../types";

interface BacklinksPanelProps {
  backlinks: NoteBacklink[];
  /**
   * Whether the parent has finished its first NodeNote fetch. Drives the
   * "no backlinks yet" empty state vs. a quiet loading placeholder.
   */
  hasLoaded: boolean;
  /**
   * Click handler for an individual backlink row — receives the source
   * note's absolute path. Inspector pipes this to its existing
   * onSelectPath so the user lands in the source note's preview.
   */
  onOpen?: (sourcePath: string) => void;
}

/**
 * Lists notes that link TO the currently selected file via `[[wikilinks]]`.
 *
 * Source of truth is `NodeNote.backlinks`, materialized by
 * `note_backlinks_for_target` on the backend. Each row shows the source
 * note's label (or basename fallback) and is keyboard-navigable; clicking
 * forwards to the inspector's path selector so the graph + inspector both
 * jump to that note.
 *
 * Stays quiet (renders nothing) until the parent has finished loading the
 * NodeNote — avoids flashing an empty state during the request.
 */
function BacklinksPanelComponent({ backlinks, hasLoaded, onOpen }: BacklinksPanelProps) {
  if (!hasLoaded) return null;

  return (
    <section className="backlinks-panel">
      <div className="panel-header">
        <h4>
          <ArrowUpRight size={12} strokeWidth={2} />
          Backlinks
          {backlinks.length > 0 && <span className="panel-count">{backlinks.length}</span>}
        </h4>
      </div>
      {backlinks.length === 0 ? (
        <div className="empty-state small backlinks-empty">
          <Link2Off size={14} strokeWidth={1.6} />
          <span>No notes link here yet.</span>
        </div>
      ) : (
        <ul className="backlinks-list">
          {backlinks.map((link) => {
            const label = link.sourceLabel || basename(link.sourcePath) || link.sourcePath;
            return (
              <li key={`${link.sourcePath}-${link.target}`}>
                <button
                  type="button"
                  className="backlinks-row"
                  onClick={() => onOpen?.(link.sourcePath)}
                  title={link.sourcePath}
                >
                  <span className="backlinks-row-label">{label}</span>
                  <span className="backlinks-row-target">via [[{link.target}]]</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  if (idx < 0) return path;
  const tail = path.slice(idx + 1);
  const dot = tail.lastIndexOf(".");
  return dot > 0 ? tail.slice(0, dot) : tail;
}

export const BacklinksPanel = memo(BacklinksPanelComponent);
export default BacklinksPanel;
