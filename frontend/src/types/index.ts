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
  metadata?: string | null;
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

export interface GraphRequest {
  rootPath: string;
  scopePath?: string;
  mode?: string;
  limit?: number;
  expandedFolders?: string[];
}

export interface ClusterSummary {
  totalChildren: number;
  fileCount: number;
  dirCount: number;
  totalSize: number;
  topExtensions: string[];
}

export interface GraphNode {
  id: number;
  label: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  extension?: string | null;
  parentPath?: string | null;
  isCluster: boolean;
  childCount?: number | null;
  x?: number | null;
  y?: number | null;
  clusterSummary?: ClusterSummary | null;
}

export interface CacheStatus {
  rootPath: string;
  fileCount: number;
  lastScanTime?: number | null;
  isFresh: boolean;
  isStale: boolean;
  staleReason?: string | null;
  sampleChecked: number;
  sampleChanged: number;
}

export interface SlowOperation {
  name: string;
  durationMs: number;
  timestamp: number;
}

export interface PerformanceMetrics {
  operationCount: number;
  totalDurationMs: number;
  slowOperations: SlowOperation[];
}

export type OperationStats = Record<string, [number, number, number]>;

export type ImportType = "local" | "package" | "std";

export interface Import {
  name: string;
  path: string;
  import_type: ImportType;
}

export interface Export {
  name: string;
  export_type: string;
}

export interface CodeAnalysis {
  imports: Import[];
  exports: Export[];
}

export type MarkdownLinkKind = "local" | "external" | "wikilink";

export interface MarkdownHeading {
  level: number;
  text: string;
  line: number;
}

export interface MarkdownLink {
  label: string;
  target: string;
  kind: MarkdownLinkKind;
}

export interface MarkdownAnalysis {
  headings: MarkdownHeading[];
  links: MarkdownLink[];
}

export type GitStatus =
  | "current"
  | "modified"
  | "staged"
  | "staged_modified"
  | "new"
  | "deleted"
  | "renamed"
  | "ignored"
  | "conflicted"
  | "unknown";

export interface FileGitStatus {
  status: GitStatus;
  additions?: number;
  deletions?: number;
}

export interface ImageAnalysisData {
  width: number;
  height: number;
  format: string | Record<string, string>;
  aspect_ratio: number;
  aspectRatio?: number;
}

export interface ImageColor {
  r: number;
  g: number;
  b: number;
  percentage: number;
}

export interface ImageMetadataResult {
  file_id: number;
  analysis: ImageAnalysisData;
  cached: boolean;
}

export interface ColorExtractionResult {
  file_id: number;
  colors: ImageColor[];
  cached: boolean;
}

export interface SimilarImage {
  fileId: number;
  path: string;
  distance: number;
}

export interface ThumbnailRequest {
  file_id: number;
  file_path: string;
  file_modified_at: number;
  size: number;
}

export interface ThumbnailResponse {
  path?: string | null;
  status: "ready" | "generating" | "error";
  error?: string | null;
}

export interface ThumbnailInfo {
  id: number;
  file_id: number;
  size: number;
  path: string;
  generated_at: number;
  width: number;
  height: number;
}

export interface IconRule {
  text: string;
  fg?: string | null;
}

export interface IconThemeMeta {
  id: string;
  name: string;
  author?: string | null;
  version?: string | null;
  path: string;
  builtin: boolean;
}

export interface IconGlobRule {
  pattern: string;
  rule: IconRule;
}

export interface IconThemePayload {
  meta: IconThemeMeta;
  byExt: Record<string, IconRule>;
  byFilename: Record<string, IconRule>;
  byDirname: Record<string, IconRule>;
  globs: IconGlobRule[];
  defaultFile: IconRule;
  defaultDir: IconRule;
  defaultCluster: IconRule;
}
