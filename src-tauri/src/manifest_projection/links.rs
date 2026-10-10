use crate::manifest_schema::ManifestTools;
use crate::model::ProjectTools;

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
