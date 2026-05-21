// Markdown rendering for `.md` / `.mdx` previews.
//
// We use `marked` for the parse + render and post-process the result to:
//   (a) turn `[[wikilinks]]` into clickable anchors with `data-wikilink`
//       attributes — the surrounding component intercepts clicks on those
//       to navigate within the workspace.
//   (b) defer code-block highlighting to our async `highlightSource` helper
//       so the markdown render stays sync and instant; code blocks light up
//       once highlight.js is loaded.

import { marked } from "marked";

// Wikilink syntax: `[[Note Name]]` or `[[Note Name|display]]`.
// Greedy-but-bounded match: anything except `]` between the brackets.
const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

/**
 * Pre-process `[[wikilinks]]` into HTML anchors before marked sees them.
 * Anchors carry the link target on `data-wikilink` so the React layer can
 * intercept clicks and route them to the workspace navigator.
 */
function preprocessWikilinks(source: string): string {
  return source.replace(WIKILINK_PATTERN, (_, body) => {
    const parts = String(body).split("|");
    const target = parts[0].trim();
    const label = (parts[1] ?? parts[0]).trim();
    const safeTarget = encodeURIComponent(target).replace(/"/g, "&quot;");
    const safeLabel = escapeHtml(label);
    return `<a href="#" class="md-wikilink" data-wikilink="${safeTarget}">${safeLabel}</a>`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Synchronously render markdown to HTML. Wikilinks are converted in-place. */
export function renderMarkdown(source: string): string {
  const withWikilinks = preprocessWikilinks(source);
  const html = marked.parse(withWikilinks, {
    async: false,
    gfm: true,
    breaks: false,
  });
  return typeof html === "string" ? html : "";
}
