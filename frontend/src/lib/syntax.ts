// Lazy-loaded syntax highlighting for preview surfaces.
//
// We use highlight.js's `common` bundle (33 mainstream languages, ~85 KB
// minified) on first call, then dynamically import individual language
// modules for anything outside the common set. The hljs core itself stays
// out of the main bundle until the first preview that needs it.
//
// The output is highlighted HTML wrapped in a hljs <span> tree. The caller
// renders it with `dangerouslySetInnerHTML` — highlight.js escapes user
// content before emitting markup, so it's safe to inject as-is.

import type { HLJSApi } from "highlight.js";

let hljsPromise: Promise<HLJSApi> | null = null;
const loadedLanguages = new Set<string>();

/**
 * Map of file extensions and common filenames → highlight.js language ids.
 * Keep this list exhaustive for "things Orbit shows in the previewer" —
 * unknown extensions fall back to plain text (no highlighting), not a
 * broken render.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript family
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript",
  // Web
  html: "xml", htm: "xml", svg: "xml", xml: "xml", xhtml: "xml",
  css: "css", scss: "scss", sass: "scss", less: "less",
  vue: "xml", svelte: "xml", astro: "xml",
  // Systems
  rs: "rust",
  go: "go",
  c: "c", h: "c",
  cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp",
  cs: "csharp",
  java: "java", kt: "kotlin", kts: "kotlin", scala: "scala",
  swift: "swift",
  zig: "zig",
  nim: "nim",
  // Scripting
  py: "python", pyi: "python", pyx: "python",
  rb: "ruby",
  php: "php",
  lua: "lua",
  pl: "perl", pm: "perl",
  r: "r",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  ps1: "powershell", psm1: "powershell",
  bat: "dos", cmd: "dos",
  // Data / config
  json: "json", jsonc: "json", json5: "json",
  yaml: "yaml", yml: "yaml",
  toml: "ini",
  ini: "ini", cfg: "ini", conf: "ini", env: "ini",
  // Docs
  md: "markdown", mdx: "markdown", markdown: "markdown",
  tex: "latex", bib: "latex",
  rst: "rst",
  // Database / query
  sql: "sql", psql: "sql", mysql: "sql",
  graphql: "graphql", gql: "graphql",
  // Build / infra
  dockerfile: "dockerfile",
  makefile: "makefile",
  cmake: "cmake",
  // Functional
  hs: "haskell", lhs: "haskell",
  ex: "elixir", exs: "elixir",
  erl: "erlang", hrl: "erlang",
  ml: "ocaml", mli: "ocaml",
  fs: "fsharp", fsi: "fsharp", fsx: "fsharp",
  clj: "clojure", cljs: "clojure", cljc: "clojure", edn: "clojure",
  // Other
  diff: "diff", patch: "diff",
  proto: "protobuf",
  sol: "solidity",
  vim: "vim",
  asm: "x86asm", s: "x86asm",
};

const FILENAME_TO_LANGUAGE: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  rakefile: "ruby",
  gemfile: "ruby",
  procfile: "yaml",
  ".gitignore": "ini",
  ".gitattributes": "ini",
  ".editorconfig": "ini",
  ".env": "ini",
  ".npmrc": "ini",
  ".bashrc": "bash",
  ".zshrc": "bash",
};

/** Return the hljs language id for a given file, or null when no highlight rule applies. */
export function languageForFile(extension?: string | null, filename?: string | null): string | null {
  if (filename) {
    const fnameLc = filename.toLowerCase();
    if (FILENAME_TO_LANGUAGE[fnameLc]) return FILENAME_TO_LANGUAGE[fnameLc];
  }
  if (!extension) return null;
  return EXTENSION_TO_LANGUAGE[extension.toLowerCase()] ?? null;
}

/**
 * Highlight a snippet of source. Returns ready-to-inject HTML or `null`
 * when highlighting isn't available (load failure, unknown language). On
 * failure callers should fall back to plain-text rendering — never throw.
 */
export async function highlightSource(
  source: string,
  language: string,
): Promise<string | null> {
  try {
    const hljs = await loadHljsCore();
    await ensureLanguageLoaded(hljs, language);
    if (!hljs.getLanguage(language)) return null;
    const { value } = hljs.highlight(source, { language, ignoreIllegals: true });
    return value;
  } catch {
    return null;
  }
}

async function loadHljsCore(): Promise<HLJSApi> {
  if (!hljsPromise) {
    hljsPromise = import("highlight.js/lib/common").then((mod) => {
      const hljs = (mod.default ?? mod) as HLJSApi;
      // The common bundle pre-registers ~33 languages. Mark them as loaded
      // so we don't try to dynamic-import duplicates.
      for (const name of hljs.listLanguages()) loadedLanguages.add(name);
      return hljs;
    });
  }
  return hljsPromise;
}

// Static import map so Vite can code-split each language at build time.
// Only languages referenced by EXTENSION_TO_LANGUAGE / FILENAME_TO_LANGUAGE
// are included here. Add new entries when extending the maps above.
const LANGUAGE_IMPORTS: Record<string, () => Promise<unknown>> = {
  bash: () => import("highlight.js/lib/languages/bash"),
  c: () => import("highlight.js/lib/languages/c"),
  clojure: () => import("highlight.js/lib/languages/clojure"),
  cmake: () => import("highlight.js/lib/languages/cmake"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  css: () => import("highlight.js/lib/languages/css"),
  diff: () => import("highlight.js/lib/languages/diff"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  dos: () => import("highlight.js/lib/languages/dos"),
  elixir: () => import("highlight.js/lib/languages/elixir"),
  erlang: () => import("highlight.js/lib/languages/erlang"),
  fsharp: () => import("highlight.js/lib/languages/fsharp"),
  go: () => import("highlight.js/lib/languages/go"),
  graphql: () => import("highlight.js/lib/languages/graphql"),
  haskell: () => import("highlight.js/lib/languages/haskell"),
  ini: () => import("highlight.js/lib/languages/ini"),
  java: () => import("highlight.js/lib/languages/java"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  json: () => import("highlight.js/lib/languages/json"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  latex: () => import("highlight.js/lib/languages/latex"),
  less: () => import("highlight.js/lib/languages/less"),
  lua: () => import("highlight.js/lib/languages/lua"),
  makefile: () => import("highlight.js/lib/languages/makefile"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  nim: () => import("highlight.js/lib/languages/nim"),
  ocaml: () => import("highlight.js/lib/languages/ocaml"),
  perl: () => import("highlight.js/lib/languages/perl"),
  php: () => import("highlight.js/lib/languages/php"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  protobuf: () => import("highlight.js/lib/languages/protobuf"),
  python: () => import("highlight.js/lib/languages/python"),
  r: () => import("highlight.js/lib/languages/r"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  rust: () => import("highlight.js/lib/languages/rust"),
  scala: () => import("highlight.js/lib/languages/scala"),
  scss: () => import("highlight.js/lib/languages/scss"),
  sql: () => import("highlight.js/lib/languages/sql"),
  swift: () => import("highlight.js/lib/languages/swift"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  vim: () => import("highlight.js/lib/languages/vim"),
  "x86asm": () => import("highlight.js/lib/languages/x86asm"),
  xml: () => import("highlight.js/lib/languages/xml"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
};

async function ensureLanguageLoaded(hljs: HLJSApi, language: string): Promise<void> {
  if (loadedLanguages.has(language)) return;
  const load = LANGUAGE_IMPORTS[language];
  if (!load) return; // unknown language — no warning, no registration
  try {
    const mod = await load();
    const grammar = (mod as any).default ?? mod;
    hljs.registerLanguage(language, grammar);
    loadedLanguages.add(language);
  } catch {
    // leave unregistered; caller falls back to plain text.
  }
}
