use std::collections::HashSet;
use std::path::Path;

use rusqlite::{params, Connection};

use crate::db;
use crate::models::{GraphEdge, GraphNode, GraphPayload};

const DEFAULT_NODE_LIMIT: i64 = 1_500;

pub fn load_graph(
    db_path: &Path,
    root_path: &str,
    scope_path: Option<&str>,
    mode: &str,
    limit: Option<i64>,
) -> Result<GraphPayload, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let root = canonicalize(root_path);
    let scope = canonicalize(scope_path.unwrap_or(root_path));
    if !scope.starts_with(&root) {
        return Err("Graph scope must stay inside the active workspace root".into());
    }

    let node_limit = limit.unwrap_or(DEFAULT_NODE_LIMIT).clamp(100, 2_000);
    let scope_prefix = db::child_prefix(&scope);
    let total_in_scope: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'",
            params![scope, scope_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut node_stmt = conn
        .prepare(
            r#"
            SELECT id, name, path, is_dir, size_bytes, extension
            FROM files
            WHERE path = ?1 OR path LIKE ?2 ESCAPE '\'
            ORDER BY
              CASE
                WHEN path = ?1 THEN 0
                ELSE length(substr(path, length(?1) + 2)) - length(replace(substr(path, length(?1) + 2), '/', '')) + 1
              END ASC,
              is_dir DESC,
              name COLLATE NOCASE ASC
            LIMIT ?3
            "#,
        )
        .map_err(|e| e.to_string())?;

    let mut nodes = Vec::new();
    let mut selected_ids = HashSet::new();
    let node_rows = node_stmt
        .query_map(
            params![scope, db::child_prefix(&scope), node_limit],
            |row| {
                Ok(GraphNode {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    path: row.get(2)?,
                    is_dir: row.get::<_, i64>(3)? == 1,
                    size_bytes: row.get(4)?,
                    extension: row.get(5)?,
                    is_cluster: false,
                    child_count: None,
                    x: None,
                    y: None,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    for row in node_rows {
        let node = row.map_err(|e| e.to_string())?;
        selected_ids.insert(node.id);
        nodes.push(node);
    }

    if total_in_scope > node_limit {
        let cluster_id = -1;
        let omitted = total_in_scope - node_limit;
        nodes.push(GraphNode {
            id: cluster_id,
            label: format!("{omitted} more"),
            path: scope.clone(),
            is_dir: true,
            size_bytes: 0,
            extension: None,
            is_cluster: true,
            child_count: Some(omitted),
            x: None,
            y: None,
        });
        if let Some(root_node_id) = selected_ids.iter().min().copied() {
            // Negative ID keeps the summary edge separate from persisted DB edges.
            selected_ids.insert(cluster_id);
            let _ = root_node_id;
        }
    }

    let mut edges = Vec::new();
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
        if selected_ids.contains(&edge.source_id) && selected_ids.contains(&edge.target_id) {
            edges.push(edge);
        }
    }

    Ok(GraphPayload {
        root_path: root,
        mode: mode.into(),
        nodes: with_radial_positions(nodes),
        edges,
        capped: total_in_scope > node_limit,
        node_limit,
        total_in_scope,
    })
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
