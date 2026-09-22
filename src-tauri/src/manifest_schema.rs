use serde::Deserialize;

pub(crate) const CURRENT_SCHEMA: u32 = 3;
pub(crate) const LEGACY_SCHEMA: u32 = 1;

pub(crate) fn is_supported_schema(schema: u32) -> bool {
    (LEGACY_SCHEMA..=CURRENT_SCHEMA).contains(&schema)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestDocument {
    pub(crate) schema: u32,
    pub(crate) profile: Option<String>,
    pub(crate) identity: Option<ManifestIdentity>,
    pub(crate) platforms: Option<Vec<ManifestFacet>>,
    pub(crate) channels: Option<Vec<ManifestFacet>>,
    pub(crate) build_profiles: Option<Vec<ManifestBuildProfile>>,
    pub(crate) cleanup: Option<ManifestCleanup>,
    pub(crate) tools: Option<ManifestTools>,
    pub(crate) links: Option<Vec<ManifestLink>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestIdentity {
    pub(crate) icon: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestFacet {
    pub(crate) id: String,
    pub(crate) label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestBuildProfile {
    pub(crate) id: String,
    pub(crate) label: Option<String>,
    pub(crate) platform: String,
    pub(crate) channel: String,
    pub(crate) commands: Option<ManifestCommands>,
    pub(crate) host_requirements: Option<ManifestHostRequirements>,
    pub(crate) verification: Option<ManifestHostRequirements>,
    pub(crate) region: Option<String>,
    pub(crate) payment: Option<String>,
    pub(crate) artifacts: Option<Vec<String>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestCommands {
    pub(crate) run: Option<String>,
    pub(crate) check: Option<String>,
    pub(crate) build: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestHostRequirements {
    pub(crate) run: Option<Vec<String>>,
    pub(crate) check: Option<Vec<String>>,
    pub(crate) build: Option<Vec<String>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestCleanup {
    pub(crate) cache: Option<Vec<String>>,
    pub(crate) build: Option<Vec<String>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestTools {
    pub(crate) terminal: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestLink {
    pub(crate) id: String,
    pub(crate) label: Option<String>,
    pub(crate) url: String,
    pub(crate) kind: Option<String>,
}

pub(crate) fn parse(raw: &str) -> Result<ManifestDocument, toml::de::Error> {
    toml::from_str(raw)
}
