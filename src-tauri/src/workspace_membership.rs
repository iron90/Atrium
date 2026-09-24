use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

pub(crate) fn ensure_project_in_workspace_roots(
    roots: &BTreeSet<PathBuf>,
    project_path: &Path,
) -> Result<(), String> {
    if roots.is_empty() {
        return Err("No workspace has been scanned in this session".to_string());
    }

    let canonical = project_path
        .canonicalize()
        .map_err(|error| format!("Cannot open project: {error}"))?;
    if !canonical.is_dir() {
        return Err("Project path is not a directory".to_string());
    }
    if roots.iter().any(|root| canonical.starts_with(root)) {
        return Ok(());
    }
    Err("Project path is outside the registered workspaces".to_string())
}

#[cfg(test)]
mod tests {
    use super::ensure_project_in_workspace_roots;
    use std::collections::BTreeSet;
    use std::fs;
    use std::path::PathBuf;

    fn fixture_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "atrium-workspace-membership-{name}-{}",
            std::process::id()
        ))
    }

    #[test]
    fn rejects_when_no_workspace_has_been_scanned() {
        let project = fixture_root("empty-roots");
        fs::create_dir_all(&project).expect("create project");

        let error = ensure_project_in_workspace_roots(&BTreeSet::new(), &project)
            .expect_err("empty roots must reject");

        assert_eq!(error, "No workspace has been scanned in this session");
        fs::remove_dir_all(project).expect("remove project");
    }

    #[test]
    fn accepts_projects_under_a_registered_root() {
        let workspace = fixture_root("inside");
        let project = workspace.join("demo");
        fs::create_dir_all(&project).expect("create project");
        let mut roots = BTreeSet::new();
        roots.insert(workspace.canonicalize().expect("canonical workspace"));

        assert!(ensure_project_in_workspace_roots(&roots, &project).is_ok());

        fs::remove_dir_all(workspace).expect("remove workspace");
    }

    #[test]
    fn rejects_projects_outside_registered_workspaces() {
        let workspace = fixture_root("outside-workspace");
        let outside = fixture_root("outside-project");
        fs::create_dir_all(&workspace).expect("create workspace");
        fs::create_dir_all(&outside).expect("create outside project");
        let mut roots = BTreeSet::new();
        roots.insert(workspace.canonicalize().expect("canonical workspace"));

        let error = ensure_project_in_workspace_roots(&roots, &outside)
            .expect_err("outside project must reject");

        assert_eq!(error, "Project path is outside the registered workspaces");

        fs::remove_dir_all(workspace).expect("remove workspace");
        fs::remove_dir_all(outside).expect("remove outside");
    }

    #[test]
    fn does_not_treat_sibling_prefixes_as_members() {
        let workspace = fixture_root("prefix-workspace");
        let sibling = fixture_root("prefix-workspace-other");
        fs::create_dir_all(&workspace).expect("create workspace");
        fs::create_dir_all(&sibling).expect("create sibling");
        let mut roots = BTreeSet::new();
        roots.insert(workspace.canonicalize().expect("canonical workspace"));

        assert!(
            ensure_project_in_workspace_roots(&roots, &sibling).is_err(),
            "prefix siblings must not match"
        );

        fs::remove_dir_all(workspace).expect("remove workspace");
        fs::remove_dir_all(sibling).expect("remove sibling");
    }
}
