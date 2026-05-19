use git2::{Repository, Status, StatusOptions};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Git status information for a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileGitStatus {
    pub status: GitStatus,
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
}

/// Git status variants
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitStatus {
    Current,        // No changes
    Modified,       // Modified but not staged
    Staged,         // Staged for commit
    StagedModified, // Staged with further modifications
    New,            // Untracked file
    Deleted,        // Deleted
    Renamed,        // Renamed
    Ignored,        // In .gitignore
    Conflicted,     // Merge conflict
    Unknown,        // Error or not in git repo
}

impl From<Status> for GitStatus {
    fn from(status: Status) -> Self {
        if status.is_conflicted() {
            GitStatus::Conflicted
        } else if status.is_ignored() {
            GitStatus::Ignored
        } else if status.is_index_new() || status.is_wt_new() {
            GitStatus::New
        } else if status.is_index_deleted() || status.is_wt_deleted() {
            GitStatus::Deleted
        } else if status.is_index_renamed() || status.is_wt_renamed() {
            GitStatus::Renamed
        } else if status.is_index_modified() && status.is_wt_modified() {
            GitStatus::StagedModified
        } else if status.is_index_modified() {
            GitStatus::Staged
        } else if status.is_wt_modified() {
            GitStatus::Modified
        } else {
            GitStatus::Current
        }
    }
}

impl GitStatus {
    /// Get a display label for the status
    #[allow(dead_code)]
    pub fn label(&self) -> &'static str {
        match self {
            GitStatus::Current => "Current",
            GitStatus::Modified => "Modified",
            GitStatus::Staged => "Staged",
            GitStatus::StagedModified => "Staged + Modified",
            GitStatus::New => "Untracked",
            GitStatus::Deleted => "Deleted",
            GitStatus::Renamed => "Renamed",
            GitStatus::Ignored => "Ignored",
            GitStatus::Conflicted => "Conflicted",
            GitStatus::Unknown => "Unknown",
        }
    }

    /// Get a short status character (like git status --short)
    #[allow(dead_code)]
    pub fn short_status(&self) -> &'static str {
        match self {
            GitStatus::Current => " ",
            GitStatus::Modified => "M",
            GitStatus::Staged => "A",
            GitStatus::StagedModified => "AM",
            GitStatus::New => "?",
            GitStatus::Deleted => "D",
            GitStatus::Renamed => "R",
            GitStatus::Ignored => "!",
            GitStatus::Conflicted => "U",
            GitStatus::Unknown => "-",
        }
    }
}

/// Get the git status for a single file
pub fn get_file_status(repo_path: &Path, file_path: &Path) -> Option<FileGitStatus> {
    let repo = Repository::open(repo_path).ok()?;
    let relative_path = file_path.strip_prefix(repo_path).ok()?;

    // Use status_file for efficient single-file status check
    let status = repo.status_file(relative_path).ok()?;

    Some(FileGitStatus {
        status: status.into(),
        additions: None, // Line counts would require diff computation
        deletions: None,
    })
}

/// Find the git repository root for a given file path
/// Walks up the directory tree to find a .git directory
pub fn find_repo_root(file_path: &Path) -> Option<std::path::PathBuf> {
    let mut current = if file_path.is_file() {
        file_path.parent()?
    } else {
        file_path
    };

    loop {
        // Check for .git directory or file (submodules use a file)
        let git_path = current.join(".git");
        if git_path.exists() {
            return Some(current.to_path_buf());
        }

        // Try to open as git repo (handles edge cases)
        if Repository::open(current).is_ok() {
            return Some(current.to_path_buf());
        }

        // Move up to parent
        current = current.parent()?;
    }
}

/// Get status for all files in a repository (for batch operations)
#[allow(dead_code)]
pub fn get_repo_status(
    repo_path: &Path,
) -> Result<Vec<(std::path::PathBuf, GitStatus)>, git2::Error> {
    let repo = Repository::open(repo_path)?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .include_ignored(false)
        .recurse_untracked_dirs(false);

    let statuses = repo.statuses(Some(&mut opts))?;

    let mut results = Vec::new();
    for entry in statuses.iter() {
        if let Some(path) = entry.path() {
            let full_path = repo_path.join(path);
            let status: GitStatus = entry.status().into();
            results.push((full_path, status));
        }
    }

    Ok(results)
}

/// Check if a file is tracked by git
#[allow(dead_code)]
pub fn is_tracked(file_path: &Path) -> Option<bool> {
    let repo_root = find_repo_root(file_path)?;
    let status = get_file_status(&repo_root, file_path)?;

    Some(!matches!(
        status.status,
        GitStatus::New | GitStatus::Ignored | GitStatus::Unknown
    ))
}

/// Get detailed diff stats for a file (additions/deletions)
pub fn get_diff_stats(repo_path: &Path, file_path: &Path) -> Option<(u32, u32)> {
    let repo = Repository::open(repo_path).ok()?;
    let relative_path = file_path.strip_prefix(repo_path).ok()?;

    // Get the diff between HEAD and working tree
    let head = repo.head().ok()?.peel_to_tree().ok()?;
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.pathspec(relative_path);

    let diff = repo
        .diff_tree_to_workdir_with_index(Some(&head), Some(&mut diff_opts))
        .ok()?;

    let mut additions = 0u32;
    let mut deletions = 0u32;

    diff.foreach(
        &mut |_delta, _progress| true,
        None,
        None,
        Some(&mut |_delta, _hunk, line| {
            match line.origin() {
                '+' => additions += 1,
                '-' => deletions += 1,
                _ => {}
            }
            true
        }),
    )
    .ok()?;

    Some((additions, deletions))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_status_from_status() {
        // Test status conversions
        let status = Status::WT_MODIFIED;
        let git_status: GitStatus = status.into();
        assert!(matches!(git_status, GitStatus::Modified));

        let status = Status::INDEX_NEW;
        let git_status: GitStatus = status.into();
        assert!(matches!(git_status, GitStatus::New));

        let status = Status::IGNORED;
        let git_status: GitStatus = status.into();
        assert!(matches!(git_status, GitStatus::Ignored));
    }

    #[test]
    fn test_git_status_labels() {
        assert_eq!(GitStatus::Modified.label(), "Modified");
        assert_eq!(GitStatus::New.label(), "Untracked");
        assert_eq!(GitStatus::Staged.label(), "Staged");
        assert_eq!(GitStatus::Current.label(), "Current");
    }

    #[test]
    fn test_short_status() {
        assert_eq!(GitStatus::Modified.short_status(), "M");
        assert_eq!(GitStatus::New.short_status(), "?");
        assert_eq!(GitStatus::Deleted.short_status(), "D");
        assert_eq!(GitStatus::Current.short_status(), " ");
    }

    #[test]
    fn test_find_repo_root_in_non_repo() {
        let _ = find_repo_root(Path::new("/tmp"));
    }
}
