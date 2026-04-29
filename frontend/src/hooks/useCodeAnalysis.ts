import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Import {
  name: string;
  path: string;
  import_type: 'local' | 'package' | 'std';
}

export interface Export {
  name: string;
  export_type: string;
}

export interface CodeAnalysis {
  imports: Import[];
  exports: Export[];
}

export interface FileGitStatus {
  status: 'current' | 'modified' | 'staged' | 'staged_modified' | 'new' | 'deleted' | 'renamed' | 'ignored' | 'conflicted' | 'unknown';
  additions?: number;
  deletions?: number;
}

export interface UseCodeAnalysisReturn {
  analysis: CodeAnalysis | null;
  gitStatus: FileGitStatus | null;
  relatedFiles: string[];
  loading: boolean;
  error: string | null;
  isCodeFile: boolean;
  inGitRepo: boolean;
  refresh: () => void;
}

export function useCodeAnalysis(filePath: string | null): UseCodeAnalysisReturn {
  const [analysis, setAnalysis] = useState<CodeAnalysis | null>(null);
  const [gitStatus, setGitStatus] = useState<FileGitStatus | null>(null);
  const [relatedFiles, setRelatedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCodeFile, setIsCodeFile] = useState(false);
  const [inGitRepo, setInGitRepo] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    if (!filePath) {
      setAnalysis(null);
      setGitStatus(null);
      setRelatedFiles([]);
      setIsCodeFile(false);
      setInGitRepo(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check if it's a code file first
      const isCode = await invoke<boolean>('is_analyzable_code_file', { path: filePath });
      setIsCodeFile(isCode);

      // Check if in git repo
      const inRepo = await invoke<boolean>('is_in_git_repo', { path: filePath });
      setInGitRepo(inRepo);

      // Fetch code analysis if it's a code file
      if (isCode) {
        try {
          const analysisResult = await invoke<CodeAnalysis | null>('analyze_code_file', { path: filePath });
          setAnalysis(analysisResult);
        } catch (analysisErr) {
          console.warn('Failed to analyze code file:', analysisErr);
          setAnalysis(null);
        }
      } else {
        setAnalysis(null);
      }

      // Fetch git status
      if (inRepo) {
        try {
          const gitResult = await invoke<FileGitStatus>('get_file_git_status', { path: filePath });
          setGitStatus(gitResult);
        } catch (gitErr) {
          console.warn('Failed to get git status:', gitErr);
          setGitStatus({ status: 'unknown' });
        }
      } else {
        setGitStatus(null);
      }

      // Fetch related files (always try, even for non-code files)
      try {
        const related = await invoke<string[]>('get_related_files', { path: filePath });
        setRelatedFiles(related);
      } catch (relatedErr) {
        console.warn('Failed to get related files:', relatedErr);
        setRelatedFiles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return {
    analysis,
    gitStatus,
    relatedFiles,
    loading,
    error,
    isCodeFile,
    inGitRepo,
    refresh: fetchAnalysis,
  };
}

// Hook to get supported code file extensions
export function useSupportedCodeExtensions(): string[] {
  const [extensions, setExtensions] = useState<string[]>([
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'py', 'rs', 'java', 'go', 'rb', 'php', 'c', 'cpp', 'h', 'hpp'
  ]);

  useEffect(() => {
    invoke<string[]>('get_supported_code_extensions')
      .then(setExtensions)
      .catch(console.error);
  }, []);

  return extensions;
}

// Utility function to check if a file is a code file
export function isCodeFile(filePath: string): boolean {
  const codeExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.py', '.pyi',
    '.rs', '.java', '.go', '.rb', '.php', '.c', '.cpp', '.h', '.hpp'
  ];
  
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return codeExtensions.includes(ext);
}

// Utility function to get git status color
export function getGitStatusColor(status: FileGitStatus['status']): string {
  switch (status) {
    case 'modified':
      return '#f59e0b'; // amber/orange
    case 'staged':
    case 'staged_modified':
      return '#10b981'; // green
    case 'new':
      return '#3b82f6'; // blue
    case 'deleted':
      return '#ef4444'; // red
    case 'renamed':
      return '#8b5cf6'; // purple
    case 'conflicted':
      return '#dc2626'; // dark red
    case 'ignored':
      return '#6b7280'; // gray
    case 'current':
      return '#22c55e'; // bright green
    default:
      return '#9ca3af'; // light gray
  }
}

// Utility function to get git status icon/label
export function getGitStatusDisplay(status: FileGitStatus['status']): { icon: string; label: string } {
  switch (status) {
    case 'modified':
      return { icon: 'M', label: 'Modified' };
    case 'staged':
      return { icon: 'A', label: 'Staged' };
    case 'staged_modified':
      return { icon: 'AM', label: 'Staged + Modified' };
    case 'new':
      return { icon: '?', label: 'Untracked' };
    case 'deleted':
      return { icon: 'D', label: 'Deleted' };
    case 'renamed':
      return { icon: 'R', label: 'Renamed' };
    case 'conflicted':
      return { icon: 'U', label: 'Conflicted' };
    case 'ignored':
      return { icon: '!', label: 'Ignored' };
    case 'current':
      return { icon: '✓', label: 'Current' };
    default:
      return { icon: '-', label: 'Unknown' };
  }
}

// Utility function to group imports by type
export function groupImportsByType(imports: Import[]): {
  local: Import[];
  package: Import[];
  std: Import[];
} {
  return {
    local: imports.filter(i => i.import_type === 'local'),
    package: imports.filter(i => i.import_type === 'package'),
    std: imports.filter(i => i.import_type === 'std'),
  };
}

// Utility function to get import icon based on type
export function getImportTypeIcon(importType: Import['import_type']): string {
  switch (importType) {
    case 'local':
      return './';
    case 'std':
      return '⚙';
    case 'package':
    default:
      return '⬡';
  }
}

// Utility function to get import type label
export function getImportTypeLabel(importType: Import['import_type']): string {
  switch (importType) {
    case 'local':
      return 'Local';
    case 'std':
      return 'Standard Library';
    case 'package':
    default:
      return 'Package';
  }
}
