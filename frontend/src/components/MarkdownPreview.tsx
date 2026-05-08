import React, { useMemo } from "react";

interface MarkdownPreviewProps {
  content: string;
  onLinkClick?: (target: string) => void;
}

/**
 * Lightweight, safe markdown renderer. Builds React nodes directly so we never
 * pass user-authored HTML to `dangerouslySetInnerHTML`. Handles ATX headings,
 * paragraphs, fenced code blocks, ordered/unordered lists, blockquotes,
 * horizontal rules, inline code, bold, italic, and links.
 */
export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  onLinkClick,
}) => {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  return (
    <div className="markdown-preview">
      {blocks.map((block, idx) => renderBlock(block, idx, onLinkClick))}
    </div>
  );
};

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "hr" };

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^\s*(```|~~~)(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2].trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", lang, text: codeLines.join("\n") });
      continue;
    }

    // Horizontal rule (3+ of -, *, or _ on a line, optionally separated by spaces)
    if (/^\s*(?:-\s*){3,}$|^\s*(?:\*\s*){3,}$|^\s*(?:_\s*){3,}$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // ATX heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Blockquote (consume consecutive `>` lines)
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", lines: quoted });
      continue;
    }

    // List (unordered or ordered)
    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      const ordered = !!olMatch;
      const items: string[] = [];
      while (i < lines.length) {
        const u = lines[i].match(/^\s*[-*+]\s+(.*)$/);
        const o = lines[i].match(/^\s*\d+\.\s+(.*)$/);
        if (ordered ? o : u) {
          items.push((ordered ? o![1] : u![1]).trim());
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (gather until blank line / block boundary)
    const paragraph: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (
        next.trim() === "" ||
        /^(#{1,6})\s/.test(next) ||
        /^\s*(```|~~~)/.test(next) ||
        /^\s*[-*+]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next) ||
        /^\s*>\s?/.test(next)
      ) {
        break;
      }
      paragraph.push(next);
      i++;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function renderBlock(
  block: Block,
  key: number,
  onLinkClick?: (target: string) => void,
): React.ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${Math.min(6, block.level)}` as keyof JSX.IntrinsicElements;
      return (
        <Tag key={key} className={`md-h md-h${block.level}`}>
          {renderInline(block.text, onLinkClick)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="md-p">
          {renderInline(block.text, onLinkClick)}
        </p>
      );
    case "code":
      return (
        <pre key={key} className="md-code" data-lang={block.lang || undefined}>
          <code>{block.text}</code>
        </pre>
      );
    case "list":
      if (block.ordered) {
        return (
          <ol key={key} className="md-ol">
            {block.items.map((item, idx) => (
              <li key={idx}>{renderInline(item, onLinkClick)}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul key={key} className="md-ul">
          {block.items.map((item, idx) => (
            <li key={idx}>{renderInline(item, onLinkClick)}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote key={key} className="md-quote">
          {block.lines.map((line, idx) => (
            <p key={idx}>{renderInline(line, onLinkClick)}</p>
          ))}
        </blockquote>
      );
    case "hr":
      return <hr key={key} className="md-hr" />;
  }
}

interface InlineToken {
  kind: "text" | "code" | "bold" | "italic" | "link";
  value: string;
  href?: string;
}

/**
 * Inline parser — left-to-right scan with a fixed precedence list.
 * Order matters: `code` first so backticks claim their span before any other
 * markup gets misinterpreted inside them.
 */
function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const slice = text.slice(cursor);

    // Inline code
    const code = slice.match(/^`([^`]+)`/);
    if (code) {
      tokens.push({ kind: "code", value: code[1] });
      cursor += code[0].length;
      continue;
    }

    // Link [label](href)
    const link = slice.match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
    if (link) {
      tokens.push({ kind: "link", value: link[1], href: link[2] });
      cursor += link[0].length;
      continue;
    }

    // Bold **text**
    const bold = slice.match(/^\*\*([^*]+)\*\*/);
    if (bold) {
      tokens.push({ kind: "bold", value: bold[1] });
      cursor += bold[0].length;
      continue;
    }

    // Italic *text* — but not ** (already handled)
    const italic = slice.match(/^\*([^*]+)\*/);
    if (italic) {
      tokens.push({ kind: "italic", value: italic[1] });
      cursor += italic[0].length;
      continue;
    }

    // Plain text — consume until next markup-significant char
    const nextMarkup = slice.search(/[`*\[]/);
    if (nextMarkup === -1) {
      tokens.push({ kind: "text", value: slice });
      cursor += slice.length;
    } else if (nextMarkup === 0) {
      // Couldn't match any markup at this position; emit single char as text
      tokens.push({ kind: "text", value: slice[0] });
      cursor += 1;
    } else {
      tokens.push({ kind: "text", value: slice.slice(0, nextMarkup) });
      cursor += nextMarkup;
    }
  }

  return tokens;
}

function renderInline(
  text: string,
  onLinkClick?: (target: string) => void,
): React.ReactNode[] {
  return tokenizeInline(text).map((token, idx) => {
    switch (token.kind) {
      case "text":
        return <React.Fragment key={idx}>{token.value}</React.Fragment>;
      case "code":
        return (
          <code key={idx} className="md-inline-code">
            {token.value}
          </code>
        );
      case "bold":
        return <strong key={idx}>{token.value}</strong>;
      case "italic":
        return <em key={idx}>{token.value}</em>;
      case "link":
        if (!token.href) return <span key={idx}>{token.value}</span>;
        if (isExternal(token.href)) {
          return (
            <a
              key={idx}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="md-link external"
            >
              {token.value}
            </a>
          );
        }
        return (
          <button
            key={idx}
            type="button"
            className="md-link local"
            onClick={() => onLinkClick?.(token.href!)}
          >
            {token.value}
          </button>
        );
    }
  });
}

function isExternal(href: string): boolean {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("ftp://")
  );
}

export default MarkdownPreview;
