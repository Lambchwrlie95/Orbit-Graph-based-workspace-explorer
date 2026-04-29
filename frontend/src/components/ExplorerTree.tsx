import React, { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileRecord } from "../types";
import { fileTypeLabel } from "../utils";

interface TreeNodeProps {
  record: FileRecord;
  level: number;
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (record: FileRecord) => void;
  childrenNodes: FileRecord[];
  isLoading: boolean;
}

function TreeNode({
  record,
  level,
  selectedPath,
  expandedPaths,
  onToggle,
  onSelect,
  childrenNodes,
  isLoading,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(record.path);
  const hasChildren = record.isDir;
  const isSelected = selectedPath === record.path;

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        onToggle(record.path);
      }
    },
    [hasChildren, onToggle, record.path]
  );

  const handleSelect = useCallback(() => {
    onSelect(record);
  }, [onSelect, record]);

  const indent = level * 16;

  return (
    <div className="tree-node">
      <button
        className={`tree-row ${isSelected ? "selected" : ""}`}
        onClick={handleSelect}
        style={{ paddingLeft: `${indent + 8}px` }}
        title={record.path}
      >
        {hasChildren && (
          <span
            className={`tree-chevron ${isExpanded ? "expanded" : ""}`}
            onClick={handleToggle}
          >
            {isLoading && isExpanded ? "◌" : "›"}
          </span>
        )}
        {!hasChildren && <span className="tree-spacer" />}
        <span className={`file-icon ${record.isDir ? "folder" : ""}`}>
          {record.isDir ? "D" : fileTypeLabel(record)}
        </span>
        <span className="tree-label">{record.name}</span>
      </button>
      {isExpanded && hasChildren && (
        <div className="tree-children">
          {isLoading ? (
            <div className="tree-loading" style={{ paddingLeft: `${indent + 24}px` }}>
              Loading...
            </div>
          ) : childrenNodes.length === 0 ? (
            <div className="tree-empty" style={{ paddingLeft: `${indent + 24}px` }}>
              Empty folder
            </div>
          ) : (
            childrenNodes.map((child) => (
              <LazyTreeNode
                key={child.path}
                record={child}
                level={level + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface LazyTreeNodeProps {
  record: FileRecord;
  level: number;
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (record: FileRecord) => void;
}

function LazyTreeNode({
  record,
  level,
  selectedPath,
  expandedPaths,
  onToggle,
  onSelect,
}: LazyTreeNodeProps) {
  const [children, setChildren] = useState<FileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isExpanded = expandedPaths.has(record.path);

  useEffect(() => {
    if (isExpanded && record.isDir && children.length === 0) {
      setIsLoading(true);
      invoke<FileRecord[]>("list_children", { parentPath: record.path })
        .then((result) => {
          setChildren(result);
        })
        .catch(() => {
          setChildren([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isExpanded, record.path, record.isDir, children.length]);

  return (
    <TreeNode
      record={record}
      level={level}
      selectedPath={selectedPath}
      expandedPaths={expandedPaths}
      onToggle={onToggle}
      onSelect={onSelect}
      childrenNodes={children}
      isLoading={isLoading}
    />
  );
}

interface ExplorerTreeProps {
  rootPath: string;
  selectedPath?: string;
  onSelect: (record: FileRecord) => void;
  onNavigate: (path: string) => void;
}

export function ExplorerTree({
  rootPath,
  selectedPath,
  onSelect,
}: ExplorerTreeProps) {
  const [rootRecord, setRootRecord] = useState<FileRecord | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (rootPath) {
      invoke<FileRecord | null>("get_file", { path: rootPath })
        .then((record) => {
          if (record) {
            setRootRecord(record);
            // Auto-expand root
            setExpandedPaths((prev) => new Set([...prev, rootPath]));
          }
        })
        .catch(() => {
          setRootRecord(null);
        });
    }
  }, [rootPath]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (!rootRecord) {
    return <div className="empty-state">Select a workspace to browse</div>;
  }

  return (
    <div className="explorer-tree-container">
      <LazyTreeNode
        record={rootRecord}
        level={0}
        selectedPath={selectedPath}
        expandedPaths={expandedPaths}
        onToggle={handleToggle}
        onSelect={onSelect}
      />
    </div>
  );
}
