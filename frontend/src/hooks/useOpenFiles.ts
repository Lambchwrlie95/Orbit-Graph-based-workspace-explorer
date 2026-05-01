import { useCallback } from 'react';
import { tauriInvoke } from '../lib/tauriCommands';
import { useEditorStore } from '../stores/editorStore';
import type { FileRecord } from '../types';

/**
 * Hook for opening files in the Code Editor
 * 
 * Provides functions to open files from various UI components
 * with automatic mode switching and content loading.
 */

export interface UseOpenFilesOptions {
  onSwitchToCodeMode?: () => void;
}

export interface UseOpenFilesReturn {
  openFileInEditor: (file: FileRecord) => Promise<void>;
  isEditable: (file: FileRecord) => boolean;
  openFilesCount: number;
  activeFile: string | null;
}

// Text/code file extensions that can be edited
const EDITABLE_EXTENSIONS = new Set([
  // TypeScript/JavaScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  // Python
  '.py', '.pyw', '.pyi',
  // Rust
  '.rs',
  // Go
  '.go',
  // Java
  '.java', '.kt', '.scala',
  // C/C++
  '.c', '.cpp', '.cc', '.h', '.hpp',
  // C#
  '.cs',
  // Ruby
  '.rb',
  // PHP
  '.php',
  // Swift
  '.swift',
  // Shell
  '.sh', '.bash', '.zsh',
  // Config/Data
  '.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.conf', '.cfg',
  // Markdown
  '.md', '.mdx',
  // CSS/SCSS
  '.css', '.scss', '.sass', '.less',
  // HTML
  '.html', '.htm', '.svg',
  // SQL
  '.sql',
  // GraphQL
  '.graphql', '.gql',
  // Lua
  '.lua',
  // Perl
  '.pl',
  // R
  '.r', '.R',
  // Julia
  '.jl',
  // Dart
  '.dart',
  // Elixir
  '.ex', '.exs',
  // Erlang
  '.erl',
  // Haskell
  '.hs',
  // Clojure
  '.clj', '.cljs',
  // F#
  '.fs',
  // PowerShell
  '.ps1', '.psm1',
  // Batch
  '.bat', '.cmd',
  // Log/Text
  '.log', '.txt',
]);

// Files without extensions that can be edited
const EDITABLE_FILENAMES = new Set([
  'dockerfile',
  'makefile',
  'makefile.am',
  'makefile.in',
  'cmakelists.txt',
  'license',
  'readme',
  'changelog',
  'authors',
  'contributors',
  'copying',
  'install',
  'configure',
  'rakefile',
  'gemfile',
  'procfile',
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.editorconfig',
  '.eslintignore',
  '.prettierignore',
  '.npmignore',
  '.yarnignore',
  '.nvmrc',
  '.node-version',
  '.python-version',
  '.ruby-version',
  '.tool-versions',
  'manifest',
  'robots.txt',
  'humans.txt',
  'sitemap.xml',
]);

/**
 * Check if a file can be edited in the code editor
 */
export function isEditableFile(file: FileRecord): boolean {
  if (file.isDir) {
    return false;
  }
  
  const fileName = file.name.toLowerCase();
  
  // Check for editable filenames (no extension or special names)
  if (EDITABLE_FILENAMES.has(fileName)) {
    return true;
  }
  
  // Check extension
  const lastDotIndex = file.name.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // No extension - allow editing (likely a script)
    return true;
  }
  
  const extension = file.name.slice(lastDotIndex).toLowerCase();
  return EDITABLE_EXTENSIONS.has(extension);
}

/**
 * Hook for opening files in the Code Editor
 */
export function useOpenFiles(options: UseOpenFilesOptions = {}): UseOpenFilesReturn {
  const { onSwitchToCodeMode } = options;
  const { openFile, openFiles, activeFile } = useEditorStore();

  /**
   * Open a file in the code editor
   * Loads content from disk and switches to code mode
   */
  const openFileInEditor = useCallback(async (file: FileRecord) => {
    if (!isEditableFile(file)) {
      console.warn(`File type not supported for editing: ${file.name}`);
      return;
    }

    // Check if already open
    if (openFiles.includes(file.path)) {
      // Just activate it and switch to code mode
      useEditorStore.getState().setActiveFile(file.path);
      onSwitchToCodeMode?.();
      return;
    }

    try {
      // Load file content
      const content = await tauriInvoke('read_file_for_edit', { path: file.path });
      
      // Open in editor store
      openFile(file.path, content);
      
      // Switch to code mode
      onSwitchToCodeMode?.();
    } catch (err) {
      console.error('Failed to open file in editor:', err);
      throw err;
    }
  }, [openFile, openFiles, onSwitchToCodeMode]);

  return {
    openFileInEditor,
    isEditable: isEditableFile,
    openFilesCount: openFiles.length,
    activeFile,
  };
}

export default useOpenFiles;
