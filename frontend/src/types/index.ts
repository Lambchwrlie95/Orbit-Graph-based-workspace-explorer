export interface FileRecord {
  id: number;
  path: string;
  name: string;
  parentPath?: string | null;
  extension?: string | null;
  mimeType?: string | null;
  sizeBytes: number;
  modifiedAt?: number | null;
  createdAt?: number | null;
  isDir: boolean;
}

export interface ScanProgress {
  rootPath: string;
  scanned: number;
  insertedOrUpdated: number;
  skippedUnchanged: number;
  durationMs: number;
  logPath?: string | null;
}

export interface PreviewPayload {
  kind: string;
  title: string;
  path: string;
  summary: string;
  content?: string | null;
  metadata: Array<{ key: string; value: string }>;
}

export interface GraphNode {
  id: number;
  label: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  extension?: string | null;
  isCluster: boolean;
  childCount?: number | null;
  x?: number | null;
  y?: number | null;
}

export interface GraphEdge {
  id: number;
  sourceId: number;
  targetId: number;
  edgeType: string;
  weight: number;
}

export interface GraphPayload {
  rootPath: string;
  mode: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  capped: boolean;
  nodeLimit: number;
  totalInScope: number;
}

export type Mode = "graph" | "explorer" | "assets" | "code" | "search";
