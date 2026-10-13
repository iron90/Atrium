use std::collections::HashSet;

use crate::manifest_schema::ManifestDependencies;
use crate::model::DependencyDeclaration;

use super::path_policy::normalize_declared_path;

pub(super) fn parse_dependencies(
    declaration: Option<ManifestDependencies>,
    issues: &mut Vec<String>,
) -> DependencyDeclaration {
    let Some(declaration) = declaration else {
        return DependencyDeclaration::default();
    };

    let mut seen = HashSet::new();
    let paths = declaration
        .paths
        .unwrap_or_default()
        .into_iter()
        .filter_map(|raw| {
            let Some(normalized) = normalize_declared_path(&raw, &[".git", ".atrium"]) else {
                issues.push(format!(
                    "Dependency path must be a relative, non-protected directory: {raw}."
                ));
                return None;
            };
            if !seen.insert(normalized.to_lowercase()) {
                issues.push(format!("Duplicate dependency path: {normalized}."));
                return None;
            }
            Some(normalized)
        })
        .collect();

    DependencyDeclaration { paths }
}

#[cfg(test)]
mod tests {
    use super::parse_dependencies;
    use crate::manifest_schema::ManifestDependencies;

    #[test]
    fn reads_declared_dependency_paths() {
        let mut issues = Vec::new();
        let dependencies = parse_dependencies(
            Some(ManifestDependencies {
                paths: Some(vec!["node_modules".to_string(), ".venv".to_string()]),
            }),
            &mut issues,
        );

        assert_eq!(dependencies.paths, vec!["node_modules", ".venv"]);
        assert!(issues.is_empty());
    }

    #[test]
    fn an_absent_declaration_declares_nothing() {
        let mut issues = Vec::new();
        let dependencies = parse_dependencies(None, &mut issues);

        assert!(dependencies.paths.is_empty());
        assert!(issues.is_empty());
    }

    #[test]
    fn rejects_protected_and_duplicate_paths() {
        let mut issues = Vec::new();
        let dependencies = parse_dependencies(
            Some(ManifestDependencies {
                paths: Some(vec![
                    "node_modules".to_string(),
                    "Node_Modules".to_string(),
                    ".git/hooks".to_string(),
                    "../outside".to_string(),
                ]),
            }),
            &mut issues,
        );

        assert_eq!(dependencies.paths, vec!["node_modules"]);
        assert_eq!(issues.len(), 3);
    }
}
