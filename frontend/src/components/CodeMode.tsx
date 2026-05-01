import React, { useCallback, useEffect, useState } from 'react';
import { FileCode, FileText, AlertCircle } from 'lucide-react';
import { EditorTabs } from './EditorTabs';
import { MonacoEditor } from './MonacoEditor';
import { tauriInvoke } from '../lib/tauriCommands';
import { useEditorStore } from '../stores/editorStore';
import type { FileRecord } from '../types';

/**
 * CodeMode component - Main container for the code editing experience
 * 
 * Features:
 * - Tab bar for open files
 * - Monaco editor for file editing
 * - Empty state when no files are open
 * - Status bar with file information
 * - Save functionality with keyboard shortcuts
 * - Unsaved changes tracking
 */

export interface CodeModeProps {
  className?: string;
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
    // No extension - check if it's a shebang script
    return true; // Allow editing files without extensions (scripts)
  }
  
  const extension = file.name.slice(lastDotIndex).toLowerCase();
  return EDITABLE_EXTENSIONS.has(extension);
}

export const CodeMode: React.FC<CodeModeProps> = ({ className = '' }) => {
  // Editor store
  const {
    openFiles,
    activeFile,
    modifiedFiles,
    fileContents,
    openFile,
    closeFile,
    setActiveFile,
    markSaved,
    updateContent,
    getContent,
    reorderFiles,
  } = useEditorStore();

  // Local state
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Load file content when opening
  const loadFile = useCallback(async (filePath: string) => {
    // If already in store, just activate
    if (fileContents.has(filePath)) {
      setActiveFile(filePath);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const content = await tauriInvoke('read_file_for_edit', { path: filePath });
      openFile(filePath, content);
    } catch (err) {
      setError(`Failed to open file: ${err}`);
      console.error('Failed to open file:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fileContents, setActiveFile, openFile]);

  // Handle tab click - switch to that file
  const handleTabClick = useCallback((path: string) => {
    setActiveFile(path);
    setError(null);
  }, [setActiveFile]);

  // Handle tab close with save prompt if modified
  const handleTabClose = useCallback(async (path: string) => {
    if (modifiedFiles.has(path)) {
      // For now, just close without prompting (prompt will be implemented in UI layer)
      // TODO: Add save confirmation dialog
      console.warn(`Closing modified file without saving: ${path}`);
    }
    closeFile(path);
    setError(null);
  }, [modifiedFiles, closeFile]);

  // Handle tab reorder
  const handleTabReorder = useCallback((files: string[]) => {
    reorderFiles(files);
  }, [reorderFiles]);

  // Handle editor content change
  const handleEditorChange = useCallback((value: string) => {
    if (activeFile) {
      updateContent(activeFile, value);
      setSaveStatus('idle');
    }
  }, [activeFile, updateContent]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!activeFile) return;

    const content = getContent(activeFile);
    if (content === undefined) return;

    setSaveStatus('saving');
    setError(null);

    try {
      await tauriInvoke('save_file', {
        path: activeFile,
        content
      });
      markSaved(activeFile);
      setSaveStatus('saved');
      
      // Reset status after a delay
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (err) {
      setError(`Failed to save file: ${err}`);
      setSaveStatus('error');
      console.error('Failed to save file:', err);
    }
  }, [activeFile, getContent, markSaved]);

  // Get current content for the active file
  const currentContent = activeFile ? getContent(activeFile) ?? '' : '';
  const isModified = activeFile ? modifiedFiles.has(activeFile) : false;

  // Clear error when switching files
  useEffect(() => {
    setError(null);
  }, [activeFile]);

  return (
    <div className={`code-mode ${className}`} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0b0f12',
      overflow: 'hidden',
    }}>
      {/* Tab Bar */}
      <EditorTabs
        openFiles={openFiles}
        activeFile={activeFile}
        modifiedFiles={modifiedFiles}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onTabReorder={handleTabReorder}
      />

      {/* Main Editor Area */}
      <div className="code-mode-content" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}>
        {error && (
          <div className="code-mode-error" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            background: '#3a2a1a',
            borderBottom: '1px solid #1c2831',
            color: '#fbbf24',
            fontSize: '13px',
          }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {openFiles.length === 0 ? (
          // Empty state
          <div className="code-mode-empty" style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            color: '#5a6b75',
            padding: '40px',
            textAlign: 'center',
          }}>
            <FileCode size={64} style={{ opacity: 0.3 }} />
            <div>
              <h3 style={{ 
                margin: '0 0 8px 0', 
                color: '#8ca1af',
                fontSize: '18px',
                fontWeight: 500,
              }}>
                No Files Open
              </h3>
              <p style={{ 
                margin: 0, 
                fontSize: '14px',
                maxWidth: '400px',
                lineHeight: 1.5,
              }}>
                Select a file from the Explorer, Graph, or Inspector to start editing.
                <br />
                You can also double-click files in other views to open them here.
              </p>
            </div>
            <div style={{
              display: 'flex',
              gap: '8px',
              marginTop: '16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}>
              <span style={{
                padding: '4px 8px',
                background: '#17232b',
                borderRadius: '4px',
                fontSize: '12px',
              }}>.ts</span>
              <span style={{
                padding: '4px 8px',
                background: '#17232b',
                borderRadius: '4px',
                fontSize: '12px',
              }}>.js</span>
              <span style={{
                padding: '4px 8px',
                background: '#17232b',
                borderRadius: '4px',
                fontSize: '12px',
              }}>.py</span>
              <span style={{
                padding: '4px 8px',
                background: '#17232b',
                borderRadius: '4px',
                fontSize: '12px',
              }}>.rs</span>
              <span style={{
                padding: '4px 8px',
                background: '#17232b',
                borderRadius: '4px',
                fontSize: '12px',
              }}>.json</span>
              <span style={{
                padding: '4px 8px',
                background: '#17232b',
                borderRadius: '4px',
                fontSize: '12px',
              }}>+40 more</span>
            </div>
          </div>
        ) : isLoading ? (
          // Loading state
          <div className="code-mode-loading" style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8ca1af',
            fontSize: '14px',
          }}>
            Loading file...
          </div>
        ) : (
          // Editor
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <MonacoEditor
              filePath={activeFile || ''}
              content={currentContent}
              onChange={handleEditorChange}
              onSave={handleSave}
            />
          </div>
        )}

        {/* Status Bar */}
        {activeFile && (
          <div className="code-mode-status" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '4px 12px',
            background: '#121a20',
            borderTop: '1px solid #1c2831',
            fontSize: '12px',
            color: '#8ca1af',
            height: '24px',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={12} />
              {activeFile.split('/').pop()}
            </span>
            
            {isModified && (
              <span style={{ 
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#fbbf24',
                }} />
                Modified
              </span>
            )}
            
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {saveStatus === 'saving' && (
                <span style={{ color: '#7dd3fc' }}>Saving...</span>
              )}
              {saveStatus === 'saved' && (
                <span style={{ color: '#86efac' }}>Saved</span>
              )}
              {saveStatus === 'error' && (
                <span style={{ color: '#fca5a5' }}>Save failed</span>
              )}
              <span style={{ opacity: 0.6 }}>Ctrl+S to save</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeMode;
