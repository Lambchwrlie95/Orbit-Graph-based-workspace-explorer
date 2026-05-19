use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};

use crate::db;
use crate::models::{ClusterSummary, GraphEdge, GraphNode, GraphPayload};

const DEFAULT_NODE_LIMIT: usize = 800;
const MIN_NODE_LIMIT: usize = 25;
const MAX_NODE_LIMIT: usize = 5_000;
// Lower per-folder limit so large flat dirs (e.g. ~/.config with 60+ subdirs)
// collapse into a cluster node instead of creating a visual fan in the orbit graph.
// Users can expand the cluster to reveal more children.
const DEFAULT_FOLDER_CHILD_LIMIT: usize = 22;
const EXPANDED_FOLDER_CHILD_LIMIT: usize = 500;
// Cap non-containment edges per source node. A single file with 200 imports
// produces 200 chord lines through the canvas — visual noise that drowns the
// graph. 8 keeps the strongest links visible without starbursting.
const DEFAULT_MAX_CROSS_EDGES_PER_NODE: usize = 8;
const MAX_CROSS_EDGES_CEILING: usize = 64;

pub fn load_graph(
    db_path: &Path,
    root_path: &str,
    scope_path: Option<&str>,
    mode: &str,
    expanded_folders: Option<&[String]>,
    node_limit: Option<i64>,
    max_cross_edges_per_node: Option<i64>,
) -> Result<GraphPayload, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let root = canonicalize(root_path);
    let scope = canonicalize(scope_path.unwrap_or(root_path));
    if !Path::new(&scope).starts_with(Path::new(&root)) {
        return Err("Graph scope must stay inside the active workspace root".into());
    }
    let node_limit = normalize_node_limit(node_limit);
    let expanded: HashSet<String> = expanded_folders
        .unwrap_or(&[])
        .iter()
        .map(|path| canonicalize(path))
        .collect();

    let scope_prefix = db::child_prefix(&scope);

    // Keep the total so the UI can report visible vs. indexed counts.
    let total_in_scope: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'",
            params![scope, scope_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut nodes = Vec::new();
    let mut visible_paths = HashSet::new();
    let mut queue = VecDeque::new();
    let mut next_cluster_id = -1_i64;

    if let Some(scope_node) = get_node_by_path(&conn, &scope)? {
        visible_paths.insert(scope_node.path.clone());
        if scope_node.is_dir {
            queue.push_back(scope_node.path.clone());
        }
        nodes.push(scope_node);
    }

    while let Some(parent_path) = queue.pop_front() {
        if nodes.len() >= node_limit {
            break;
        }

        let remaining_slots = node_limit.saturating_sub(nodes.len());
        if remaining_slots == 0 {
            break;
        }

        let per_folder_limit = if expanded.contains(&parent_path) {
            EXPANDED_FOLDER_CHILD_LIMIT
        } else {
            DEFAULT_FOLDER_CHILD_LIMIT
        };
        let child_slots = remaining_slots.saturating_sub(1).min(per_folder_limit);
        let fetch_limit = child_slots.saturating_add(1).max(1);
        let children = direct_children(&conn, &parent_path, fetch_limit)?;
        let has_hidden_children = children.len() > child_slots;
        let visible_child_count = if has_hidden_children {
            child_slots
        } else {
            children.len().min(remaining_slots)
        };

        for child in children.into_iter().take(visible_child_count) {
            if visible_paths.insert(child.path.clone()) {
                if child.is_dir {
                    queue.push_back(child.path.clone());
                }
                nodes.push(child);
            }
        }

        if has_hidden_children && nodes.len() < node_limit {
            if let Some(summary) = hidden_child_summary(&conn, &parent_path, visible_child_count)? {
                nodes.push(cluster_node(&parent_path, next_cluster_id, summary));
                next_cluster_id -= 1;
            }
        }
    }

    let final_nodes = nodes;
    let final_selected_ids: HashSet<i64> = final_nodes.iter().map(|n| n.id).collect();
    let visible_real_count = final_nodes.iter().filter(|node| !node.is_cluster).count() as i64;

    // Build a path->id map for O(1) parent lookups instead of N+1 DB queries
    let path_to_id: HashMap<String, i64> =
        final_nodes.iter().map(|n| (n.path.clone(), n.id)).collect();

    // Build edges: containment relationships
    let mut edges = Vec::new();
    let mut edge_id = -1_i64;

    // Generate synthetic containment edges
    for node in &final_nodes {
        if let Some(parent_path) = Path::new(&node.path).parent() {
            let parent_str = parent_path.to_string_lossy().to_string();
            if let Some(&parent_id) = path_to_id.get(&parent_str) {
                edges.push(GraphEdge {
                    id: edge_id,
                    source_id: parent_id,
                    target_id: node.id,
                    edge_type: "contains".to_string(),
                    weight: 1.0,
                });
                edge_id -= 1;
            }
        }
    }

    let cross_edge_cap = normalize_cross_edge_cap(max_cross_edges_per_node);
    edges.extend(visible_relationship_edges(
        &conn,
        &final_selected_ids,
        cross_edge_cap,
    )?);

    Ok(GraphPayload {
        root_path: root,
        mode: mode.into(),
        nodes: with_radial_positions(final_nodes),
        edges,
        capped: visible_real_count < total_in_scope,
        node_limit: node_limit as i64,
        total_in_scope,
    })
}

fn normalize_node_limit(limit: Option<i64>) -> usize {
    limit
        .unwrap_or(DEFAULT_NODE_LIMIT as i64)
        .clamp(MIN_NODE_LIMIT as i64, MAX_NODE_LIMIT as i64) as usize
}

fn normalize_cross_edge_cap(cap: Option<i64>) -> usize {
    cap.unwrap_or(DEFAULT_MAX_CROSS_EDGES_PER_NODE as i64)
        .clamp(0, MAX_CROSS_EDGES_CEILING as i64) as usize
}

fn get_node_by_path(conn: &Connection, path: &str) -> Result<Option<GraphNode>, String> {
    conn.query_row(
        r#"
        SELECT id, name, path, is_dir, size_bytes, extension, parent_path
        FROM files
        WHERE path = ?1
        "#,
        params![path],
        row_to_graph_node,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn direct_children(
    conn: &Connection,
    parent_path: &str,
    limit: usize,
) -> Result<Vec<GraphNode>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, path, is_dir, size_bytes, extension, parent_path
            FROM files
            WHERE parent_path = ?1
            ORDER BY is_dir DESC, name COLLATE NOCASE ASC
            LIMIT ?2
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![parent_path, limit as i64], row_to_graph_node)
        .map_err(|e| e.to_string())?;
    let mut children = Vec::new();
    for row in rows {
        children.push(row.map_err(|e| e.to_string())?);
    }
    Ok(children)
}

fn row_to_graph_node(row: &Row<'_>) -> rusqlite::Result<GraphNode> {
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
}

fn hidden_child_summary(
    conn: &Connection,
    parent_path: &str,
    visible_child_count: usize,
) -> Result<Option<ClusterSummary>, String> {
    let (total_children, file_count, dir_count, total_size): (i64, i64, i64, i64) = conn
        .query_row(
            r#"
            WITH hidden AS (
              SELECT is_dir, size_bytes, extension
              FROM files
              WHERE parent_path = ?1
              ORDER BY is_dir DESC, name COLLATE NOCASE ASC
              LIMIT -1 OFFSET ?2
            )
            SELECT
              COUNT(*),
              COALESCE(SUM(CASE WHEN is_dir = 0 THEN 1 ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN is_dir = 1 THEN 1 ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN is_dir = 0 THEN size_bytes ELSE 0 END), 0)
            FROM hidden
            "#,
            params![parent_path, visible_child_count as i64],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    if total_children == 0 {
        return Ok(None);
    }

    let mut ext_stmt = conn
        .prepare(
            r#"
            WITH hidden AS (
              SELECT is_dir, extension
              FROM files
              WHERE parent_path = ?1
              ORDER BY is_dir DESC, name COLLATE NOCASE ASC
              LIMIT -1 OFFSET ?2
            )
            SELECT extension
            FROM hidden
            WHERE is_dir = 0 AND extension IS NOT NULL AND extension != ''
            GROUP BY extension
            ORDER BY COUNT(*) DESC, extension COLLATE NOCASE ASC
            LIMIT 5
            "#,
        )
        .map_err(|e| e.to_string())?;
    let ext_rows = ext_stmt
        .query_map(params![parent_path, visible_child_count as i64], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    let mut top_extensions = Vec::new();
    for row in ext_rows {
        top_extensions.push(row.map_err(|e| e.to_string())?);
    }

    Ok(Some(ClusterSummary {
        total_children,
        file_count,
        dir_count,
        total_size,
        top_extensions,
    }))
}

fn cluster_node(parent_path: &str, id: i64, summary: ClusterSummary) -> GraphNode {
    GraphNode {
        id,
        label: format!("+{} more", summary.total_children),
        path: format!("{parent_path}/__cluster__"),
        is_dir: true,
        size_bytes: summary.total_size,
        extension: None,
        parent_path: Some(parent_path.to_string()),
        is_cluster: true,
        child_count: Some(summary.total_children),
        x: None,
        y: None,
        cluster_summary: Some(summary),
    }
}

fn visible_relationship_edges(
    conn: &Connection,
    visible_ids: &HashSet<i64>,
    cap_per_source: usize,
) -> Result<Vec<GraphEdge>, String> {
    let ids: Vec<i64> = visible_ids.iter().copied().filter(|id| *id > 0).collect();
    if ids.is_empty() || cap_per_source == 0 {
        return Ok(Vec::new());
    }

    let placeholders = vec!["?"; ids.len()].join(",");
    // Sort by weight DESC (strongest first), then id DESC (most recent first) so
    // the per-source cap below keeps the most meaningful edges.
    let sql = format!(
        r#"
        SELECT id, source_id, target_id, edge_type, weight
        FROM edges
        WHERE edge_type != 'contains'
          AND source_id IN ({placeholders})
          AND target_id IN ({placeholders})
        ORDER BY source_id ASC, weight DESC, id DESC
        "#
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut edge_params = ids.clone();
    edge_params.extend(ids);
    let rows = stmt
        .query_map(params_from_iter(edge_params), |row| {
            Ok(GraphEdge {
                id: row.get(0)?,
                source_id: row.get(1)?,
                target_id: row.get(2)?,
                edge_type: row.get(3)?,
                weight: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut edges = Vec::new();
    let mut per_source: HashMap<i64, usize> = HashMap::new();
    for row in rows {
        let edge = row.map_err(|e| e.to_string())?;
        let count = per_source.entry(edge.source_id).or_insert(0);
        if *count >= cap_per_source {
            continue;
        }
        *count += 1;
        edges.push(edge);
    }
    Ok(edges)
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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn load_graph_caps_large_scope_with_cluster_node() {
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let root = temp_dir.path().canonicalize().expect("canonical root");
        let db_file = tempfile::NamedTempFile::new().expect("db file");
        crate::db::init_database(db_file.path()).expect("init db");
        let conn = Connection::open(db_file.path()).expect("open db");
        let root_str = root.to_string_lossy().to_string();

        insert_file(&conn, &root_str, "root", None, true, None, 0);
        for index in 0..80 {
            let name = format!("file-{index:02}.txt");
            let path = root.join(&name);
            let path_str = path.to_string_lossy().to_string();
            insert_file(
                &conn,
                &path_str,
                &name,
                Some(&root_str),
                false,
                Some("txt"),
                10,
            );
        }

        let payload = load_graph(
            db_file.path(),
            &root_str,
            Some(&root_str),
            "workspace",
            None,
            Some(50),
            None,
        )
        .expect("load graph");

        assert!(payload.capped);
        assert_eq!(payload.node_limit, 50);
        assert_eq!(payload.total_in_scope, 81);
        assert!(payload.nodes.len() <= 50);

        let cluster = payload
            .nodes
            .iter()
            .find(|node| node.is_cluster)
            .expect("cluster node");
        let summary = cluster.cluster_summary.as_ref().expect("cluster summary");
        let expected_hidden = 80 - DEFAULT_FOLDER_CHILD_LIMIT.min(48) as i64;
        assert_eq!(summary.total_children, expected_hidden);
        assert_eq!(summary.file_count, expected_hidden);
        assert_eq!(summary.dir_count, 0);
    }

    fn insert_file(
        conn: &Connection,
        path: &str,
        name: &str,
        parent_path: Option<&str>,
        is_dir: bool,
        extension: Option<&str>,
        size_bytes: i64,
    ) {
        conn.execute(
            r#"
            INSERT INTO files(path, name, parent_path, extension, mime_type, size_bytes, is_dir)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                path,
                name,
                parent_path,
                extension,
                if is_dir {
                    Some("inode/directory")
                } else {
                    None
                },
                size_bytes,
                if is_dir { 1 } else { 0 },
            ],
        )
        .expect("insert file");
    }
}
