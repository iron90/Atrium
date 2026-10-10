use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use url::Url;

use crate::model::{CommandKind, HostOs, ProjectConfigurationStatus, ProjectSnapshot};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);

pub(crate) fn resolve_web_service_url(
    project: &ProjectSnapshot,
    profile_id: &str,
) -> Result<String, String> {
    if project.configuration.status != ProjectConfigurationStatus::Configured {
        return Err("Project configuration is not valid for profile execution".to_string());
    }
    let profile = project
        .build_profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "Build profile is not declared in the scanned project".to_string())?;
    if !profile.issues.is_empty() {
        return Err(format!(
            "Build profile {} is invalid: {}",
            profile.id,
            profile.issues.join(" ")
        ));
    }
    if profile.platform.key != "web" {
        return Err(format!(
            "Build profile {} is not a web profile.",
            profile.id
        ));
    }
    let Some(url) = profile.service_url.clone() else {
        return Err(format!(
            "Build profile {} has no web service URL.",
            profile.id
        ));
    };
    let action = CommandKind::Run;
    if !profile.action_supported_on_current_host(&action) {
        let allowed_hosts = profile
            .host_requirements_for_action(&action)
            .map(|hosts| {
                hosts
                    .iter()
                    .map(|host| host.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "an unknown host".to_string());
        let current_host = HostOs::current()
            .map(HostOs::as_str)
            .unwrap_or(std::env::consts::OS);
        return Err(format!(
            "Build profile {} action run is unavailable on the current host ({current_host}); required hosts: {allowed_hosts}.",
            profile.id
        ));
    }
    let binding = profile.action_binding_key(&action);
    let verified_equivalently = project.build_profiles.iter().any(|candidate| {
        candidate.action_binding_key(&action) == binding
            && candidate.action_verified_on_current_host(&action)
    });
    if !profile.action_verified_on_current_host(&action) && !verified_equivalently {
        let verified_hosts = profile
            .verification
            .for_action(&action)
            .map(|hosts| {
                hosts
                    .iter()
                    .map(|host| host.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "none".to_string());
        let current_host = HostOs::current()
            .map(HostOs::as_str)
            .unwrap_or(std::env::consts::OS);
        return Err(format!(
            "Build profile {} action run has not been verified on the current host ({current_host}); verified hosts: {verified_hosts}.",
            profile.id
        ));
    }
    if let Some(blocked) = profile
        .blocked_actions
        .iter()
        .find(|blocked| blocked.action == action)
    {
        return Err(format!(
            "Build profile {} action run is blocked: {}",
            profile.id, blocked.reason
        ));
    }
    Ok(url)
}

pub(crate) fn ensure_service_accepting(url: &str) -> Result<(), String> {
    let parsed = Url::parse(url).map_err(|_| format!("Web service URL is not valid: {url}"))?;
    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| format!("Web service URL has no port: {url}"))?;
    let authority = match parsed.host() {
        Some(url::Host::Ipv6(address)) => format!("[{address}]:{port}"),
        Some(_) => {
            let host = parsed
                .host_str()
                .ok_or_else(|| format!("Web service URL has no host: {url}"))?;
            format!("{host}:{port}")
        }
        None => return Err(format!("Web service URL has no host: {url}")),
    };
    let addresses = authority
        .to_socket_addrs()
        .map_err(|error| format!("Web service at {url} could not be resolved: {error}"))?;
    let mut last_error = None;
    let mut attempted = false;
    for address in addresses {
        attempted = true;
        match TcpStream::connect_timeout(&address, CONNECT_TIMEOUT) {
            Ok(stream) => {
                drop(stream);
                return Ok(());
            }
            Err(error) => last_error = Some(error),
        }
    }
    if !attempted {
        return Err(format!("Web service at {url} could not be resolved."));
    }
    Err(format!(
        "Web service is not running at {url}: {}",
        last_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "connection failed".to_string())
    ))
}

#[cfg(test)]
mod tests {
    use super::{ensure_service_accepting, resolve_web_service_url};
    use crate::model::{
        BuildHostRequirements, BuildProfile, CleanupDeclaration, Facet, FacetSource,
        GuidanceStatus, HostOs, IconConformance, IconConformanceStatus, ProjectConfiguration,
        ProjectConfigurationStatus, ProjectSnapshot, ProjectTools, ProtocolStatus,
    };
    use std::net::TcpListener;

    fn facet(key: &str) -> Facet {
        Facet {
            key: key.to_string(),
            label: key.to_string(),
            source: FacetSource::Configured,
            evidence: vec![],
        }
    }

    fn profile(id: &str, service_url: Option<&str>, verified: bool) -> BuildProfile {
        let current = HostOs::current().expect("supported host");
        BuildProfile {
            id: id.to_string(),
            label: id.to_string(),
            platform: facet("web"),
            channel: facet("direct"),
            check_command_id: None,
            build_command_id: None,
            run_command_id: None,
            service_url: service_url.map(str::to_string),
            host_requirements: BuildHostRequirements::default(),
            verification: BuildHostRequirements {
                run: verified.then(|| vec![current]),
                check: None,
                build: None,
            },
            host_mismatch_actions: vec![],
            unverified_actions: vec![],
            verification_blockers: vec![],
            blocked_actions: vec![],
            source: ".atrium/manifest.toml".to_string(),
            region: None,
            payment: None,
            artifacts: vec![],
            issues: vec![],
        }
    }

    fn project(profiles: Vec<BuildProfile>) -> ProjectSnapshot {
        ProjectSnapshot {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            path: "/tmp/demo".to_string(),
            modified_at: None,
            description: None,
            icon: None,
            icon_conformance: IconConformance {
                status: IconConformanceStatus::Missing,
                manifest_path: String::new(),
                declared_icon: None,
                resolved_icon: None,
            },
            protocol: ProtocolStatus {
                manifest_path: String::new(),
                schema: Some(2),
                needs_update: false,
                manifest_status: ProjectConfigurationStatus::Configured,
                capabilities: vec![],
            },
            guidance: GuidanceStatus {
                revision: None,
                needs_update: false,
                needs_sync: false,
            },
            repo: None,
            tools: ProjectTools::default(),
            platforms: vec![],
            channels: vec![],
            build_profiles: profiles,
            configuration: ProjectConfiguration {
                status: ProjectConfigurationStatus::Configured,
                manifest_path: ".atrium/manifest.toml".to_string(),
                issues: vec![],
            },
            commands: vec![],
            cleanup: CleanupDeclaration::default(),
            storage: None,
            artifacts: None,
            scanned_at: 0,
        }
    }

    #[test]
    fn resolves_a_verified_web_service_url() {
        let project = project(vec![profile(
            "web-direct",
            Some("http://127.0.0.1:3000"),
            true,
        )]);
        assert_eq!(
            resolve_web_service_url(&project, "web-direct").expect("service url"),
            "http://127.0.0.1:3000"
        );
    }

    #[test]
    fn rejects_an_unverified_web_service() {
        let project = project(vec![profile(
            "web-direct",
            Some("http://127.0.0.1:3000"),
            false,
        )]);
        let error = resolve_web_service_url(&project, "web-direct").expect_err("unverified");
        assert!(error.contains("has not been verified"), "{error}");
    }

    #[test]
    fn inherits_verification_for_the_same_service_url() {
        let project = project(vec![
            profile("web-one", Some("http://127.0.0.1:3000"), true),
            profile("web-two", Some("http://127.0.0.1:3000"), false),
        ]);
        assert!(resolve_web_service_url(&project, "web-two").is_ok());
    }

    #[test]
    fn accepts_a_listening_local_service_and_rejects_a_closed_port() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        ensure_service_accepting(&format!("http://127.0.0.1:{port}")).expect("listening");
        drop(listener);
        assert!(ensure_service_accepting("http://127.0.0.1:1").is_err());
    }
}
