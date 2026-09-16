use std::fs;
use std::path::Path;

use serde_json::Value;

pub fn read_project_name(path: &Path) -> Option<String> {
    if let Some(package) = read_json(path, "package.json") {
        if let Some(name) = package.get("name").and_then(Value::as_str) {
            return Some(name.to_string());
        }
    }
    for file in ["Cargo.toml", "pubspec.yaml", "pyproject.toml"] {
        if let Ok(content) = fs::read_to_string(path.join(file)) {
            for line in content.lines() {
                let value = line
                    .strip_prefix("name:")
                    .or_else(|| line.strip_prefix("name ="));
                if let Some(value) = value {
                    let value = value
                        .trim()
                        .trim_matches(|character| character == '"' || character == '\'');
                    if !value.is_empty() {
                        return Some(value.to_string());
                    }
                }
            }
        }
    }
    None
}

pub fn read_project_description(path: &Path) -> Option<String> {
    if let Some(package) = read_json(path, "package.json") {
        if let Some(description) = package.get("description").and_then(Value::as_str) {
            return Some(description.to_string());
        }
    }
    None
}

fn read_json(path: &Path, file: &str) -> Option<Value> {
    let content = fs::read_to_string(path.join(file)).ok()?;
    serde_json::from_str(&content).ok()
}
