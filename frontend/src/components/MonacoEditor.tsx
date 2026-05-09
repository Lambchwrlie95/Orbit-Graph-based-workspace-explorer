import React, { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

/**
 * Monaco Editor wrapper component
 * 
 * Provides a code editor with:
 * - Language detection from file extension
 * - Syntax highlighting for common languages
 * - Line numbers, minimap, word wrap
 * - Dark theme matching Orbit
 * - Change tracking and save shortcut handling
 */

export interface MonacoEditorProps {
  filePath: string;
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
  readOnly?: boolean;
}

// Language detection mapping
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // TypeScript/JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  
  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',
  
  // Rust
  '.rs': 'rust',
  
  // Go
  '.go': 'go',
  
  // Java
  '.java': 'java',
  
  // C/C++
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  
  // C#
  '.cs': 'csharp',
  
  // Ruby
  '.rb': 'ruby',
  
  // PHP
  '.php': 'php',
  
  // Swift
  '.swift': 'swift',
  
  // Kotlin
  '.kt': 'kotlin',
  
  // Shell/Bash
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  
  // Configuration/Data formats
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  
  // Markdown
  '.md': 'markdown',
  '.mdx': 'markdown',
  
  // CSS/SCSS/LESS
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  
  // HTML
  '.html': 'html',
  '.htm': 'html',
  '.svg': 'xml',
  
  // SQL
  '.sql': 'sql',
  
  // GraphQL
  '.graphql': 'graphql',
  '.gql': 'graphql',
  
  // Docker
  'dockerfile': 'dockerfile',
  
  // Lua
  '.lua': 'lua',
  
  // Perl
  '.pl': 'perl',
  
  // R
  '.r': 'r',
  '.R': 'r',
  
  // Julia
  '.jl': 'julia',
  
  // Dart
  '.dart': 'dart',
  
  // Elixir
  '.ex': 'elixir',
  '.exs': 'elixir',
  
  // Erlang
  '.erl': 'erlang',
  
  // Haskell
  '.hs': 'haskell',
  
  // Scala
  '.scala': 'scala',
  
  // Clojure
  '.clj': 'clojure',
  '.cljs': 'clojure',
  
  // F#
  '.fs': 'fsharp',
  
  // PowerShell
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  
  // Batch
  '.bat': 'bat',
  '.cmd': 'bat',
  
  // Ini/Config
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  
  // Log files
  '.log': 'plaintext',
  
  // Plain text
  '.txt': 'plaintext',
};

/**
 * Detect language from file path
 */
function detectLanguage(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  
  // Check for Dockerfile (no extension)
  const fileName = filePath.split('/').pop() || '';
  if (fileName.toLowerCase() === 'dockerfile') {
    return 'dockerfile';
  }
  
  // Check for Makefile
  if (fileName.toLowerCase().startsWith('makefile')) {
    return 'makefile';
  }
  
  // Extract extension
  const lastDotIndex = filePath.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return 'plaintext';
  }
  
  const extension = filePath.slice(lastDotIndex);
  return EXTENSION_TO_LANGUAGE[extension] || EXTENSION_TO_LANGUAGE[extension.toLowerCase()] || 'plaintext';
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  filePath,
  content,
  onChange,
  onSave,
  readOnly = false,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [minimapEnabled, setMinimapEnabled] = useState(() => readBooleanSetting("orbit:settings:monacoMinimap", false));
  
  const language = detectLanguage(filePath);
  
  // Handle editor mount
  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco as unknown as typeof import('monaco-editor');
    setIsReady(true);
    
    // Add keyboard shortcut for save (Ctrl+S / Cmd+S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave();
    });
    
    // Focus the editor
    editor.focus();
  }, [onSave]);
  
  // Update editor value when filePath changes (new file loaded)
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const editor = editorRef.current;
      const currentValue = editor.getValue();
      
      // Only update if content actually changed (avoid cursor jumps on saves)
      if (currentValue !== content) {
        editor.setValue(content);
      }
      
      // Update language for the new file
      const newLanguage = detectLanguage(filePath);
      const model = editor.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, newLanguage);
      }
      
      // Focus editor when switching files
      editor.focus();
    }
  }, [filePath, content]);

  useEffect(() => {
    const refreshSettings = () => {
      const enabled = readBooleanSetting("orbit:settings:monacoMinimap", false);
      setMinimapEnabled(enabled);
      editorRef.current?.updateOptions({ minimap: { enabled } });
    };
    document.addEventListener("orbit:settings-changed", refreshSettings);
    return () => document.removeEventListener("orbit:settings-changed", refreshSettings);
  }, []);
  
  // Handle content changes
  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      onChange(value);
    }
  }, [onChange]);
  
  // Light defaults — minimap, smooth animations, suggestions, format-on-paste
  // and bracket-pair colorization are all OFF by default. They're nice but
  // they're also Monaco's biggest CPU costs. Re-enable per-feature later via
  // an Editor Mode setting if needed.
  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    lineNumbers: 'on',
    minimap: { enabled: minimapEnabled },
    wordWrap: 'on',
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',

    readOnly,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: false,
    cursorSmoothCaretAnimation: 'off',

    tabSize: 2,
    insertSpaces: true,
    detectIndentation: true,
    trimAutoWhitespace: true,

    find: { addExtraSpaceOnTop: false },

    renderLineHighlight: 'all',
    renderWhitespace: 'selection',
    renderControlCharacters: false,

    folding: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'mouseover',

    guides: {
      bracketPairs: false,
      indentation: true,
    },

    bracketPairColorization: { enabled: false },

    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    acceptSuggestionOnEnter: 'off',

    formatOnPaste: false,
    formatOnType: false,
  };
  
  return (
    <div className="monaco-editor-container" style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <Editor
        height="100%"
        width="100%"
        language={language}
        value={content}
        theme="vs-dark"
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={editorOptions}
        loading={
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            color: '#8ca1af',
            fontSize: '14px'
          }}>
            Loading editor...
          </div>
        }
      />
      {isReady && (
        <div className="editor-status-bar" style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '22px',
          background: '#1e1e1e',
          borderTop: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontSize: '12px',
          color: '#858585',
          gap: '16px',
        }}>
          <span>{language.toUpperCase()}</span>
          <span>{readOnly ? 'Read Only' : 'UTF-8'}</span>
          <span style={{ marginLeft: 'auto' }}>Ln {editorRef.current?.getPosition()?.lineNumber || 1}, Col {editorRef.current?.getPosition()?.column || 1}</span>
        </div>
      )}
    </div>
  );
};

export default MonacoEditor;

function readBooleanSetting(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return typeof parsed === "boolean" ? parsed : fallback;
  } catch {
    return fallback;
  }
}
