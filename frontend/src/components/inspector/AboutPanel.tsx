import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ExternalLink, RefreshCcw, Search } from "lucide-react";
import type { FileRecord } from "../../types";
import { lookupWiki, invalidateWikiCache, type WikiSummary } from "../../lib/wiki";
import { wikiQueryFor } from "../../lib/wikiQuery";

interface AboutPanelProps {
  record: FileRecord;
}

type Status = "idle" | "loading" | "ready" | "empty" | "error";

export function AboutPanel({ record }: AboutPanelProps) {
  const derivedQuery = useMemo(() => wikiQueryFor(record) ?? "", [record.path, record.name, record.extension, record.isDir]);
  const [query, setQuery] = useState(derivedQuery);
  const [draftQuery, setDraftQuery] = useState(derivedQuery);
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const [status, setStatus] = useState<Status>(derivedQuery ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Reset to derived term when the selection changes
  useEffect(() => {
    setQuery(derivedQuery);
    setDraftQuery(derivedQuery);
  }, [derivedQuery]);

  useEffect(() => {
    abortRef.current?.abort();
    if (!query.trim()) {
      setStatus("idle");
      setSummary(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setError(null);
    lookupWiki(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSummary(result);
        setStatus(result ? "ready" : "empty");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => controller.abort();
  }, [query, refreshTick]);

  const refresh = useCallback(() => {
    if (!query.trim()) return;
    invalidateWikiCache(query);
    setRefreshTick((n) => n + 1);
  }, [query]);

  const commitDraft = () => {
    const trimmed = draftQuery.trim();
    if (!trimmed || trimmed === query) return;
    setQuery(trimmed);
  };

  return (
    <section className="about-panel">
      <div className="panel-header">
        <h4>
          <BookOpen size={12} strokeWidth={2} />
          About
        </h4>
        <div className="panel-actions panel-actions--compact">
          {query && (
            <button type="button" onClick={refresh} title="Refresh">
              <RefreshCcw size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div className="about-query-row">
        <Search size={12} strokeWidth={2} className="about-query-icon" aria-hidden />
        <input
          type="text"
          className="about-query-input"
          value={draftQuery}
          placeholder="Wikipedia search term"
          onChange={(e) => setDraftQuery(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            } else if (e.key === "Escape") {
              setDraftQuery(query);
            }
          }}
        />
      </div>

      {status === "idle" && (
        <div className="empty-state small">◌ No Wikipedia term inferred. Type one above.</div>
      )}
      {status === "loading" && (
        <div className="empty-state small">
          <span className="scanning-indicator">⟳ Searching Wikipedia…</span>
        </div>
      )}
      {status === "empty" && (
        <div className="empty-state small">◌ No Wikipedia article for “{query}”.</div>
      )}
      {status === "error" && (
        <div className="empty-state small">✗ {error ?? "Wikipedia lookup failed"}</div>
      )}
      {status === "ready" && summary && (
        <div className="about-content">
          {summary.thumbnail && (
            <img className="about-thumb" src={summary.thumbnail} alt="" loading="lazy" />
          )}
          <div className="about-body">
            <div className="about-title" title={summary.title}>{summary.title}</div>
            <p className="about-extract">{summary.extract}</p>
            <a
              className="about-link"
              href={summary.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              <ExternalLink size={11} strokeWidth={2} />
              Read on Wikipedia
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
