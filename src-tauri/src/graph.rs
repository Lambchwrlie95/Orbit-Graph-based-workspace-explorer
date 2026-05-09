use std::collections::HashSet;
use std::path::Path;

use rusqlite::{params, Connection};

use crate::db;
use crate::models::{GraphEdge, GraphNode, GraphPayload};

pub fn load_graph(
    db_path: &Path,
    root_path: &str,
    scope_path: Option<&str>,
    mode: &str,
    _expanded_folders: Option<&[String]>,
) -> Result<GraphPayload, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let root = canonicalize(root_path);
    let scope = canonicalize(scope_path.unwrap_or(root_path));
    if !scope.starts_with(&root) {
        return Err("Graph scope must stay inside the active workspace root".into());
    }

    let scope_prefix = db::child_prefix(&scope);
    
    // Keep the total so the UI can report visible vs. indexed counts.
    let total_in_scope: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'",
            params![scope, scope_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Query every node in the requested scope. Scope selection is the boundary;
    // the backend should not hide indexed files behind quantity caps.
    let mut node_stmt = conn
        .prepare(
            r#"
            SELECT id, name, path, is_dir, size_bytes, extension, parent_path
            FROM files
            WHERE path = ?1 OR path LIKE ?2 ESCAPE '\'
            ORDER BY
              CASE WHEN path = ?1 THEN 0 ELSE 1 END ASC,
              length(substr(path, length(?1) + 2)) - length(replace(substr(path, length(?1) + 2), '/', '')) + 1 ASC,
              parent_path COLLATE NOCASE ASC,
              is_dir DESC,
              name COLLATE NOCASE ASC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let mut nodes = Vec::new();
    let node_rows = node_stmt
        .query_map(
            params![scope, db::child_prefix(&scope)],
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
        nodes.push(node);
    }

    let final_nodes = nodes;
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
            "#,
        )
        .map_err(|e| e.to_string())?;

    let edge_rows = edge_stmt
        .query_map(
            params![scope, db::child_prefix(&scope)],
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
        capped: false,
        node_limit: total_in_scope,
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
