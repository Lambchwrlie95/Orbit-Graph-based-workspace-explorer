use regex::Regex;
use std::path::Path;
use serde::{Deserialize, Serialize};

/// Code analysis result containing imports and exports
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeAnalysis {
    pub imports: Vec<Import>,
    pub exports: Vec<Export>,
}

/// Single import statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Import {
    pub name: String,
    pub path: String,
    pub import_type: ImportType,
}

/// Single export statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Export {
    pub name: String,
    pub export_type: String,
}

/// Type of import (affects how we resolve it)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportType {
    Local,    // Relative imports like ./ or ../
    Package,  // Node modules, crates, pip packages
    Std,      // Standard library
}

/// Analyze a code file and extract imports and exports
pub fn analyze_file(path: &Path, content: &str) -> Option<CodeAnalysis> {
    let ext = path.extension()?.to_str()?;
    match ext {
        "js" | "jsx" | "ts" | "tsx" | "mjs" => analyze_javascript(content),
        "py" | "pyi" => analyze_python(content),
        "rs" => analyze_rust(content),
        "java" => analyze_java(content),
        "go" => analyze_go(content),
        _ => None,
    }
}

/// Check if a file extension is a code file that can be analyzed
pub fn is_code_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("js" | "jsx" | "ts" | "tsx" | "mjs" | "py" | "pyi" | "rs" | "java" | "go" | "rb" | "php" | "c" | "cpp" | "h" | "hpp")
    )
}

fn analyze_javascript(content: &str) -> Option<CodeAnalysis> {
    let mut imports = Vec::new();
    let mut exports = Vec::new();

    // ES6 import patterns
    // import { foo, bar } from 'module'
    // import * as name from 'module'
    // import defaultExport from 'module'
    let import_re = Regex::new(
        r"import\s+(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))\s+from\s+['\"]([^'\"]+)['\"]"
    ).ok()?;

    // Require pattern for CommonJS
    // const foo = require('module')
    let require_re = Regex::new(
        r"(?:const|let|var)\s+(?:\{?\s*([^}]+)\s*\}?|\w+)\s*=\s*require\s*\(\s*['\"]([^'\"]+)['\"]\s*\)"
    ).ok()?;

    // Export patterns
    // export function foo
    // export class Foo
    // export const foo
    // export { foo, bar }
    // export default
    let export_named_re = Regex::new(
        r"export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)?\s+(\w+)"
    ).ok()?;

    for line in content.lines() {
        let line = line.trim();

        // Match ES6 imports
        for cap in import_re.captures_iter(line) {
            let module_path = cap.get(4)?.as_str().to_string();
            let import_type = classify_js_import(&module_path);
            
            // Extract name from the import
            let name = if let Some(m) = cap.get(3) {
                // Default import
                m.as_str().to_string()
            } else if let Some(m) = cap.get(1) {
                // Named imports - extract first name
                m.as_str().trim().trim_start_matches('{').trim_end_matches('}').split(',').next()?.trim().to_string()
            } else if let Some(m) = cap.get(2) {
                // Namespace import
                m.as_str().to_string()
            } else {
                continue;
            };

            imports.push(Import {
                name,
                path: module_path,
                import_type,
            });
        }

        // Match require imports
        for cap in require_re.captures_iter(line) {
            if let Some(path_match) = cap.get(2) {
                let module_path = path_match.as_str().to_string();
                let import_type = classify_js_import(&module_path);
                let name = cap.get(1).map(|m| m.as_str().trim().to_string())
                    .unwrap_or_else(|| module_path.clone());

                imports.push(Import {
                    name,
                    path: module_path,
                    import_type,
                });
            }
        }

        // Match exports
        for cap in export_named_re.captures_iter(line) {
            if let Some(name_match) = cap.get(1) {
                let name = name_match.as_str().to_string();
                let export_type = if line.contains("function") {
                    "function"
                } else if line.contains("class") {
                    "class"
                } else if line.contains("interface") {
                    "interface"
                } else if line.contains("type") {
                    "type"
                } else if line.contains("const") {
                    "const"
                } else if line.contains("default") {
                    "default"
                } else {
                    "export"
                }.to_string();

                exports.push(Export { name, export_type });
            }
        }
    }

    Some(CodeAnalysis { imports, exports })
}

fn classify_js_import(path: &str) -> ImportType {
    if path.starts_with('.') {
        ImportType::Local
    } else if path.starts_with('@') || !path.contains('/') {
        ImportType::Package
    } else if path.starts_with("node:") {
        ImportType::Std
    } else {
        ImportType::Package
    }
}

fn analyze_python(content: &str) -> Option<CodeAnalysis> {
    let mut imports = Vec::new();
    let mut exports = Vec::new();

    // Python import patterns
    // from module import name1, name2
    // import module
    // import module as alias
    let from_import_re = Regex::new(r"^from\s+(\S+)\s+import\s+(.+)$").ok()?;
    let import_re = Regex::new(r"^import\s+(.+)$").ok()?;

    // Export patterns in Python (functions, classes at module level)
    // def function_name
    // class ClassName
    let export_re = Regex::new(r"^(?:def|class)\s+(\w+)").ok()?;

    for line in content.lines() {
        let line = line.trim();

        // Match from X import Y
        if let Some(cap) = from_import_re.captures(line) {
            let module_path = cap.get(1)?.as_str().to_string();
            let names_str = cap.get(2)?.as_str();
            
            for name in names_str.split(',') {
                let name = name.trim();
                if name.is_empty() || name.starts_with('#') {
                    continue;
                }
                
                let import_type = classify_python_import(&module_path);
                imports.push(Import {
                    name: name.split_whitespace().next()?.to_string(),
                    path: module_path.clone(),
                    import_type,
                });
            }
        }

        // Match import X
        if let Some(cap) = import_re.captures(line) {
            let names_str = cap.get(1)?.as_str();
            
            for name in names_str.split(',') {
                let name = name.trim();
                if name.is_empty() || name.starts_with('#') {
                    continue;
                }
                
                // Extract just the module name (handle "as" aliases)
                let module_name = name.split_whitespace().next()?.to_string();
                let import_type = classify_python_import(&module_name);
                
                imports.push(Import {
                    name: module_name.clone(),
                    path: module_name,
                    import_type,
                });
            }
        }

        // Match exports (def/class at module level)
        if let Some(cap) = export_re.captures(line) {
            if let Some(name_match) = cap.get(1) {
                let name = name_match.as_str().to_string();
                let export_type = if line.starts_with("def") {
                    "function"
                } else {
                    "class"
                }.to_string();
                
                exports.push(Export { name, export_type });
            }
        }
    }

    Some(CodeAnalysis { imports, exports })
}

fn classify_python_import(module: &str) -> ImportType {
    let stdlib_modules = [
        "os", "sys", "pathlib", "collections", "typing", "json", "re",
        "datetime", "time", "math", "random", "hashlib", "urllib",
        "http", "functools", "itertools", "contextlib", "dataclasses",
        "enum", "abc", "io", "csv", "sqlite3", "logging", "unittest",
    ];

    if module.starts_with('.') {
        ImportType::Local
    } else if stdlib_modules.contains(&module.split('.').next().unwrap_or("")) {
        ImportType::Std
    } else {
        ImportType::Package
    }
}

fn analyze_rust(content: &str) -> Option<CodeAnalysis> {
    let mut imports = Vec::new();
    let mut exports = Vec::new();

    // Rust use statements
    // use crate::module::Item
    // use std::collections::HashMap
    // use super::ParentItem
    let use_re = Regex::new(r"^use\s+(.+);$").ok()?;

    // Pub exports
    // pub fn
    // pub struct
    // pub enum
    // pub trait
    // pub use
    // pub const
    // pub static
    // pub type
    let pub_re = Regex::new(r"^pub\s+(?:\([^)]+\)\s+)?(?:fn|struct|enum|trait|const|static|type)\s+(\w+)").ok()?;
    let pub_use_re = Regex::new(r"^pub\s+use\s+(.+);$").ok()?;

    for line in content.lines() {
        let line = line.trim();

        // Match use statements
        if let Some(cap) = use_re.captures(line) {
            let use_stmt = cap.get(1)?.as_str();
            let import_type = classify_rust_import(use_stmt);
            
            // Extract the last component as the name
            let name = use_stmt.split("::").last()
                .and_then(|s| s.split('{').next())
                .and_then(|s| s.split('}').next())
                .and_then(|s| s.split("as").next())
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| use_stmt.to_string());

            imports.push(Import {
                name,
                path: use_stmt.to_string(),
                import_type,
            });
        }

        // Match pub exports
        if let Some(cap) = pub_re.captures(line) {
            if let Some(name_match) = cap.get(1) {
                let name = name_match.as_str().to_string();
                let export_type = if line.contains("fn ") {
                    "function"
                } else if line.contains("struct ") {
                    "struct"
                } else if line.contains("enum ") {
                    "enum"
                } else if line.contains("trait ") {
                    "trait"
                } else if line.contains("const ") {
                    "const"
                } else if line.contains("static ") {
                    "static"
                } else if line.contains("type ") {
                    "type"
                } else {
                    "item"
                }.to_string();

                exports.push(Export { name, export_type });
            }
        }

        // Match pub use re-exports
        if pub_use_re.is_match(line) {
            let use_stmt = line.trim_start_matches("pub use ").trim_end_matches(';');
            exports.push(Export {
                name: use_stmt.to_string(),
                export_type: "re-export".to_string(),
            });
        }
    }

    Some(CodeAnalysis { imports, exports })
}

fn classify_rust_import(path: &str) -> ImportType {
    if path.starts_with("crate::") || path.starts_with("super::") || path.starts_with("self::") {
        ImportType::Local
    } else if path.starts_with("std::") || path.starts_with("core::") || path.starts_with("alloc::") {
        ImportType::Std
    } else {
        ImportType::Package
    }
}

fn analyze_java(content: &str) -> Option<CodeAnalysis> {
    let mut imports = Vec::new();
    let mut exports = Vec::new();

    // Java import pattern
    // import java.util.List;
    // import com.example.MyClass;
    let import_re = Regex::new(r"^import\s+(?:static\s+)?([\w.]+);$").ok()?;

    // Java exports (public classes, interfaces, methods at class level)
    let pub_class_re = Regex::new(r"^public\s+(?:class|interface|enum|record)\s+(\w+)").ok()?;
    let pub_method_re = Regex::new(r"^public\s+(?:static\s+)?(?:\w+<[^>]+>|\w+|void)\s+(\w+)\s*\(").ok()?;

    for line in content.lines() {
        let line = line.trim();

        // Match imports
        if let Some(cap) = import_re.captures(line) {
            let full_path = cap.get(1)?.as_str();
            let name = full_path.split('.').last()?.to_string();
            let import_type = classify_java_import(full_path);

            imports.push(Import {
                name,
                path: full_path.to_string(),
                import_type,
            });
        }

        // Match public classes/interfaces
        if let Some(cap) = pub_class_re.captures(line) {
            if let Some(name_match) = cap.get(1) {
                let name = name_match.as_str().to_string();
                let export_type = if line.contains("interface") {
                    "interface"
                } else if line.contains("enum") {
                    "enum"
                } else if line.contains("record") {
                    "record"
                } else {
                    "class"
                }.to_string();

                exports.push(Export { name, export_type });
            }
        }

        // Match public methods (within class body)
        if let Some(cap) = pub_method_re.captures(line) {
            if let Some(name_match) = cap.get(1) {
                exports.push(Export {
                    name: name_match.as_str().to_string(),
                    export_type: "method".to_string(),
                });
            }
        }
    }

    Some(CodeAnalysis { imports, exports })
}

fn classify_java_import(path: &str) -> ImportType {
    if path.starts_with("java.") || path.starts_with("javax.") {
        ImportType::Std
    } else {
        ImportType::Package
    }
}

fn analyze_go(content: &str) -> Option<CodeAnalysis> {
    let mut imports = Vec::new();
    let mut exports = Vec::new();

    // Go import patterns
    // import "package"
    // import alias "package"
    // import ( ... )
    let import_single_re = Regex::new(r"import\s+(?:\(\s*)?(?:(\w+)\s+)?[\"]([^\"]+)[\"]").ok()?;

    // Go exports (capitalized identifiers at package level)
    // func FuncName
    // type TypeName
    // var VarName
    // const ConstName
    let export_re = Regex::new(r"^(?:func|type|var|const)\s+([A-Z]\w*)").ok()?;

    // Check if we're in an import block
    let mut in_import_block = false;

    for line in content.lines() {
        let line = line.trim();

        // Handle import block start/end
        if line.starts_with("import (") {
            in_import_block = true;
            continue;
        }
        if in_import_block && line.starts_with(")") {
            in_import_block = false;
            continue;
        }

        // Match imports (single or in block)
        if in_import_block || line.starts_with("import ") {
            if let Some(cap) = import_single_re.captures(line) {
                let path = cap.get(2)?.as_str().to_string();
                let name = cap.get(1)
                    .map(|m| m.as_str().to_string())
                    .or_else(|| path.split('/').last().map(|s| s.to_string()))
                    .unwrap_or_else(|| path.clone());
                
                let import_type = classify_go_import(&path);
                imports.push(Import { name, path, import_type });
            }
        }

        // Match exports (must start with uppercase)
        if let Some(cap) = export_re.captures(line) {
            if let Some(name_match) = cap.get(1) {
                let name = name_match.as_str().to_string();
                let export_type = if line.starts_with("func ") {
                    "function"
                } else if line.starts_with("type ") {
                    "type"
                } else if line.starts_with("var ") {
                    "variable"
                } else if line.starts_with("const ") {
                    "const"
                } else {
                    "item"
                }.to_string();

                exports.push(Export { name, export_type });
            }
        }
    }

    Some(CodeAnalysis { imports, exports })
}

fn classify_go_import(path: &str) -> ImportType {
    // Standard library packages don't have dots in the first component
    // or are known stdlib packages
    let stdlib_packages = [
        "fmt", "os", "io", "net", "http", "strings", "strconv",
        "time", "math", "sync", "context", "encoding", "crypto",
        "database", "html", "log", "path", "regexp", "sort",
        "testing", "unicode", "unsafe",
    ];

    let first_part = path.split('/').next().unwrap_or("");
    
    if first_part.contains('.') || first_part.starts_with("github.com") {
        ImportType::Package
    } else if stdlib_packages.contains(&first_part) {
        ImportType::Std
    } else if first_part.is_empty() || !first_part.contains('.') {
        // Likely stdlib
        ImportType::Std
    } else {
        ImportType::Package
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_javascript() {
        let content = r#"
import React from 'react';
import { useState, useEffect } from 'react';
import * as utils from './utils';
import { helper } from '../helpers';
export function MyComponent() {}
export const myVar = 42;
export class MyClass {}
"#;
        let result = analyze_javascript(content).unwrap();
        assert!(!result.imports.is_empty());
        assert!(!result.exports.is_empty());
    }

    #[test]
    fn test_analyze_python() {
        let content = r#"
import os
import sys
from collections import defaultdict
from typing import List, Optional
import numpy as np
from .utils import helper

def my_function():
    pass

class MyClass:
    pass
"#;
        let result = analyze_python(content).unwrap();
        assert!(!result.imports.is_empty());
        assert!(!result.exports.is_empty());
    }

    #[test]
    fn test_analyze_rust() {
        let content = r#"
use std::collections::HashMap;
use crate::utils::helper;
use serde::{Serialize, Deserialize};
pub struct MyStruct {}
pub fn my_function() {}
"#;
        let result = analyze_rust(content).unwrap();
        assert!(!result.imports.is_empty());
        assert!(!result.exports.is_empty());
    }

    #[test]
    fn test_classify_imports() {
        assert!(matches!(classify_js_import("./utils"), ImportType::Local));
        assert!(matches!(classify_js_import("react"), ImportType::Package));
        assert!(matches!(classify_js_import("node:fs"), ImportType::Std));
        
        assert!(matches!(classify_python_import("os"), ImportType::Std));
        assert!(matches!(classify_python_import("numpy"), ImportType::Package));
        assert!(matches!(classify_python_import(".utils"), ImportType::Local));
    }
}
