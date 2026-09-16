use std::collections::{HashMap, HashSet};

use crate::conformance::MANIFEST_PATH;
use crate::manifest_schema::ManifestFacet;
use crate::model::{Facet, FacetSource};

pub(super) fn build_facets(
    declarations: Vec<ManifestFacet>,
    section: &str,
    issues: &mut Vec<String>,
) -> Vec<Facet> {
    let mut seen = HashSet::new();
    declarations
        .into_iter()
        .filter_map(|declaration| {
            let id = declaration.id.trim().to_string();
            if id.is_empty() {
                issues.push(format!("A declaration in [[{section}]] is missing its id."));
                return None;
            }
            if !seen.insert(id.clone()) {
                issues.push(format!("Duplicate {section} id: {id}."));
                return None;
            }
            Some(configured_facet(
                &id,
                section,
                declaration.label.as_deref().unwrap_or(&id),
            ))
        })
        .collect()
}

pub(super) fn facets_by_key(facets: &[Facet]) -> HashMap<String, Facet> {
    facets
        .iter()
        .map(|facet| (facet.key.clone(), facet.clone()))
        .collect()
}

pub(super) fn configured_facet(id: &str, section: &str, label: &str) -> Facet {
    Facet {
        key: id.to_string(),
        label: if label.trim().is_empty() {
            humanize_id(id)
        } else {
            label.trim().to_string()
        },
        source: FacetSource::Configured,
        evidence: vec![format!("{MANIFEST_PATH}#{section}[{id}]")],
    }
}

fn humanize_id(value: &str) -> String {
    value
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
