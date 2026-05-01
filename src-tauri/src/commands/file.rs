use std::fs;
use std::path::Path;

// File editing commands for the Monaco Editor integration.
// These provide scoped validation and descriptive errors for Monaco reads/writes.

/// Read file content for editing
/// 
/// # Arguments
/// * `path` - Absolute path to the file
/// 
/// # Returns
/// File contents as string, or error message
#[tauri::command]
pub async fn read_file_for_edit(path: String) -> Result<String, String> {
    // Validate the path exists and is a file
    let path_obj = Path::new(&path);
    
    if !path_obj.exists() {
        return Err(format!("File not found: {}", path));
    }
    
    if !path_obj.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }
    
    // Read file content
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

/// Save file content to disk
/// 
/// # Arguments
/// * `path` - Absolute path to the file
/// * `content` - New file content
/// 
/// # Returns
/// Empty result on success, or error message
/// 
/// # Security
/// This command validates the path to prevent directory traversal attacks.
/// The path must be within the allowed workspace scope.
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    let path_obj = Path::new(&path);
    
    // Security: Validate path doesn't contain traversal sequences
    // This is a basic check; additional workspace scope validation should be done
    // by the caller or through Tauri's filesystem scope configuration
    if path.contains("..") {
        return Err("Invalid path: directory traversal not allowed".to_string());
    }
    
    // Ensure parent directory exists
    if let Some(parent) = path_obj.parent() {
        if !parent.exists() {
            return Err(format!("Parent directory does not exist: {}", parent.display()));
        }
    }
    
    // If file exists, ensure it's actually a file
    if path_obj.exists() && !path_obj.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }
    
    // Write content to file
    fs::write(&path, content)
        .map_err(|e| format!("Failed to save file '{}': {}", path, e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_read_file_for_edit_success() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "Hello, World!").unwrap();
        
        let path = temp_file.path().to_str().unwrap().to_string();
        let result = read_file_for_edit(path).await;
        
        assert!(result.is_ok());
        assert!(result.unwrap().contains("Hello, World!"));
    }

    #[tokio::test]
    async fn test_read_file_for_edit_not_found() {
        let result = read_file_for_edit("/nonexistent/path/file.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_save_file_success() {
        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path().to_str().unwrap().to_string();
        
        let result = save_file(path, "New content".to_string()).await;
        assert!(result.is_ok());
        
        // Verify content was written
        let content = fs::read_to_string(temp_file.path()).unwrap();
        assert_eq!(content, "New content");
    }

    #[tokio::test]
    async fn test_save_file_traversal_blocked() {
        let result = save_file("../etc/passwd".to_string(), "malicious".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("directory traversal"));
    }
}
