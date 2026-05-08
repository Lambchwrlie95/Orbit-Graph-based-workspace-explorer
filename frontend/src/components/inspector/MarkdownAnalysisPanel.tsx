import React, { useState } from "react";
import { useMarkdownAnalysis } from "../../hooks/useMarkdownAnalysis";
import type { MarkdownLink } from "../../types";

interface MarkdownAnalysisPanelProps {
  filePath: string;
  onOpenFile: (path: string) => void;
}

export function MarkdownAnalysisPanel({ filePath, onOpenFile }: MarkdownAnalysisPanelProps) {
  const { analysis, loading, error, isMarkdown, refresh } = useMarkdownAnalysis(filePath);
  const [expanded, setExpanded] = useState({ outline: true, links: true });

  if (!isMarkdown && !loading) return null;

  const headings = analysis?.headings ?? [];
  const links = analysis?.links ?? [];
  const localLinks = links.filter((l) => l.kind === "local" || l.kind === "wikilink");
  const externalLinks = links.filter((l) => l.kind === "external");

  return (
    <div className="code-analysis-panel">
      <div className="panel-header">
        <h4>≡ Markdown</h4>
        {loading && <span className="loading-indicator">⟳ Analyzing…</span>}
        {!loading && (
          <button className="refresh-btn" onClick={refresh} title="Refresh markdown analysis">
            ↻
          </button>
        )}
      </div>

      {error && <div className="analysis-error">✗ {error}</div>}

      {headings.length > 0 && (
        <div className="analysis-section">
          <button
            className="section-header"
            onClick={() => setExpanded((p) => ({ ...p, outline: !p.outline }))}
          >
            <span className="section-icon">{expanded.outline ? "▾" : "▸"}</span>
            <span>§ Outline</span>
            <span className="item-count">{headings.length}</span>
          </button>
          {expanded.outline && (
            <ul className="markdown-outline">
              {headings.map((h, idx) => (
                <li
                  key={`${idx}-${h.line}`}
                  className={`outline-item outline-h${h.level}`}
                  style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                  title={`Line ${h.line}`}
                >
                  <span className="outline-bullet">{"#".repeat(h.level)}</span>
                  <span className="outline-text">{h.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(localLinks.length > 0 || externalLinks.length > 0) && (
        <div className="analysis-section">
          <button
            className="section-header"
            onClick={() => setExpanded((p) => ({ ...p, links: !p.links }))}
          >
            <span className="section-icon">{expanded.links ? "▾" : "▸"}</span>
            <span>↗ Links</span>
            <span className="item-count">{links.length}</span>
          </button>
          {expanded.links && (
            <div className="section-content">
              {localLinks.length > 0 && (
                <LinkGroup
                  title="Local"
                  glyph="⬡"
                  links={localLinks}
                  filePath={filePath}
                  onOpenFile={onOpenFile}
                />
              )}
              {externalLinks.length > 0 && (
                <LinkGroup
                  title="External"
                  glyph="↗"
                  links={externalLinks}
                  filePath={filePath}
                  onOpenFile={onOpenFile}
                />
              )}
            </div>
          )}
        </div>
      )}

      {!loading && headings.length === 0 && links.length === 0 && (
        <div className="analysis-empty">◌ No headings or links</div>
      )}
    </div>
  );
}

interface LinkGroupProps {
  title: string;
  glyph: string;
  links: MarkdownLink[];
  filePath: string;
  onOpenFile: (path: string) => void;
}

function LinkGroup({ title, glyph, links, filePath, onOpenFile }: LinkGroupProps) {
  return (
    <div className="import-group">
      <div className="import-group-title">
        <span className="import-group-icon">{glyph}</span>
        <span>{title}</span>
      </div>
      <ul className="import-items">
        {links.map((link, idx) => (
          <li key={`${link.target}-${idx}`} className="import-item">
            {link.kind === "external" ? (
              <span className="import-static" title={link.target}>
                <span className="import-name">{link.label}</span>
                <span className="import-path">{shortenUrl(link.target)}</span>
              </span>
            ) : (
              <button
                className="import-link"
                onClick={() => onOpenFile(resolveLocal(filePath, link.target))}
                title={`Open ${link.target}`}
              >
                <span className="import-name">{link.label}</span>
                <span className="import-path">{link.target}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return url;
  }
}

function resolveLocal(sourceFile: string, target: string): string {
  const clean = target.split("#")[0].split("?")[0];
  if (clean.startsWith("/")) return clean;
  const parts = sourceFile.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}
