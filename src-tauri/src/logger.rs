use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

use chrono::Utc;

const APP_DIR: &str = "orbit";
const LOG_FILE: &str = "app.log";

pub fn log_event(message: impl AsRef<str>) {
    let Some(path) = log_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let _ = writeln!(file, "[{}] {}", Utc::now().to_rfc3339(), message.as_ref());
}

pub fn log_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join(APP_DIR).join(LOG_FILE))
}
