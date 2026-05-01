use std::collections::{HashMap, HashSet};
use std::cmp::Reverse;
use std::path::Path;

use rusqlite::{params, Connection};

use crate::db;
use crate::models::{ClusterSummary, GraphEdge, GraphNode, GraphPayload};

const DEFAULT_NODE_LIMIT: i64 = 200;
const FOLDER_CLUSTER_THRESHOLD: i64 = 50;

pub fn load_graph(
    db_path: &Path,
    root_path: &str,
    scope_path: Option<&str>,
    mode: &str,
    limit: Option<i64>,
    expanded_folders: Option<&[String]>,
) -> Result<GraphPayload, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let root = canonicalize(root_path);
    let scope = canonicalize(scope_path.unwrap_or(root_path));
    if !scope.starts_with(&root) {
        return Err("Graph scope must stay inside the active workspace root".into());
    }

    let node_limit = limit.unwrap_or(DEFAULT_NODE_LIMIT).clamp(100, 2_000);
    let scope_prefix = db::child_prefix(&scope);
    
    // Get total count for capping info
    let total_in_scope: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'",
            params![scope, scope_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Query nodes with folder-first, depth-first ordering
    let mut node_stmt = conn
        .prepare(
            r#"
            SELECT id, name, path, is_dir, size_bytes, extension, parent_path
            FROM files
            WHERE path = ?1 OR path LIKE ?2 ESCAPE '\'
            ORDER BY
              CASE WHEN path = ?1 THEN 0 ELSE 1 END ASC,
              is_dir DESC,
              length(substr(path, length(?1) + 2)) - length(replace(substr(path, length(?1) + 2), '/', '')) + 1 ASC,
              name COLLATE NOCASE ASC
            LIMIT ?3
            "#,
        )
        .map_err(|e| e.to_string())?;

    let mut nodes = Vec::new();
    let mut selected_ids = HashSet::new();
    let mut parent_child_counts: HashMap<i64, i64> = HashMap::new();
    let node_rows = node_stmt
        .query_map(
            params![scope, db::child_prefix(&scope), node_limit * 2],
            |row| {
                Ok(GraphNode {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    path: row.get(2)?,
                    is_dir: row.get::<_, i64>(3)? == 1,
                    size_bytes: row.get(4)?,
                    extension: row.get(5)?,
                    parent_path: row.get(6)?,
                    is_cluster: false,
                    child_count: None,
                    x: None,
                    y: None,
                    cluster_summary: None,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    for row in node_rows {
        let node = row.map_err(|e| e.to_string())?;
        selected_ids.insert(node.id);
        nodes.push(node);
    }

    // Count children per parent for clustering
    for node in &nodes {
        if let Some(parent_id) = get_parent_id(&conn, &node.path)? {
            *parent_child_counts.entry(parent_id).or_insert(0) += 1;
        }
    }

    // Build expanded folders set
    let expanded_set: HashSet<&str> = expanded_folders
        .map(|folders| folders.iter().map(|s| s.as_str()).collect())
        .unwrap_or_default();

    // Apply folder clustering for folders with >50 children
    let mut cluster_id = -1_i64;
    let mut clustered_nodes: Vec<GraphNode> = Vec::new();
    let mut nodes_to_hide: HashSet<i64> = HashSet::new();
    
    for node in &nodes {
        if let Some(&child_count) = parent_child_counts.get(&node.id) {
            if child_count > FOLDER_CLUSTER_THRESHOLD && !expanded_set.contains(node.path.as_str()) {
                // This is an oversized folder that's not expanded - keep it but we'll add a cluster node
                clustered_nodes.push(node.clone());
                
                // Get all children for this folder (for summary)
                let all_children: Vec<&GraphNode> = nodes.iter()
                    .filter(|n| {
                        if let Some(parent_path) = &n.parent_path {
                            parent_path == &node.path
                        } else {
                            false
                        }
                    })
                    .collect();
                
                if all_children.len() > FOLDER_CLUSTER_THRESHOLD as usize {
                    // Hide children beyond the first 20, add cluster node
                    let to_show = 20;
                    let to_hide = all_children.len() - to_show;
                    
                    for (idx, child) in all_children.iter().enumerate() {
                        if idx >= to_show {
                            nodes_to_hide.insert(child.id);
                        }
                    }
                    
                    // Compute cluster summary
                    let summary = compute_cluster_summary(&all_children);
                    
                    // Add cluster node with summary
                    clustered_nodes.push(GraphNode {
                        id: cluster_id,
                        label: format!("+{to_hide} more"),
                        path: format!("{}/__cluster__", node.path),
                        is_dir: true,
                        size_bytes: summary.total_size,
                        extension: None,
                        parent_path: Some(node.path.clone()),
                        is_cluster: true,
                        child_count: Some(to_hide as i64),
                        x: None,
                        y: None,
                        cluster_summary: Some(summary),
                    });
                    selected_ids.insert(cluster_id);
                    cluster_id -= 1;
                }
            } else {
                // Folder is either small or expanded - show all children
                clustered_nodes.push(node.clone());
            }
        } else {
            clustered_nodes.push(node.clone());
        }
    }
    
    // Filter out hidden nodes
    let final_nodes: Vec<GraphNode> = clustered_nodes
        .into_iter()
        .filter(|n| !nodes_to_hide.contains(&n.id))
        .take(node_limit as usize)
        .collect();
    
    // Rebuild selected_ids based on final nodes
    let final_selected_ids: HashSet<i64> = final_nodes.iter().map(|n| n.id).collect();

    // Build edges: containment relationships
    let mut edges = Vec::new();
    let mut edge_id = 1_i64;
    
    // Generate synthetic containment edges
    for node in &final_nodes {
        if let Some(parent_id) = get_parent_id(&conn, &node.path)? {
            if final_selected_ids.contains(&parent_id) {
                edges.push(GraphEdge {
                    id: edge_id,
                    source_id: parent_id,
                    target_id: node.id,
                    edge_type: "contains".to_string(),
                    weight: 1.0,
                });
                edge_id += 1;
            }
        }
    }
    
    // Also query explicit edges from database
    let mut edge_stmt = conn
        .prepare(
            r#"
            SELECT e.id, e.source_id, e.target_id, e.edge_type, e.weight
            FROM edges e
            JOIN files source ON source.id = e.source_id
            JOIN files target ON target.id = e.target_id
            WHERE (source.path = ?1 OR source.path LIKE ?2 ESCAPE '\')
              AND (target.path = ?1 OR target.path LIKE ?2 ESCAPE '\')
            ORDER BY e.edge_type ASC, e.id ASC
            LIMIT ?3
            "#,
        )
        .map_err(|e| e.to_string())?;

    let edge_rows = edge_stmt
        .query_map(
            params![scope, db::child_prefix(&scope), node_limit * 2],
            |row| {
                Ok(GraphEdge {
                    id: row.get(0)?,
                    source_id: row.get(1)?,
                    target_id: row.get(2)?,
                    edge_type: row.get(3)?,
                    weight: row.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    for row in edge_rows {
        let edge = row.map_err(|e| e.to_string())?;
        if final_selected_ids.contains(&edge.source_id) && final_selected_ids.contains(&edge.target_id) {
            edges.push(edge);
        }
    }

    Ok(GraphPayload {
        root_path: root,
        mode: mode.into(),
        nodes: with_radial_positions(final_nodes),
        edges,
        capped: total_in_scope > node_limit,
        node_limit,
        total_in_scope,
    })
}

fn get_parent_id(conn: &Connection, path: &str) -> Result<Option<i64>, String> {
    let parent_path = Path::new(path)
        .parent()
        .map(|p| p.to_string_lossy().to_string());
    
    if let Some(parent) = parent_path {
        let result: Result<i64, rusqlite::Error> = conn.query_row(
            "SELECT id FROM files WHERE path = ?1",
            params![parent],
            |row| row.get(0),
        );
        match result {
            Ok(id) => Ok(Some(id)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(None)
    }
}

fn with_radial_positions(mut nodes: Vec<GraphNode>) -> Vec<GraphNode> {
    let total = nodes.len().max(1) as f64;
    for (index, node) in nodes.iter_mut().enumerate() {
        let angle = index as f64 / total * std::f64::consts::TAU;
        let radius = if node.is_cluster {
            280.0
        } else {
            120.0 + (index % 5) as f64 * 45.0
        };
        node.x = Some(angle.cos() * radius);
        node.y = Some(angle.sin() * radius);
    }
    nodes
}

fn canonicalize(path: &str) -> String {
    let path = Path::new(path);
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

/// Compute summary statistics for a cluster of nodes
fn compute_cluster_summary(children: &[&GraphNode]) -> ClusterSummary {
    let total_children = children.len() as i64;
    let file_count = children.iter().filter(|n| !n.is_dir).count() as i64;
    let dir_count = children.iter().filter(|n| n.is_dir).count() as i64;
    let total_size: i64 = children.iter().map(|n| n.size_bytes).sum();
    
    // Count extensions and get top 5
    let mut ext_counts: HashMap<String, i64> = HashMap::new();
    for child in children {
        if let Some(ext) = &child.extension {
            *ext_counts.entry(ext.clone()).or_insert(0) += 1;
        }
    }
    
    // Sort by count and take top 5
    let mut ext_vec: Vec<(String, i64)> = ext_counts.into_iter().collect();
    ext_vec.sort_by_key(|(_, count)| Reverse(*count));
    let top_extensions: Vec<String> = ext_vec.into_iter()
        .take(5)
        .map(|(ext, _)| ext)
        .collect();
    
    ClusterSummary {
        total_children,
        file_count,
        dir_count,
        total_size,
        top_extensions,
    }
}
