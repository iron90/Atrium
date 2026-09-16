use std::collections::HashSet;

use crate::manifest_schema::ManifestCleanup;
use crate::model::CleanupDeclaration;

use super::path_policy::normalize_declared_path;

pub(super) fn parse_cleanup(
    declaration: Option<ManifestCleanup>,
    issues: &mut Vec<String>,
) -> CleanupDeclaration {
    let Some(declaration) = declaration else {
        return CleanupDeclaration::default();
    };

    let mut seen = HashSet::new();
    let mut declared_paths = Vec::new();
    let cache = parse_cleanup_paths(
        declaration.cache.unwrap_or_default(),
        "cache",
        &mut seen,
        &mut declared_paths,
        issues,
    );
    let build = parse_cleanup_paths(
        declaration.build.unwrap_or_default(),
        "build",
        &mut seen,
        &mut declared_paths,
        issues,
    );

    CleanupDeclaration { cache, build }
}

fn parse_cleanup_paths(
    paths: Vec<String>,
    category: &str,
    seen: &mut HashSet<String>,
    declared_paths: &mut Vec<String>,
    issues: &mut Vec<String>,
) -> Vec<String> {
    paths
        .into_iter()
        .filter_map(|raw| {
            let Some(normalized) =
                normalize_declared_path(&raw, &[".git", ".atrium", "node_modules", "vendor"])
            else {
                issues.push(format!(
                    "Cleanup {category} path must be a relative, non-protected directory: {raw}."
                ));
                return None;
            };
            if !seen.insert(path_comparison_key(&normalized)) {
                issues.push(format!("Duplicate cleanup directory: {normalized}."));
                return None;
            }
            if let Some(existing) = declared_paths
                .iter()
                .find(|existing| is_nested_path(existing, &normalized))
                .cloned()
            {
                seen.remove(&normalized);
                issues.push(format!(
                    "Cleanup directory {normalized} is nested under {existing}; declare only one of them."
                ));
                return None;
            }
            if let Some(existing) = declared_paths
                .iter()
                .find(|existing| is_nested_path(&normalized, existing))
                .cloned()
            {
                seen.remove(&normalized);
                issues.push(format!(
                    "Cleanup directory {normalized} contains nested declaration {existing}; declare only one of them."
                ));
                return None;
            }
            declared_paths.push(normalized.clone());
            Some(normalized)
        })
        .collect()
}

fn is_nested_path(parent: &str, candidate: &str) -> bool {
    let parent = path_comparison_key(parent);
    let candidate = path_comparison_key(candidate);
    candidate.starts_with(&format!("{parent}/"))
}

fn path_comparison_key(path: &str) -> String {
    path.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::parse_cleanup;
    use crate::manifest_schema::ManifestCleanup;

    #[test]
    fn rejects_nested_cleanup_directories_in_either_order() {
        for paths in [
            vec!["dist".to_string(), "dist/cache".to_string()],
            vec!["dist/cache".to_string(), "dist".to_string()],
        ] {
            let mut issues = Vec::new();
            let cleanup = parse_cleanup(
                Some(ManifestCleanup {
                    cache: Some(paths),
                    build: None,
                }),
                &mut issues,
            );

            assert_eq!(cleanup.cache.len(), 1);
            assert_eq!(issues.len(), 1);
            assert!(issues[0].contains("declare only one of them"));
        }
    }

    #[test]
    fn rejects_nested_cleanup_directories_across_categories() {
        let mut issues = Vec::new();
        let cleanup = parse_cleanup(
            Some(ManifestCleanup {
                cache: Some(vec!["dist".to_string()]),
                build: Some(vec!["dist/releases".to_string()]),
            }),
            &mut issues,
        );

        assert_eq!(cleanup.cache, vec!["dist"]);
        assert!(cleanup.build.is_empty());
        assert_eq!(issues.len(), 1);
    }

    #[test]
    fn treats_case_variants_as_the_same_portable_path() {
        let mut issues = Vec::new();
        let cleanup = parse_cleanup(
            Some(ManifestCleanup {
                cache: Some(vec!["Dist".to_string(), "dist/cache".to_string()]),
                build: Some(vec!["DIST".to_string()]),
            }),
            &mut issues,
        );

        assert_eq!(cleanup.cache, vec!["Dist"]);
        assert!(cleanup.build.is_empty());
        assert_eq!(issues.len(), 2);
        assert!(issues.iter().any(|issue| issue.contains("nested under")));
        assert!(issues
            .iter()
            .any(|issue| issue.contains("Duplicate cleanup directory")));
    }
}
