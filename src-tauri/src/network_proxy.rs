//! Routes every captured child process through the user's network proxy.
//!
//! A desktop project routinely pulls prebuilt runtimes and dependency
//! archives from the network during `check`, `build`, and `run`. Whether that
//! traffic can leave the machine is a property of the host, not of the
//! project, so Atrium resolves it once in Settings and passes the result
//! down as ordinary environment variables instead of asking every project to
//! hard-code a mirror or a retry loop.
//!
//! The settings live in Atrium's own data directory and never enter a project
//! manifest: a proxy belongs to the host environment, and a manifest records
//! project facts.
//!
//! Injection happens in `captured_process::captured_command`, so one call site
//! covers project commands and the Git reads Atrium performs itself. Launches
//! the user asked to see — a terminal, Explorer, the browser — stay on
//! `Command::new` and are deliberately left alone.

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{OnceLock, RwLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use url::Url;

/// Local services must never be routed through the proxy. The protocol makes
/// local ports a first-class concern, and a blanket `ALL_PROXY` would break
/// every check that talks to a development server on the same machine.
const DEFAULT_NO_PROXY: &str = "localhost,127.0.0.1,::1";

/// Variables written for a configured proxy. Tools disagree on case: `git`
/// reads the lowercase `http_proxy`, while much of the npm/cargo ecosystem
/// only consults the uppercase name, so both forms are always written.
const PROXY_VARIABLES: [&str; 6] = [
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
];

const BYPASS_VARIABLES: [&str; 2] = ["NO_PROXY", "no_proxy"];

const SETTINGS_FILE: &str = "network-proxy.json";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NetworkProxySettings {
    /// One address covers both schemes: an `http://` value such as
    /// `http://127.0.0.1:7890` is what a mixed local proxy exposes, and a
    /// `socks5://` value reaches the same tools through `ALL_PROXY`.
    pub proxy: Option<String>,
    /// Overrides [`DEFAULT_NO_PROXY`] when the user needs a wider or narrower
    /// bypass list.
    pub no_proxy: Option<String>,
}

impl NetworkProxySettings {
    fn normalized(&self) -> Result<Self, String> {
        Ok(Self {
            proxy: normalize_proxy(self.proxy.as_deref())?,
            no_proxy: normalize_no_proxy(self.no_proxy.as_deref())?,
        })
    }
}

fn normalize_proxy(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = non_empty(value) else {
        return Ok(None);
    };
    // Credentials are legitimate on a corporate proxy, so the value is kept
    // as typed; no error below may echo it back, because that message reaches
    // the UI, the console, and a screenshot.
    if trimmed
        .chars()
        .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(
            "A proxy address must not contain whitespace or control characters".to_string(),
        );
    }
    let url = Url::parse(trimmed)
        .map_err(|_| "A proxy address must be a valid absolute URL".to_string())?;
    if !matches!(
        url.scheme(),
        "http" | "https" | "socks5" | "socks5h" | "socks4"
    ) {
        return Err(
            "A proxy address must use http://, https://, socks5://, socks5h://, or socks4://"
                .to_string(),
        );
    }
    if url.host_str().is_none() {
        return Err("A proxy address must include a host name or IP address".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

fn normalize_no_proxy(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(trimmed) = non_empty(value) else {
        return Ok(None);
    };
    if trimmed.chars().any(|character| character.is_control()) {
        return Err("The bypass list must not contain control characters".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|trimmed| !trimmed.is_empty())
}

/// Process-wide so `captured_command` can stay a free function, mirroring how
/// the login-shell PATH is resolved once per session.
fn settings_cell() -> &'static RwLock<NetworkProxySettings> {
    static CELL: OnceLock<RwLock<NetworkProxySettings>> = OnceLock::new();
    CELL.get_or_init(|| RwLock::new(NetworkProxySettings::default()))
}

pub(crate) fn apply_to_command(command: &mut Command) {
    let Ok(settings) = settings_cell().read() else {
        return;
    };
    write_proxy_environment(command, &settings);
}

/// Kept separate from [`apply_to_command`] because the settings live in a
/// process-wide cell that parallel tests must not write to.
fn write_proxy_environment(command: &mut Command, settings: &NetworkProxySettings) {
    // Nothing configured: the child inherits Atrium's own environment, which
    // already carries anything the user's shell exported.
    let (Some(proxy), bypass) = (
        settings.proxy.as_deref(),
        resolve_bypass(settings.no_proxy.as_deref()),
    ) else {
        return;
    };
    for variable in PROXY_VARIABLES {
        command.env(variable, proxy);
    }
    if let Some(bypass) = bypass {
        for variable in BYPASS_VARIABLES {
            command.env(variable, bypass);
        }
    }
}

fn resolve_bypass(configured: Option<&str>) -> Option<&str> {
    Some(non_empty(configured).unwrap_or(DEFAULT_NO_PROXY))
}

pub fn load(app: &AppHandle) {
    let path = match settings_path(app) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Atrium could not resolve its data directory: {error}");
            return;
        }
    };
    let settings = match fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<NetworkProxySettings>(&raw)
            .ok()
            .and_then(|value| value.normalized().ok())
        {
            Some(settings) => settings,
            None => {
                // A hand-edited or truncated file must not stop Atrium from
                // starting; an unusable proxy is simply ignored.
                eprintln!(
                    "Atrium ignored an unreadable network proxy file at {}",
                    path.display()
                );
                NetworkProxySettings::default()
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            NetworkProxySettings::default()
        }
        Err(error) => {
            eprintln!(
                "Atrium could not read the network proxy file {}: {error}",
                path.display()
            );
            NetworkProxySettings::default()
        }
    };
    if let Ok(mut cell) = settings_cell().write() {
        *cell = settings;
    }
}

fn current() -> NetworkProxySettings {
    settings_cell()
        .read()
        .map(|settings| settings.clone())
        .unwrap_or_default()
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve Atrium data directory: {error}"))?
        .join(SETTINGS_FILE))
}

#[tauri::command]
pub async fn read_network_proxy_command(app: AppHandle) -> Result<NetworkProxySettings, String> {
    // A file written by a previous session is the source of truth at startup,
    // but re-reading keeps a value edited outside the app from going stale.
    load(&app);
    Ok(current())
}

#[tauri::command]
pub async fn save_network_proxy_command(
    app: AppHandle,
    settings: NetworkProxySettings,
) -> Result<NetworkProxySettings, String> {
    let normalized = settings.normalized()?;
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create Atrium settings directory: {error}"))?;
    }
    let raw = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Cannot serialize the Atrium network proxy settings: {error}"))?;
    write_atomically(&path, &raw)?;
    if let Ok(mut cell) = settings_cell().write() {
        *cell = normalized.clone();
    }
    Ok(normalized)
}

fn write_atomically(path: &std::path::Path, content: &str) -> Result<(), String> {
    let temporary_path = path.with_extension(format!("json.tmp-{}", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        fs::write(&temporary_path, content)?;
        replace_file(&temporary_path, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result.map_err(|error| format!("Cannot save the Atrium network proxy settings: {error}"))
}

#[cfg(not(windows))]
fn replace_file(source: &std::path::Path, target: &std::path::Path) -> std::io::Result<()> {
    fs::rename(source, target)
}

#[cfg(windows)]
fn replace_file(source: &std::path::Path, target: &std::path::Path) -> std::io::Result<()> {
    // Windows will not rename onto an existing file.
    if target.exists() {
        fs::remove_file(target)?;
    }
    fs::rename(source, target)
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_no_proxy, normalize_proxy, resolve_bypass, write_proxy_environment,
        NetworkProxySettings, DEFAULT_NO_PROXY,
    };
    use std::process::Command;

    fn environment(settings: &NetworkProxySettings) -> Vec<(String, String)> {
        let mut command = Command::new("true");
        write_proxy_environment(&mut command, settings);
        command
            .get_envs()
            .filter_map(|(key, value)| {
                Some((
                    key.to_string_lossy().into_owned(),
                    value?.to_string_lossy().into_owned(),
                ))
            })
            .collect()
    }

    #[test]
    fn a_configured_proxy_reaches_a_child_in_both_cases() {
        let settings = NetworkProxySettings {
            proxy: Some("http://127.0.0.1:7890".to_string()),
            no_proxy: None,
        };

        let environment = environment(&settings);

        for variable in [
            "HTTP_PROXY",
            "http_proxy",
            "HTTPS_PROXY",
            "https_proxy",
            "ALL_PROXY",
            "all_proxy",
        ] {
            assert!(
                environment.contains(&(variable.to_string(), "http://127.0.0.1:7890".to_string())),
                "{variable} should carry the configured proxy"
            );
        }
    }

    #[test]
    fn local_addresses_stay_off_the_proxy() {
        let environment = environment(&NetworkProxySettings {
            proxy: Some("http://127.0.0.1:7890".to_string()),
            no_proxy: None,
        });

        assert!(environment.contains(&("NO_PROXY".to_string(), DEFAULT_NO_PROXY.to_string())));
        assert!(environment.contains(&("no_proxy".to_string(), DEFAULT_NO_PROXY.to_string())));
    }

    #[test]
    fn a_configured_bypass_list_replaces_the_default() {
        let environment = environment(&NetworkProxySettings {
            proxy: Some("http://127.0.0.1:7890".to_string()),
            no_proxy: Some("localhost,.internal.example.com".to_string()),
        });

        assert!(environment.contains(&(
            "NO_PROXY".to_string(),
            "localhost,.internal.example.com".to_string()
        )));
    }

    #[test]
    fn an_unconfigured_proxy_leaves_the_inherited_environment_alone() {
        assert!(environment(&NetworkProxySettings::default()).is_empty());
    }

    #[test]
    fn accepts_http_https_and_socks_proxy_addresses() {
        for value in [
            "http://127.0.0.1:7890",
            "https://proxy.example.com:8443",
            "socks5://127.0.0.1:1080",
            "socks5h://127.0.0.1:1080",
            "socks4://127.0.0.1:1080",
        ] {
            assert!(
                normalize_proxy(Some(value)).is_ok(),
                "{value} should be accepted"
            );
        }
    }

    #[test]
    fn treats_a_blank_address_as_unconfigured() {
        assert_eq!(
            normalize_proxy(Some("   ")).expect("blank is not an error"),
            None
        );
        assert_eq!(normalize_proxy(None).expect("absent is not an error"), None);
        assert_eq!(
            normalize_no_proxy(Some("")).expect("blank is not an error"),
            None
        );
    }

    #[test]
    fn rejects_addresses_that_are_not_absolute_proxy_urls() {
        for value in [
            "127.0.0.1:7890",
            "ftp://127.0.0.1:2121",
            "http://",
            "http://127.0.0.1:7890 extra",
        ] {
            assert!(
                normalize_proxy(Some(value)).is_err(),
                "{value} should be rejected"
            );
        }
    }

    #[test]
    fn trims_a_pasted_value_but_rejects_an_embedded_control_character() {
        assert_eq!(
            normalize_no_proxy(Some("localhost\n")).expect("a pasted newline is trimmed"),
            Some("localhost".to_string())
        );
        assert!(normalize_no_proxy(Some("local\nhost")).is_err());
    }

    #[test]
    fn local_addresses_are_bypassed_by_default() {
        assert_eq!(resolve_bypass(None), Some(DEFAULT_NO_PROXY));
        assert_eq!(resolve_bypass(Some("  ")), Some(DEFAULT_NO_PROXY));
        assert_eq!(resolve_bypass(Some(".example.com")), Some(".example.com"));
    }

    #[test]
    fn normalization_keeps_credentials_but_echoes_them_in_no_message() {
        let settings = NetworkProxySettings {
            proxy: Some(" http://user:secret@127.0.0.1:7890 ".to_string()),
            no_proxy: None,
        };
        let normalized = settings.normalized().expect("credentials are allowed");

        assert_eq!(
            normalized.proxy.as_deref(),
            Some("http://user:secret@127.0.0.1:7890")
        );
        let rejected = NetworkProxySettings {
            proxy: Some("user:secret@127.0.0.1:not a url".to_string()),
            no_proxy: None,
        }
        .normalized()
        .expect_err("an unparsable address is rejected");
        assert!(!rejected.contains("secret"));
        assert!(!rejected.contains("user"));
    }

    #[test]
    fn settings_round_trip_through_the_frontend_shape() {
        let raw = r#"{"proxy":"http://127.0.0.1:7890"}"#;

        let settings: NetworkProxySettings =
            serde_json::from_str(raw).expect("camelCase fields decode");

        assert_eq!(settings.proxy.as_deref(), Some("http://127.0.0.1:7890"));
        assert_eq!(settings.no_proxy, None);
        assert!(settings.normalized().is_ok());
    }
}
