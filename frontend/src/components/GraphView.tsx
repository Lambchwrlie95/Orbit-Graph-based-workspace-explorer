import React, { useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { GraphPayload, GraphNode } from "../types";

interface GraphViewProps {
  payload: GraphPayload | null;
  onSelectPath: (path: string) => void;
}

export function GraphView({ payload, onSelectPath }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Sigma | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous renderer
    if (rendererRef.current) {
      rendererRef.current.kill();
      rendererRef.current = null;
    }

    if (!payload) return;

    const graph = new Graph();

    // Add nodes
    for (const node of payload.nodes) {
      graph.addNode(String(node.id), {
        label: node.label,
        x: node.x ?? Math.random() * 100,
        y: node.y ?? Math.random() * 100,
        size: node.isCluster ? 18 : node.isDir ? 12 : 7,
        color: getNodeColor(node),
        path: node.path,
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

    // Create renderer
    const renderer = new Sigma(graph, containerRef.current, { 
      renderLabels: true,
      labelColor: { color: "#e5edf4" },
    });

    renderer.on("clickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      if (path) {
        onSelectPath(path);
      }
    });

    rendererRef.current = renderer;

    return () => {
      renderer.kill();
      rendererRef.current = null;
    };
  }, [payload, onSelectPath]);

  return (
    <div className="graph-wrap">
      <div className="graph-overlay">
        <strong>
          {payload ? `${payload.nodes.length} visible / ${payload.totalInScope} indexed` : "Graph"}
        </strong>
        {payload?.capped ? (
          <span>Capped at {payload.nodeLimit}</span>
        ) : (
          <span>Scoped view</span>
        )}
      </div>
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

function getNodeColor(node: GraphNode): string {
  if (node.isCluster) return "#f59e0b";
  if (node.isDir) return "#4ade80";
  return colorForExtension(node.extension);
}

function colorForExtension(extension?: string | null): string {
  if (!extension) return "#94a3b8";
  const ext = extension.toLowerCase();
  if (["png", "jpg", "jpeg", "svg", "webp", "gif", "bmp", "ico"].includes(ext)) return "#38bdf8";
  if (["rs", "ts", "tsx", "js", "jsx"].includes(ext)) return "#a78bfa";
  if (["md", "txt"].includes(ext)) return "#f8fafc";
  if (["json", "toml", "yaml", "yml", "xml"].includes(ext)) return "#fbbf24";
  if (["css", "scss", "sass", "less", "html"].includes(ext)) return "#f472b6";
  return "#94a3b8";
}
