import React, { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { GraphPayload, GraphNode } from "../types";
import { formatBytes } from "../utils";

interface GraphViewProps {
  payload: GraphPayload | null;
  onSelectPath: (path: string) => void;
  onOpenPath?: (path: string) => void;
  onFocusFolder?: (path: string) => void;
  onExpandCluster?: (folderPath: string) => void;
  expandedFolders?: string[];
  isLoading?: boolean;
}

export function GraphView({ payload, onSelectPath, onOpenPath, onFocusFolder, onExpandCluster, expandedFolders = [], isLoading }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [expandingCluster, setExpandingCluster] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous renderer
    if (rendererRef.current) {
      rendererRef.current.kill();
      rendererRef.current = null;
    }

    if (!payload) return;

    const graph = new Graph();
    graphRef.current = graph;

    // Add nodes
    for (const node of payload.nodes) {
      graph.addNode(String(node.id), {
        label: node.label,
        x: node.x ?? Math.random() * 100,
        y: node.y ?? Math.random() * 100,
        size: getNodeSize(node),
        color: getNodeColor(node),
        path: node.path,
        isDir: node.isDir,
        isCluster: node.isCluster,
        extension: node.extension,
        clusterSummary: node.clusterSummary,
      });
    }

    // Add edges
    for (const edge of payload.edges) {
      const source = String(edge.sourceId);
      const target = String(edge.targetId);
      if (graph.hasNode(source) && graph.hasNode(target) && !graph.hasEdge(String(edge.id))) {
        graph.addEdgeWithKey(String(edge.id), source, target, { 
          size: 1, 
          color: "#335064"
        });
      }
    }

    // Create renderer with settings
    const renderer = new Sigma(graph, containerRef.current, { 
      renderLabels: true,
      labelColor: { color: "#e5edf4" },
      labelSize: 12,
      labelWeight: "600",
      defaultNodeColor: "#94a3b8",
      defaultEdgeColor: "#335064",
      nodeReducer: (node, data) => {
        // Highlight hovered node
        if (hoveredNode && node === hoveredNode) {
          return {
            ...data,
            size: (data.size as number) * 1.3,
            color: lightenColor(data.color as string, 20),
          };
        }
        return data;
      },
    });

    // Click handler - select node
    renderer.on("clickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      if (path) {
        onSelectPath(path);
      }
    });

    // Double-click handler - open file, focus folder, or expand cluster
    renderer.on("doubleClickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      const isDir = graph.getNodeAttribute(node, "isDir") as boolean;
      const isCluster = graph.getNodeAttribute(node, "isCluster") as boolean;
      
      if (!path) return;
      
      // Handle cluster nodes - expand them
      if (isCluster) {
        const folderPath = path.replace("/__cluster__", "");
        setExpandingCluster(folderPath);
        if (onExpandCluster) {
          onExpandCluster(folderPath);
        } else if (onFocusFolder) {
          // Fallback: focus the folder
          onFocusFolder(folderPath);
        }
        // Clear expanding state after animation
        setTimeout(() => setExpandingCluster(null), 500);
        return;
      }
      
      if (isDir) {
        // Focus folder
        if (onFocusFolder) {
          onFocusFolder(path);
        }
      } else {
        // Open file externally
        if (onOpenPath) {
          onOpenPath(path);
        }
      }
    });

    // Hover handlers for tooltip
    renderer.on("enterNode", ({ node }) => {
      setHoveredNode(node);
    });

    renderer.on("leaveNode", () => {
      setHoveredNode(null);
    });

    // Track zoom level
    renderer.getCamera().on("updated", () => {
      const ratio = renderer.getCamera().getState().ratio;
      setZoomLevel(Math.round((1 / ratio) * 100) / 100);
    });

    rendererRef.current = renderer;

    return () => {
      renderer.kill();
      rendererRef.current = null;
      graphRef.current = null;
    };
  }, [payload, onSelectPath, onOpenPath, onFocusFolder, hoveredNode]);

  // Zoom controls
  const handleZoomIn = () => {
    if (rendererRef.current) {
      const camera = rendererRef.current.getCamera();
      camera.animatedZoom({ duration: 200 });
    }
  };

  const handleZoomOut = () => {
    if (rendererRef.current) {
      const camera = rendererRef.current.getCamera();
      camera.animatedUnzoom({ duration: 200 });
    }
  };

  const handleResetView = () => {
    if (rendererRef.current) {
      const camera = rendererRef.current.getCamera();
      camera.animatedReset({ duration: 300 });
    }
  };

  // Get tooltip content for hovered node
  const getTooltip = () => {
    if (!hoveredNode || !graphRef.current) return null;
    
    const graph = graphRef.current;
    const label = graph.getNodeAttribute(hoveredNode, "label") as string;
    const isDir = graph.getNodeAttribute(hoveredNode, "isDir") as boolean;
    const isCluster = graph.getNodeAttribute(hoveredNode, "isCluster") as boolean;
    const extension = graph.getNodeAttribute(hoveredNode, "extension") as string | undefined;
    const clusterSummary = graph.getNodeAttribute(hoveredNode, "clusterSummary") as GraphNode["clusterSummary"];
    
    if (isCluster && clusterSummary) {
      const isExpanding = expandingCluster === graph.getNodeAttribute(hoveredNode, "path")?.replace("/__cluster__", "");
      const lines = [
        `Cluster: ${clusterSummary.totalChildren} items hidden`,
        `Files: ${clusterSummary.fileCount}, Folders: ${clusterSummary.dirCount}`,
        `Total size: ${formatBytes(clusterSummary.totalSize)}`,
      ];
      if (clusterSummary.topExtensions.length > 0) {
        lines.push(`Types: ${clusterSummary.topExtensions.slice(0, 3).join(", ")}`);
      }
      lines.push(isExpanding ? "Expanding..." : "Double-click to expand");
      return lines.join("\n");
    }
    if (isCluster) return "Click to view folder contents\nDouble-click to expand";
    if (isDir) return `Folder: ${label}\nDouble-click to open`;
    if (extension) return `${extension.toUpperCase()} file: ${label}\nDouble-click to open externally`;
    return `File: ${label}\nDouble-click to open externally`;
  };

  return (
    <div className="graph-wrap">
      {/* Graph Overlay with Stats */}
      <div className="graph-overlay">
        <strong>
          {payload ? `${payload.nodes.length} visible / ${payload.totalInScope} indexed` : "Graph"}
        </strong>
        {payload?.capped ? (
          <span className="capped-badge">Capped at {payload.nodeLimit}</span>
        ) : (
          <span>Scoped view</span>
        )}
        {expandedFolders.length > 0 && (
          <span className="expanded-badge">{expandedFolders.length} expanded</span>
        )}
        {isLoading && <span className="loading-indicator">Loading...</span>}
      </div>

      {/* Zoom Controls */}
      <div className="graph-controls">
        <button onClick={handleZoomIn} title="Zoom in">+</button>
        <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
        <button onClick={handleZoomOut} title="Zoom out">−</button>
        <button onClick={handleResetView} title="Reset view">⌂</button>
      </div>

      {/* Tooltip */}
      {hoveredNode && (
        <div className="graph-tooltip">
          <pre>{getTooltip()}</pre>
        </div>
      )}

      {/* Canvas */}
      <div className="graph-canvas" ref={containerRef}>
        {!payload && (
          <div className="empty-state">
            <p>Scan a workspace to render the graph</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getNodeSize(node: GraphNode): number {
  if (node.isCluster) return 18;
  if (node.isDir) return 12;
  return 7;
}

function getNodeColor(node: GraphNode): string {
  if (node.isCluster) return "#f59e0b";
  if (node.isDir) return "#4ade80";
  return colorForExtension(node.extension);
}

function colorForExtension(extension?: string | null): string {
  if (!extension) return "#94a3b8";
  const ext = extension.toLowerCase();
  if (["png", "jpg", "jpeg", "svg", "webp", "gif", "bmp", "ico"].includes(ext)) return "#38bdf8";
  if (["rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "cpp", "c", "h", "hpp"].includes(ext)) return "#a78bfa";
  if (["md", "txt", "rtf"].includes(ext)) return "#f8fafc";
  if (["json", "toml", "yaml", "yml", "xml", "ini", "conf"].includes(ext)) return "#fbbf24";
  if (["css", "scss", "sass", "less", "html", "htm"].includes(ext)) return "#f472b6";
  if (["pdf", "doc", "docx"].includes(ext)) return "#fb923c";
  return "#94a3b8";
}

function lightenColor(color: string, percent: number): string {
  // Simple hex color lightener
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}
