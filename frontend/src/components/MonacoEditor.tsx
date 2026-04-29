import React, { useRef, useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
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
  
  const language = detectLanguage(filePath);
  
  // Handle editor mount
  const handleEditorDidMount = useCallback((editor: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
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
  
  // Handle content changes
  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      onChange(value);
    }
  }, [onChange]);
  
  // Configure editor options
  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    // Display
    lineNumbers: 'on',
    minimap: {
      enabled: true,
      showSlider: 'mouseover',
    },
    wordWrap: 'on',
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
    
    // Behavior
    readOnly,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'on',
    
    // Editing
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: true,
    trimAutoWhitespace: true,
    
    // Search
    find: {
      addExtraSpaceOnTop: false,
    },
    
    // Appearance
    renderLineHighlight: 'all',
    renderWhitespace: 'selection',
    renderControlCharacters: true,
    
    // Folding
    folding: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'mouseover',
    
    // Guides
    guides: {
      bracketPairs: true,
      indentation: true,
    },
    
    // Bracket matching
    bracketPairColorization: {
      enabled: true,
    },
    
    // Quick suggestions
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    
    // Formatting
    formatOnPaste: true,
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
