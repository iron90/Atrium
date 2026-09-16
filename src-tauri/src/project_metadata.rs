use std::path::Path;

use serde_json::Value;

use crate::project_path::read_project_text_file;

pub fn read_project_name(path: &Path) -> Option<String> {
    if let Some(package) = read_json(path, "package.json") {
        if let Some(name) = package.get("name").and_then(Value::as_str) {
            return Some(name.to_string());
        }
    }
    if let Some(name) = read_toml_string(path, "Cargo.toml", &[&["package", "name"]]) {
        return Some(name);
    }
    if let Some(name) = read_pubspec_name(path) {
        return Some(name);
    }
    if let Some(name) = read_toml_string(
        path,
        "pyproject.toml",
        &[&["project", "name"], &["tool", "poetry", "name"]],
    ) {
        return Some(name);
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
    let content = read_project_text_file(path, Path::new(file)).ok()??;
    serde_json::from_str(&content).ok()
}

fn read_toml_string(path: &Path, file: &str, candidates: &[&[&str]]) -> Option<String> {
    let content = read_project_text_file(path, Path::new(file)).ok()??;
    let document = toml::from_str::<toml::Value>(&content).ok()?;

    candidates.iter().find_map(|segments| {
        let value = segments
            .iter()
            .try_fold(&document, |value, segment| value.get(*segment))?;
        let value = value.as_str()?.trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}

fn read_pubspec_name(path: &Path) -> Option<String> {
    let content = read_project_text_file(path, Path::new("pubspec.yaml")).ok()??;
    content.lines().find_map(parse_pubspec_root_name)
}

fn parse_pubspec_root_name(line: &str) -> Option<String> {
    if line.chars().next().is_some_and(char::is_whitespace) {
        return None;
    }

    let (key, value) = line.split_once(':')?;
    if key.trim() != "name" {
        return None;
    }

    let value = strip_yaml_comment(value).trim();
    if value.is_empty() || matches!(value.chars().next(), Some('|' | '>')) {
        return None;
    }

    let value = match value.as_bytes() {
        [b'\'', rest @ .., b'\''] => String::from_utf8_lossy(rest).replace("''", "'"),
        [b'"', rest @ .., b'"'] => String::from_utf8_lossy(rest).into_owned(),
        _ => value.to_string(),
    };
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn strip_yaml_comment(value: &str) -> &str {
    let mut quote = None;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match (quote, character) {
            (Some('"'), '\\') => escaped = true,
            (Some(current), character) if current == character => quote = None,
            (None, '\'') | (None, '"') => quote = Some(character),
            (None, '#') => return &value[..index],
            _ => {}
        }
    }
    value
}

#[cfg(test)]
mod tests {
    use super::{parse_pubspec_root_name, read_project_name};
    use std::fs;

    #[test]
    fn reads_names_from_structured_toml_sections() {
        let root = fixture_root("toml-name");
        fs::write(
            root.join("Cargo.toml"),
            "[package]\nname = \"actual-project\"\n\n[dependencies]\nname = \"unrelated\"\n",
        )
        .expect("write cargo manifest");

        assert_eq!(read_project_name(&root).as_deref(), Some("actual-project"));

        remove_fixture(root);
    }

    #[test]
    fn reads_only_standard_pyproject_name_locations() {
        let root = fixture_root("pyproject-name");
        fs::write(
            root.join("pyproject.toml"),
            "[tool.other]\nname = \"unrelated\"\n\n[project]\nname = \"actual-project\"\n",
        )
        .expect("write pyproject manifest");

        assert_eq!(read_project_name(&root).as_deref(), Some("actual-project"));

        remove_fixture(root);
    }

    #[test]
    fn reads_only_root_level_pubspec_name() {
        assert_eq!(
            parse_pubspec_root_name("  name: nested-project"),
            None,
            "nested YAML keys must not become project names"
        );
        assert_eq!(
            parse_pubspec_root_name("name: actual-project # package name"),
            Some("actual-project".to_string())
        );
        assert_eq!(
            parse_pubspec_root_name("name: 'actual''project'"),
            Some("actual'project".to_string())
        );
    }

    fn fixture_root(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "atrium-project-metadata-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create metadata fixture");
        root
    }

    fn remove_fixture(root: std::path::PathBuf) {
        fs::remove_dir_all(root).expect("remove metadata fixture");
    }
}
