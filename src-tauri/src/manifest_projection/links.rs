use std::collections::HashSet;

use crate::manifest_schema::{ManifestLink, ManifestTools};
use crate::model::{ProjectLink, ProjectTools};
use crate::url_policy::validate_browsable_url;

pub(super) fn parse_tools(declaration: Option<ManifestTools>) -> ProjectTools {
    let Some(declaration) = declaration else {
        return ProjectTools::default();
    };
    ProjectTools {
        terminal: normalize_optional_command(declaration.terminal),
    }
}

fn normalize_optional_command(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn parse_links(
    declarations: Vec<ManifestLink>,
    issues: &mut Vec<String>,
) -> Vec<ProjectLink> {
    let mut seen = HashSet::new();
    declarations
        .into_iter()
        .filter_map(|declaration| {
            let id = declaration.id.trim().to_string();
            let url = declaration.url.trim().to_string();
            if id.is_empty() || url.is_empty() {
                issues.push("A project link must declare a non-empty id and url.".to_string());
                return None;
            }
            if !seen.insert(id.clone()) {
                issues.push(format!("Duplicate project link id: {id}."));
                return None;
            }
            if let Err(error) = validate_browsable_url(&url) {
                issues.push(format!("Project link {id} {error}."));
                return None;
            }
            Some(ProjectLink {
                id,
                label: declaration
                    .label
                    .filter(|label| !label.trim().is_empty())
                    .unwrap_or_else(|| "Link".to_string()),
                url,
                kind: declaration.kind,
            })
        })
        .collect()
}
