import React, { useState } from 'react';
import {
  useCodeAnalysis,
  Import,
  Export,
  FileGitStatus,
  getGitStatusColor,
  getGitStatusDisplay,
  groupImportsByType,
  getImportTypeIcon,
  getImportTypeLabel,
} from '../../hooks/useCodeAnalysis';

interface CodeAnalysisPanelProps {
  filePath: string;
  onOpenFile: (path: string) => void;
}

export function CodeAnalysisPanel({ filePath, onOpenFile }: CodeAnalysisPanelProps) {
  const {
    analysis,
    gitStatus,
    relatedFiles,
    loading,
    error,
    isCodeFile,
    inGitRepo,
    refresh,
  } = useCodeAnalysis(filePath);

  const [expandedSections, setExpandedSections] = useState({
    gitStatus: true,
    imports: true,
    exports: true,
    related: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Don't show panel if there's nothing to display
  if (!isCodeFile && !inGitRepo && !loading) {
    return null;
  }

  return (
    <div className="code-analysis-panel">
      <div className="panel-header">
        <h4>⌥ Code Analysis</h4>
        {loading && <span className="loading-indicator">⟳ Analyzing…</span>}
        {!loading && (
          <button className="refresh-btn" onClick={refresh} title="Refresh analysis">
            ↻
          </button>
        )}
      </div>

      {error && (
        <div className="analysis-error">
          Error: {error}
        </div>
      )}

      {/* Git Status Section */}
      {inGitRepo && gitStatus && (
        <div className="analysis-section">
          <button
            className="section-header"
            onClick={() => toggleSection('gitStatus')}
          >
            <span className="section-icon">
              {expandedSections.gitStatus ? '▾' : '▸'}
            </span>
            <span>⎇ Git Status</span>
            <GitStatusBadge status={gitStatus} />
          </button>
          
          {expandedSections.gitStatus && (
            <div className="section-content">
              <GitStatusDetails status={gitStatus} />
            </div>
          )}
        </div>
      )}

      {/* Imports Section */}
      {isCodeFile && analysis && analysis.imports.length > 0 && (
        <div className="analysis-section">
          <button
            className="section-header"
            onClick={() => toggleSection('imports')}
          >
            <span className="section-icon">
              {expandedSections.imports ? '▾' : '▸'}
            </span>
            <span>⬇ Imports</span>
            <span className="item-count">{analysis.imports.length}</span>
          </button>

          {expandedSections.imports && (
            <div className="section-content">
              <ImportsList
                imports={analysis.imports}
                onOpenFile={onOpenFile}
                filePath={filePath}
              />
            </div>
          )}
        </div>
      )}

      {/* Exports Section */}
      {isCodeFile && analysis && analysis.exports.length > 0 && (
        <div className="analysis-section">
          <button
            className="section-header"
            onClick={() => toggleSection('exports')}
          >
            <span className="section-icon">
              {expandedSections.exports ? '▾' : '▸'}
            </span>
            <span>⬆ Exports</span>
            <span className="item-count">{analysis.exports.length}</span>
          </button>

          {expandedSections.exports && (
            <div className="section-content">
              <ExportsList exports={analysis.exports} />
            </div>
          )}
        </div>
      )}

      {/* Related Files Section */}
      {relatedFiles.length > 0 && (
        <div className="analysis-section">
          <button
            className="section-header"
            onClick={() => toggleSection('related')}
          >
            <span className="section-icon">
              {expandedSections.related ? '▾' : '▸'}
            </span>
            <span>⬡ Related Files</span>
            <span className="item-count">{relatedFiles.length}</span>
          </button>
          
          {expandedSections.related && (
            <div className="section-content">
              <RelatedFilesList files={relatedFiles} onOpenFile={onOpenFile} />
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {isCodeFile && analysis && analysis.imports.length === 0 && analysis.exports.length === 0 && !loading && (
        <div className="analysis-empty">
          No imports or exports detected
        </div>
      )}
    </div>
  );
}

// Git Status Badge Component
function GitStatusBadge({ status }: { status: FileGitStatus }) {
  const { icon, label } = getGitStatusDisplay(status.status);
  const color = getGitStatusColor(status.status);
  
  return (
    <span
      className="git-status-badge"
      style={{ backgroundColor: color }}
      title={label}
    >
      {icon}
    </span>
  );
}

// Git Status Details Component
function GitStatusDetails({ status }: { status: FileGitStatus }) {
  const { label } = getGitStatusDisplay(status.status);
  const color = getGitStatusColor(status.status);
  
  return (
    <div className="git-status-details">
      <div className="git-status-row">
        <span className="git-status-label" style={{ color }}>
          {label}
        </span>
      </div>
      {(status.additions !== undefined || status.deletions !== undefined) && (
        <div className="git-diff-stats">
          {status.additions !== undefined && (
            <span className="diff-additions">+{status.additions}</span>
          )}
          {status.deletions !== undefined && (
            <span className="diff-deletions">-{status.deletions}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Imports List Component
function ImportsList({
  imports,
  onOpenFile,
  filePath,
}: {
  imports: Import[];
  onOpenFile: (path: string) => void;
  filePath: string;
}) {
  const grouped = groupImportsByType(imports);
  const hasImports = imports.length > 0;

  if (!hasImports) {
    return <div className="empty-list">No imports found</div>;
  }

  return (
    <div className="imports-list">
      {grouped.local.length > 0 && (
        <ImportGroup
          title="Local"
          icon={getImportTypeIcon('local')}
          imports={grouped.local}
          onOpenFile={onOpenFile}
          filePath={filePath}
          isLocal
        />
      )}
      {grouped.package.length > 0 && (
        <ImportGroup
          title="Packages"
          icon={getImportTypeIcon('package')}
          imports={grouped.package}
          onOpenFile={onOpenFile}
          filePath={filePath}
          isLocal={false}
        />
      )}
      {grouped.std.length > 0 && (
        <ImportGroup
          title="Standard Library"
          icon={getImportTypeIcon('std')}
          imports={grouped.std}
          onOpenFile={onOpenFile}
          filePath={filePath}
          isLocal={false}
        />
      )}
    </div>
  );
}

// Import Group Component
function ImportGroup({
  title,
  icon,
  imports,
  onOpenFile,
  filePath,
  isLocal,
}: {
  title: string;
  icon: string;
  imports: Import[];
  onOpenFile: (path: string) => void;
  filePath: string;
  isLocal: boolean;
}) {
  return (
    <div className="import-group">
      <div className="import-group-title">
        <span className="import-group-icon">{icon}</span>
        <span>{title}</span>
      </div>
      <ul className="import-items">
        {imports.map((imp, idx) => (
          <li key={idx} className="import-item">
            {isLocal ? (
              <button
                className="import-link"
                onClick={() => {
                  const resolvedPath = resolveImportPath(filePath, imp.path);
                  onOpenFile(resolvedPath);
                }}
                title={`Open ${imp.path}`}
              >
                <span className="import-name">{imp.name}</span>
                <span className="import-path">{imp.path}</span>
              </button>
            ) : (
              <span className="import-static">
                <span className="import-name">{imp.name}</span>
                <span className="import-path">{imp.path}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Exports List Component
function ExportsList({ exports }: { exports: Export[] }) {
  if (exports.length === 0) {
    return <div className="empty-list">No exports found</div>;
  }

  // Group by export type
  const grouped = exports.reduce((acc, exp) => {
    const type = exp.export_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(exp);
    return acc;
  }, {} as Record<string, Export[]>);

  return (
    <div className="exports-list">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="export-group">
          <div className="export-group-title">
            {getExportTypeIcon(type)} {type.charAt(0).toUpperCase() + type.slice(1)}s
          </div>
          <ul className="export-items">
            {items.map((exp, idx) => (
              <li key={idx} className="export-item">
                <span className="export-name">{exp.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Related Files List Component
function RelatedFilesList({
  files,
  onOpenFile,
}: {
  files: string[];
  onOpenFile: (path: string) => void;
}) {
  if (files.length === 0) {
    return <div className="empty-list">No related files</div>;
  }

  return (
    <ul className="related-files-list">
      {files.map((file, idx) => (
        <li key={idx} className="related-file-item">
          <button
            className="related-file-link"
            onClick={() => onOpenFile(file)}
            title={file}
          >
            {file.split('/').pop() || file}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Helper function to resolve relative import paths.
// Returns the most-likely resolved absolute path; the caller (tauriInvoke "get_file")
// will return null if the file is not indexed, so we fall back gracefully.
function resolveImportPath(filePath: string, importPath: string): string {
  if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
    return importPath;
  }

  const baseParts = filePath.split('/').slice(0, -1);
  const importParts = importPath.split('/');

  for (const part of importParts) {
    if (part === '..') {
      baseParts.pop();
    } else if (part !== '.') {
      baseParts.push(part);
    }
  }

  const resolved = baseParts.join('/');

  // If the resolved path already has an extension, return as-is
  const lastSegment = resolved.split('/').pop() ?? '';
  if (lastSegment.includes('.')) {
    return resolved;
  }

  // Infer extension from the source file to prefer the same language
  const srcExt = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (srcExt === 'ts' || srcExt === 'tsx') return `${resolved}.ts`;
  if (srcExt === 'js' || srcExt === 'jsx' || srcExt === 'mjs') return `${resolved}.js`;
  if (srcExt === 'py') return `${resolved}.py`;
  if (srcExt === 'rs') return `${resolved}.rs`;
  if (srcExt === 'go') return `${resolved}.go`;

  // Default: TypeScript
  return `${resolved}.ts`;
}

// Get icon for export type
function getExportTypeIcon(exportType: string): string {
  switch (exportType.toLowerCase()) {
    case 'function':
      return 'ƒ';
    case 'class':
      return 'C';
    case 'interface':
      return 'I';
    case 'type':
      return 'T';
    case 'const':
    case 'constant':
      return 'K';
    case 'variable':
      return 'V';
    case 'struct':
      return 'S';
    case 'enum':
      return 'E';
    case 'default':
      return 'D';
    case 're-export':
      return '↗';
    default:
      return '•';
  }
}
