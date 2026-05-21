use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct ScannedEntry {
    pub path: String,
    pub name: String,
    pub parent_path: Option<String>,
    pub extension: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub modified_at: Option<i64>,
    pub created_at: Option<i64>,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub target_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub parent_path: Option<String>,
    pub extension: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub modified_at: Option<i64>,
    pub created_at: Option<i64>,
    pub is_dir: bool,
    pub metadata: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClusterSummary {
    pub total_children: i64,
    pub file_count: i64,
    pub dir_count: i64,
    pub total_size: i64,
    pub top_extensions: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: i64,
    pub label: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: i64,
    pub extension: Option<String>,
    pub parent_path: Option<String>,
    pub is_cluster: bool,
    pub child_count: Option<i64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub cluster_summary: Option<ClusterSummary>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: i64,
    pub source_id: i64,
    pub target_id: i64,
    pub edge_type: String,
    pub weight: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GraphPayload {
    pub root_path: String,
    pub mode: String,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub capped: bool,
    pub node_limit: i64,
    pub total_in_scope: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteLink {
    pub target: String,
    pub label: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteBacklink {
    pub source_path: String,
    pub source_label: String,
    pub target: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NodeNote {
    pub path: String,
    pub body: String,
    pub links: Vec<NoteLink>,
    pub backlinks: Vec<NoteBacklink>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub root_path: String,
    pub scanned: usize,
    pub inserted_or_updated: usize,
    pub skipped_unchanged: usize,
    pub duration_ms: u128,
    pub log_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewMetaItem {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPayload {
    pub kind: String,
    pub title: String,
    pub path: String,
    pub summary: String,
    pub content: Option<String>,
    pub metadata: Vec<PreviewMetaItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRequest {
    pub root_path: String,
    pub scope_path: Option<String>,
    pub mode: Option<String>,
    pub expanded_folders: Option<Vec<String>>,
    pub node_limit: Option<i64>,
    pub max_cross_edges_per_node: Option<i64>,
}
