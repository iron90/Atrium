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
    let cache = parse_cleanup_paths(
        declaration.cache.unwrap_or_default(),
        "cache",
        &mut seen,
        issues,
    );
    let build = parse_cleanup_paths(
        declaration.build.unwrap_or_default(),
        "build",
        &mut seen,
        issues,
    );

    CleanupDeclaration { cache, build }
}

fn parse_cleanup_paths(
    paths: Vec<String>,
    category: &str,
    seen: &mut HashSet<String>,
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
            if !seen.insert(normalized.clone()) {
                issues.push(format!("Duplicate cleanup directory: {normalized}."));
                return None;
            }
            Some(normalized)
        })
        .collect()
}
