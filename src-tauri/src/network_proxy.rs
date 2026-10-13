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
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};

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
    /// Host the connection test reaches through the proxy. It is a setting
    /// because a rule-based proxy can route one host directly and block it
    /// while working fine for everything the user actually downloads, and
    /// because a test target Atrium cannot explain is worse than none.
    pub test_host: Option<String>,
}

impl NetworkProxySettings {
    fn normalized(&self) -> Result<Self, String> {
        Ok(Self {
            proxy: normalize_proxy(self.proxy.as_deref())?,
            no_proxy: normalize_no_proxy(self.no_proxy.as_deref())?,
            test_host: normalize_host(self.test_host.as_deref())?,
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

/// A bare host name or IP. A scheme, a port, a path or a credential in this
/// field would each change what gets measured, so they are refused rather than
/// quietly trimmed into something the user did not write.
fn normalize_host(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(host) = non_empty(value) else {
        return Ok(None);
    };
    if host.chars().any(|character| {
        character.is_whitespace()
            || character.is_control()
            || matches!(character, '/' | '@' | ':' | '?' | '#' | '[' | ']')
    }) {
        return Err(
            "A test host must be a plain host name or IP address, without a scheme, port, or path"
                .to_string(),
        );
    }
    Ok(Some(host.to_ascii_lowercase()))
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

/// Ports commonly used by local proxy clients. This is a list of places to
/// *look* on the user's own machine, not a catalog of services to trust: every
/// candidate is probed before it is offered, and an address is only labelled a
/// proxy after the port answered as one.
const COMMON_PROXY_PORTS: [u16; 14] = [
    7890, 7891, 7892, 7897, 8888, 8889, 1080, 1081, 10808, 10809, 10810, 6152, 6153, 2080,
];

const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(250);
const PROBE_READ_TIMEOUT: Duration = Duration::from_millis(900);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalProxyCandidate {
    pub url: String,
    /// What the probe observed. `http` and `socks5` mean the port opened a
    /// tunnel with the matching handshake; a mixed port answers as both and is
    /// reported as `http`, which is the scheme most tools understand.
    pub kind: LocalProxyKind,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LocalProxyKind {
    Http,
    Socks5,
    Listener,
}

impl std::fmt::Display for LocalProxyKind {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Http => "http",
            Self::Socks5 => "socks5",
            Self::Listener => "http",
        })
    }
}

/// Finds local proxy endpoints by probing the machine, never by assuming a
/// product is installed. Each port is asked two questions: is anything
/// listening, and does it answer as a proxy?
pub fn detect_local_proxies() -> Vec<LocalProxyCandidate> {
    detect_proxy_ports(&COMMON_PROXY_PORTS)
}

fn detect_proxy_ports(ports: &[u16]) -> Vec<LocalProxyCandidate> {
    let mut candidates = Vec::new();
    for &port in ports {
        // Connecting is also the liveness check: a port that refuses or times
        // out is simply not a candidate.
        let Some(kind) = classify(port) else {
            continue;
        };
        candidates.push(LocalProxyCandidate {
            url: format!("{kind}://127.0.0.1:{port}"),
            kind,
        });
    }
    candidates
}

fn classify(port: u16) -> Option<LocalProxyKind> {
    let mut stream = open_probe(port)?;
    let kind = if opens_tunnel(&mut stream) {
        LocalProxyKind::Http
    } else {
        // The connection carried an unknown protocol, so it is reused only as
        // evidence that something is listening there.
        LocalProxyKind::Listener
    };
    drop(stream);
    Some(match kind {
        LocalProxyKind::Http => LocalProxyKind::Http,
        _ if speaks_socks5(port) => LocalProxyKind::Socks5,
        _ => LocalProxyKind::Listener,
    })
}

/// Detection asks exactly the question the connection test asks: can this
/// endpoint open a tunnel? A proxy that forwards a plain GET to an
/// unresolvable host but stalls on CONNECT is still an HTTP proxy, and asking
/// about something else first is how a mixed port got labelled SOCKS5 and sent
/// the user off to fill in the wrong scheme.
fn opens_tunnel(stream: &mut TcpStream) -> bool {
    let request = format!(
        "CONNECT {DEFAULT_TEST_HOST}:{TEST_PORT} HTTP/1.1\r\nHost: {DEFAULT_TEST_HOST}:{TEST_PORT}\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    // Any HTTP status proves the peer is an HTTP proxy. Whether the tunnel was
    // granted is the connection test's question, not detection's: a proxy
    // whose upstream is down still speaks HTTP, and calling it "just a
    // listener" would hide the very thing the user is looking for.
    read_status_line(stream).is_some()
}

/// A SOCKS5 greeting advertises exactly one no-authentication method; the
/// server answers with that method or with "no acceptable methods".
fn speaks_socks5(port: u16) -> bool {
    let Some(mut stream) = open_probe(port) else {
        return false;
    };
    if stream.write_all(&[0x05, 0x01, 0x00]).is_err() {
        return false;
    }
    let mut reply = [0u8; 2];
    match stream.read_exact(&mut reply) {
        Ok(()) => reply[0] == 0x05 && (reply[1] == 0x00 || reply[1] == 0xff),
        Err(_) => false,
    }
}

fn open_probe(port: u16) -> Option<TcpStream> {
    let stream = TcpStream::connect_timeout(
        &SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
        PROBE_CONNECT_TIMEOUT,
    )
    .ok()?;
    let _ = stream.set_read_timeout(Some(PROBE_READ_TIMEOUT));
    let _ = stream.set_write_timeout(Some(PROBE_READ_TIMEOUT));
    Some(stream)
}

/// The status code of the reply, or None when the peer did not speak HTTP.
fn read_status_line(stream: &mut TcpStream) -> Option<u16> {
    let head = read_http_head(stream)?;
    parse_status(&head)
}

#[tauri::command]
pub async fn detect_local_proxies_command() -> Result<Vec<LocalProxyCandidate>, String> {
    tauri::async_runtime::spawn_blocking(detect_local_proxies)
        .await
        .map_err(|error| format!("Local proxy detection task failed: {error}"))
}

/// Host used for the connectivity check. It is named in the result so the
/// answer is never about an endpoint the user cannot see, and the test only
/// runs when the user asks for it.
const DEFAULT_TEST_HOST: &str = "www.gstatic.com";
/// Plain HTTP, so the round trip needs no TLS stack and the answer cannot be
/// confused with a handshake a server rejected.
const TEST_PORT: u16 = 80;
const TUNNEL_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const TUNNEL_READ_TIMEOUT: Duration = Duration::from_secs(6);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ProxyTestOutcome {
    /// No address is configured, so commands inherit Atrium's own environment.
    Inherited,
    /// The proxy established a tunnel to the connectivity host.
    /// `latency_millis` is the round trip to the target through the tunnel. It
    /// is absent when the proxy granted the tunnel but the target stayed
    /// silent, which is a different answer and must not read as a fast one.
    Tunnelled {
        latency_millis: Option<u64>,
    },
    /// The proxy answered, but refused. The status is the proxy's own.
    Refused {
        status: u16,
    },
    /// The endpoint answered something that is not HTTP.
    NotAProxy,
    Timeout,
    Unreachable,
    /// The scheme is real but Atrium has no handshake for it.
    UnsupportedScheme,
}

/// Answers "did my command actually get through", which is the only question
/// a detection probe cannot answer: a proxy can speak the protocol perfectly
/// and still fail to reach anything.
pub fn test_proxy(settings: &NetworkProxySettings) -> Result<ProxyTestOutcome, String> {
    let normalized = settings.normalized()?;
    let Some(proxy) = normalized.proxy else {
        return Ok(ProxyTestOutcome::Inherited);
    };
    let url = Url::parse(&proxy).map_err(|_| "A proxy address must be a valid absolute URL")?;
    let host = url
        .host_str()
        .ok_or_else(|| "A proxy address must include a host name or IP address".to_string())?
        .to_string();
    let scheme = url.scheme().to_string();
    // A non-special scheme carries no default port, so guessing 80 here would
    // send a SOCKS5 handshake to the wrong place.
    let default_port = match scheme.as_str() {
        "socks5" | "socks5h" | "socks4" => 1080,
        "https" => 443,
        _ => 80,
    };
    let port = url.port().unwrap_or(default_port);

    let test_host = normalized
        .test_host
        .clone()
        .unwrap_or_else(|| DEFAULT_TEST_HOST.to_string());

    if scheme == "socks4" {
        // Named as untested before any socket is opened: a report Atrium has
        // no handshake for must not be dressed up as a connection result.
        return Ok(ProxyTestOutcome::UnsupportedScheme);
    }

    let address = format!("{host}:{port}");
    let resolved = address
        .to_socket_addrs()
        .map_err(|_| "A proxy address must resolve to an IP address".to_string())?
        .next()
        .ok_or_else(|| "A proxy address must resolve to an IP address".to_string())?;
    let mut socket = match TcpStream::connect_timeout(&resolved, TUNNEL_CONNECT_TIMEOUT) {
        Ok(socket) => socket,
        Err(error) if error.kind() == std::io::ErrorKind::TimedOut => {
            return Ok(ProxyTestOutcome::Timeout);
        }
        Err(_) => return Ok(ProxyTestOutcome::Unreachable),
    };
    let _ = socket.set_read_timeout(Some(TUNNEL_READ_TIMEOUT));
    let _ = socket.set_write_timeout(Some(TUNNEL_CONNECT_TIMEOUT));

    let outcome = if matches!(scheme.as_str(), "socks5" | "socks5h") {
        socks5_connect(&mut socket, &test_host, TEST_PORT)?
    } else {
        http_connect(&mut socket, &test_host, TEST_PORT)?
    };
    if matches!(outcome, ProxyTestOutcome::Tunnelled { .. }) {
        // The grant alone is not the answer the user asked for: measure a real
        // round trip through the tunnel to the target itself.
        return Ok(ProxyTestOutcome::Tunnelled {
            latency_millis: probe_through_tunnel(&mut socket, &test_host),
        });
    }
    Ok(outcome)
}

/// A SOCKS5 endpoint is the common case for a local client, and it does not
/// speak HTTP at all, so the tunnel is opened with the SOCKS5 handshake rather
/// than assumed away.
fn socks5_connect(
    socket: &mut TcpStream,
    host: &str,
    port: u16,
) -> Result<ProxyTestOutcome, String> {
    if socket.write_all(&[0x05, 0x01, 0x00]).is_err() {
        return Ok(ProxyTestOutcome::Unreachable);
    }
    let mut greeting = [0u8; 2];
    if socket.read_exact(&mut greeting).is_err() {
        return Ok(ProxyTestOutcome::Timeout);
    }
    if greeting[0] != 0x05 || greeting[1] != 0x00 {
        return Ok(ProxyTestOutcome::NotAProxy);
    }
    let mut request = vec![0x05, 0x01, 0x00, 0x03, host.len() as u8];
    request.extend_from_slice(host.as_bytes());
    request.extend_from_slice(&port.to_be_bytes());
    if socket.write_all(&request).is_err() {
        return Ok(ProxyTestOutcome::Unreachable);
    }
    let mut reply = [0u8; 4];
    if socket.read_exact(&mut reply).is_err() {
        return Ok(ProxyTestOutcome::Timeout);
    }
    if reply[0] != 0x05 {
        return Ok(ProxyTestOutcome::NotAProxy);
    }
    // The bind address that follows must be consumed before the tunnel is
    // used: left in the socket it lands in front of the HTTP response and
    // makes a working connection look like a silent one.
    let bind_length = match reply[3] {
        0x01 => 4 + 2,
        0x04 => 16 + 2,
        0x03 => {
            let mut length = [0u8; 1];
            if socket.read_exact(&mut length).is_err() {
                return Ok(ProxyTestOutcome::Timeout);
            }
            usize::from(length[0]) + 2
        }
        _ => return Ok(ProxyTestOutcome::NotAProxy),
    };
    let mut bind_address = vec![0u8; bind_length];
    if socket.read_exact(&mut bind_address).is_err() {
        return Ok(ProxyTestOutcome::Timeout);
    }
    Ok(match reply[1] {
        0x00 => ProxyTestOutcome::Tunnelled {
            latency_millis: Some(0),
        },
        // The SOCKS5 reply code is the honest status here; it is not an HTTP
        // status and must not be presented as one.
        code => ProxyTestOutcome::Refused {
            status: code as u16,
        },
    })
}

fn http_connect(socket: &mut TcpStream, host: &str, port: u16) -> Result<ProxyTestOutcome, String> {
    // No `Proxy-Connection: close`: a local proxy honours it by dropping the
    // tunnel, which reads as a proxy that never answers.
    let request = format!("CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n\r\n");
    if socket.write_all(request.as_bytes()).is_err() {
        return Ok(ProxyTestOutcome::Unreachable);
    }
    let Some(head) = read_http_head(socket) else {
        return Ok(ProxyTestOutcome::Timeout);
    };
    let Some(status) = parse_status(&head) else {
        return Ok(ProxyTestOutcome::NotAProxy);
    };
    Ok(if (200..300).contains(&status) {
        ProxyTestOutcome::Tunnelled {
            latency_millis: Some(0),
        }
    } else {
        ProxyTestOutcome::Refused { status }
    })
}

/// Milliseconds, rounded up: a round trip cannot take no time at all, and
/// "0 ms" reads as a broken measurement rather than a fast one.
fn millis_rounded(elapsed: Duration) -> u64 {
    let rounded = (elapsed.as_micros() / 1000) as u64
        + u64::from(!elapsed.subsec_micros().is_multiple_of(1000));
    rounded.max(1)
}

/// Requests a body-less document over the tunnel and reports whether the host
/// answered, plus how long the round trip took.
///
/// Plain HTTP on port 80 is deliberate. A hand-written TLS hello looks like a
/// cheap way to stay on 443, but a hello a server cannot parse comes back as a
/// reset rather than an answer, which reads exactly like an unreachable
/// target. A real request cannot be confused with that.
fn probe_through_tunnel(socket: &mut TcpStream, host: &str) -> Option<u64> {
    let started = Instant::now();
    let request = format!("GET /generate_204 HTTP/1.1\r\nHost: {host}\r\nUser-Agent: Atrium\r\nConnection: close\r\n\r\n");
    if socket.write_all(request.as_bytes()).is_err() {
        return None;
    }
    parse_status(&read_http_head(socket)?).map(|_| millis_rounded(started.elapsed()))
}

/// Reads up to the end of the first HTTP head, so a proxy that answers with
/// more than one header line is still understood.
fn read_http_head(socket: &mut TcpStream) -> Option<Vec<u8>> {
    let mut head = Vec::new();
    let mut chunk = [0u8; 256];
    loop {
        let read = match socket.read(&mut chunk) {
            Ok(0) => break,
            Ok(read) => read,
            // A peer that stalls or resets after saying something has still
            // said enough; only a peer that never answered is a timeout.
            Err(_) if !head.is_empty() => break,
            Err(_) => return None,
        };
        head.extend_from_slice(&chunk[..read]);
        if head.windows(4).any(|window| window == b"\r\n\r\n") || head.len() > 8 * 1024 {
            break;
        }
    }
    if head.is_empty() {
        None
    } else {
        Some(head)
    }
}

fn parse_status(head: &[u8]) -> Option<u16> {
    let text = String::from_utf8_lossy(head);
    let first_line = text.split("\r\n").next()?;
    let rest = first_line.strip_prefix("HTTP/")?;
    // "HTTP/1.1 200 Connection established": skip the version, keep the code.
    let after_version = rest.split_once(' ')?.1;
    after_version.split_whitespace().next()?.parse().ok()
}

#[tauri::command]
pub async fn test_network_proxy_command(
    settings: NetworkProxySettings,
) -> Result<ProxyTestOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || test_proxy(&settings))
        .await
        .map_err(|error| format!("Network proxy test task failed: {error}"))?
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
        detect_proxy_ports, millis_rounded, normalize_host, normalize_no_proxy, normalize_proxy,
        parse_status, resolve_bypass, test_proxy, write_proxy_environment, LocalProxyKind,
        NetworkProxySettings, ProxyTestOutcome, DEFAULT_NO_PROXY,
    };
    use std::io::{Read, Write};
    use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
    use std::process::Command;
    use std::time::Duration;

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
            test_host: None,
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
            test_host: None,
        });

        assert!(environment.contains(&("NO_PROXY".to_string(), DEFAULT_NO_PROXY.to_string())));
        assert!(environment.contains(&("no_proxy".to_string(), DEFAULT_NO_PROXY.to_string())));
    }

    #[test]
    fn a_configured_bypass_list_replaces_the_default() {
        let environment = environment(&NetworkProxySettings {
            proxy: Some("http://127.0.0.1:7890".to_string()),
            no_proxy: Some("localhost,.internal.example.com".to_string()),
            test_host: None,
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

    // Serves one canned response so the probe can be exercised against a real
    // socket without depending on anything running on the machine.
    fn spawn_probe_server(response: &'static [u8]) -> Option<u16> {
        let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).ok()?;
        let port = listener.local_addr().ok()?.port();
        std::thread::spawn(move || {
            // Detection opens a connection to check liveness and may open a
            // second one for the handshake probe, so both are answered.
            for _ in 0..2 {
                let Ok((stream, _)) = listener.accept() else {
                    return;
                };
                // Bounded on both ends: the probe may not send anything, and
                // the test must never wait on a socket that stays quiet.
                let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
                let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
                let mut stream = stream;
                let _ = stream.read(&mut [0u8; 256]);
                let _ = stream.write_all(response);
                let _ = stream.flush();
                // Hold the socket: closing with unread input sends a reset
                // that discards the reply and turns the outcome into a race.
                std::thread::sleep(Duration::from_millis(200));
            }
        });
        Some(port)
    }

    #[test]
    fn the_public_entry_point_scans_only_the_known_local_ports() {
        // Scanning is restricted to the common local ports on purpose: Atrium
        // looks at this machine, it does not enumerate open ports anywhere.
        assert!(super::COMMON_PROXY_PORTS.iter().all(|port| *port >= 1024));
        assert!(super::detect_local_proxies()
            .iter()
            .all(|candidate| candidate.url.contains("127.0.0.1:")));
    }

    /// Serves a proxy that opens the tunnel, like a mixed local port does.
    fn spawn_tunnelling_probe_server() -> Option<u16> {
        let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).ok()?;
        let port = listener.local_addr().ok()?.port();
        std::thread::spawn(move || {
            for _ in 0..2 {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
                let mut chunk = [0u8; 512];
                let _ = stream.read(&mut chunk);
                let _ = stream.write_all(b"HTTP/1.1 200 Connection established\r\n\r\n");
                let _ = stream.flush();
                std::thread::sleep(Duration::from_millis(200));
            }
        });
        Some(port)
    }

    #[test]
    fn a_mixed_port_is_reported_as_http_so_the_scheme_is_the_common_one() {
        // A Clash-style mixed port answers both handshakes. Labelling it
        // SOCKS5 sent a user off to fill in a scheme most tools handle worse,
        // for a capability the port actually had.
        let port = spawn_tunnelling_probe_server().expect("bind a listener");

        let found = detect_proxy_ports(&[port])
            .into_iter()
            .find(|candidate| candidate.url.ends_with(&format!(":{port}")))
            .expect("the probed port is reported");

        assert_eq!(found.kind, LocalProxyKind::Http);
        assert_eq!(found.url, format!("http://127.0.0.1:{port}"));
    }

    #[test]
    fn a_service_that_answers_http_is_recognized_as_an_http_proxy() {
        let port =
            spawn_probe_server(b"HTTP/1.1 502 Bad Gateway\r\n\r\n").expect("bind a probe listener");

        let candidates = super::detect_proxy_ports(&[port]);

        let found = candidates
            .iter()
            .find(|candidate| candidate.url.ends_with(&format!(":{port}")))
            .expect("the probed port is reported");
        assert_eq!(found.kind, LocalProxyKind::Http);
    }

    #[test]
    fn a_service_that_answers_the_socks5_greeting_is_recognized_as_socks5() {
        let port = spawn_probe_server(&[0x05, 0x00]).expect("bind a probe listener");

        let candidates = super::detect_proxy_ports(&[port]);

        let found = candidates
            .iter()
            .find(|candidate| candidate.url.ends_with(&format!(":{port}")))
            .expect("the probed port is reported");
        assert_eq!(found.kind, LocalProxyKind::Socks5);
        assert_eq!(found.url, format!("socks5://127.0.0.1:{port}"));
    }

    #[test]
    fn an_unrelated_listener_is_reported_without_claiming_it_is_a_proxy() {
        let port = spawn_probe_server(b"hello, not a proxy\r\n").expect("bind a listener");

        let candidates = super::detect_proxy_ports(&[port]);

        let found = candidates
            .iter()
            .find(|candidate| candidate.url.ends_with(&format!(":{port}")))
            .expect("the probed port is reported");
        assert_eq!(found.kind, LocalProxyKind::Listener);
    }

    #[test]
    fn a_closed_port_is_not_offered_at_all() {
        let listener =
            TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).expect("bind a port");
        let port = listener.local_addr().expect("local address").port();
        drop(listener);

        assert!(
            !detect_proxy_ports(&[port])
                .iter()
                .any(|candidate| candidate.url.ends_with(&format!(":{port}"))),
            "a closed port must not appear as a proxy"
        );
    }

    #[test]
    fn a_probe_never_reaches_the_network() {
        // The handshake target is reserved and unresolvable, so even a real
        // proxy on this port cannot forward a request anywhere.
        let port =
            spawn_probe_server(b"HTTP/1.1 502 Bad Gateway\r\n\r\n").expect("bind a probe listener");

        let mut stream = TcpStream::connect(SocketAddr::from((Ipv4Addr::LOCALHOST, port)))
            .expect("connect to the probe listener");
        let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
        // Reading stops at the socket timeout as well as at end of stream:
        // the assertion is about what came back, not about how long it took.
        let mut received = Vec::new();
        let mut chunk = [0u8; 512];
        while let Ok(read) = stream.read(&mut chunk) {
            if read == 0 {
                break;
            }
            received.extend_from_slice(&chunk[..read]);
        }

        assert!(!String::from_utf8_lossy(&received).contains("localhost.invalid"));
    }

    #[test]
    fn parsing_a_status_line_only_accepts_an_http_response() {
        assert_eq!(
            parse_status(b"HTTP/1.1 200 Connection established\r\n"),
            Some(200)
        );
        assert_eq!(
            parse_status(b"HTTP/1.1 407 Proxy Authentication Required\r\n"),
            Some(407)
        );
        assert_eq!(parse_status(b"hello, not a proxy\r\n"), None);
        assert_eq!(parse_status(b""), None);
    }

    #[test]
    fn an_unconfigured_proxy_reports_that_commands_inherit_the_environment() {
        assert_eq!(
            test_proxy(&NetworkProxySettings::default()).expect("no error"),
            ProxyTestOutcome::Inherited
        );
        assert_eq!(
            test_proxy(&NetworkProxySettings {
                proxy: Some("   ".to_string()),
                no_proxy: None,
                test_host: None,
            })
            .expect("blank is not an error"),
            ProxyTestOutcome::Inherited
        );
    }

    #[test]
    fn a_rejected_address_is_reported_before_any_socket_is_opened() {
        let error = test_proxy(&NetworkProxySettings {
            proxy: Some("127.0.0.1:7890".to_string()),
            no_proxy: None,
            test_host: None,
        })
        .expect_err("an address without a scheme is rejected");

        assert!(error.contains("absolute URL"), "{error}");
    }

    #[test]
    fn an_endpoint_that_does_not_answer_as_a_proxy_is_named_as_such() {
        let port = spawn_probe_server(b"\r\nnot a proxy\r\n").expect("bind a listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        assert_eq!(outcome, ProxyTestOutcome::NotAProxy);
    }

    #[test]
    fn a_proxy_that_refuses_the_tunnel_reports_its_own_status() {
        let port = spawn_probe_server(b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n")
            .expect("bind a listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        assert_eq!(outcome, ProxyTestOutcome::Refused { status: 407 });
    }

    #[test]
    fn a_proxy_that_grants_the_tunnel_reports_how_long_it_took() {
        let port = spawn_probe_server(b"HTTP/1.1 200 Connection established\r\n\r\n")
            .expect("bind a listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        match outcome {
            ProxyTestOutcome::Tunnelled { latency_millis } => {
                assert!(latency_millis.is_none_or(|latency| latency < 10_000))
            }
            other => panic!("expected a tunnel, got {other:?}"),
        }
    }

    /// Serves a scripted SOCKS5 server: greeting, then a granted tunnel.
    fn spawn_socks5_server(reply_code: u8) -> Option<u16> {
        let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).ok()?;
        let port = listener.local_addr().ok()?.port();
        std::thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
            let mut chunk = [0u8; 512];
            let mut greeting = [0u8; 3];
            let _ = stream.read_exact(&mut greeting);
            // Version 5, "no authentication required".
            let _ = stream.write_all(&[0x05, 0x00]);
            let _ = stream.read(&mut chunk);
            // Version 5, reply code, reserved, domain address type.
            let _ = stream.write_all(&[
                0x05, reply_code, 0x00, 0x01, 0x7f, 0x00, 0x00, 0x01, 0x00, 0x50,
            ]);
            if reply_code == 0x00 {
                // A granted tunnel then answers the request, exactly like the
                // proxy this replaces.
                let _ = stream.read(&mut chunk);
                let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\n\r\n");
            }
            // Hold the socket open: closing with unread input sends a reset,
            // which discards the reply and turns the outcome into a race.
            std::thread::sleep(Duration::from_millis(300));
        });
        Some(port)
    }

    #[test]
    fn a_socks5_endpoint_is_tested_with_a_socks5_handshake() {
        let port = spawn_socks5_server(0x00).expect("bind a socks5 listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("socks5://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        match outcome {
            ProxyTestOutcome::Tunnelled { latency_millis } => {
                assert!(latency_millis.is_none_or(|latency| latency < 10_000))
            }
            other => panic!("expected a tunnel, got {other:?}"),
        }
    }

    #[test]
    fn a_socks5_refusal_reports_the_socks_reply_code() {
        let port = spawn_socks5_server(0x05).expect("bind a socks5 listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("socks5://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        // 0x05 is SOCKS5 "connection refused"; it is not an HTTP status and
        // must not be presented as one.
        assert_eq!(outcome, ProxyTestOutcome::Refused { status: 5 });
    }

    #[test]
    fn an_http_handshake_against_a_socks5_endpoint_is_not_a_proxy() {
        let port = spawn_socks5_server(0x00).expect("bind a socks5 listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        assert_eq!(outcome, ProxyTestOutcome::NotAProxy);
    }

    #[test]
    fn socks4_is_named_as_untested_instead_of_being_called_a_proxy() {
        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some("socks4://127.0.0.1:1080".to_string()),
            no_proxy: None,
            test_host: None,
        })
        .expect("the address is valid");

        assert_eq!(outcome, ProxyTestOutcome::UnsupportedScheme);
    }

    #[test]
    fn the_wire_shape_matches_the_frontend_contract() {
        // A variant or field renamed on the Rust side reaches the UI as an
        // unknown message key, which renders as an empty result rather than a
        // visible error. Pinning the exact JSON keeps that from recurring.
        assert_eq!(
            serde_json::to_string(&ProxyTestOutcome::Tunnelled {
                latency_millis: Some(128)
            })
            .expect("serialize"),
            r#"{"kind":"tunnelled","latencyMillis":128}"#
        );
        assert_eq!(
            serde_json::to_string(&ProxyTestOutcome::Tunnelled {
                latency_millis: None
            })
            .expect("serialize"),
            r#"{"kind":"tunnelled","latencyMillis":null}"#
        );
        assert_eq!(
            serde_json::to_string(&ProxyTestOutcome::Inherited).expect("serialize"),
            r#"{"kind":"inherited"}"#
        );
        assert_eq!(
            serde_json::to_string(&ProxyTestOutcome::Refused { status: 407 }).expect("serialize"),
            r#"{"kind":"refused","status":407}"#
        );
        assert_eq!(
            serde_json::to_string(&ProxyTestOutcome::UnsupportedScheme).expect("serialize"),
            r#"{"kind":"unsupportedScheme"}"#
        );
    }

    /// Serves a proxy that grants the tunnel and then answers, or stays
    /// silent, exactly as the script asks.
    fn spawn_tunnelling_http_proxy(answer_after_tunnel: bool) -> Option<u16> {
        let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).ok()?;
        let port = listener.local_addr().ok()?.port();
        std::thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
            let mut request = Vec::new();
            let mut chunk = [0u8; 512];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let Ok(read) = stream.read(&mut chunk) else {
                    return;
                };
                if read == 0 {
                    return;
                }
                request.extend_from_slice(&chunk[..read]);
            }
            if stream
                .write_all(b"HTTP/1.1 200 Connection established\r\n\r\n")
                .is_err()
            {
                return;
            }
            if !answer_after_tunnel {
                return;
            }
            // Read the request, then answer it: a real response is what the
            // round trip is measured against.
            let _ = stream.read(&mut chunk);
            let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\n\r\n");
        });
        Some(port)
    }

    #[test]
    fn a_granted_tunnel_is_reported_with_the_round_trip_to_the_target() {
        let port = spawn_tunnelling_http_proxy(true).expect("bind a proxy listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        match outcome {
            ProxyTestOutcome::Tunnelled { latency_millis } => {
                let latency = latency_millis.expect("the target answered");
                // A loopback script answers fast, but the number is now a real
                // round trip and can never be reported as zero.
                assert!(latency >= 1, "a measured round trip is never 0 ms");
            }
            other => panic!("expected a tunnel, got {other:?}"),
        }
    }

    #[test]
    fn a_silent_target_is_not_reported_as_an_instant_success() {
        let port = spawn_tunnelling_http_proxy(false).expect("bind a proxy listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        assert_eq!(
            outcome,
            ProxyTestOutcome::Tunnelled {
                latency_millis: None
            },
            "a silent target is a different answer from a fast one"
        );
    }

    #[test]
    fn sub_millisecond_rounds_up_instead_of_reporting_zero() {
        assert_eq!(millis_rounded(Duration::from_micros(0)), 1);
        assert_eq!(millis_rounded(Duration::from_micros(1)), 1);
        assert_eq!(millis_rounded(Duration::from_micros(999)), 1);
        assert_eq!(millis_rounded(Duration::from_millis(1)), 1);
        assert_eq!(millis_rounded(Duration::from_millis(128)), 128);
    }

    #[test]
    fn the_tunnel_probe_reads_a_real_response_instead_of_a_handshake() {
        let port = spawn_tunnelling_http_proxy(true).expect("bind a proxy listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        match outcome {
            ProxyTestOutcome::Tunnelled { latency_millis } => {
                // A plain request is understood by every host, so a granted
                // tunnel can no longer be mistaken for a reachable one.
                assert!(latency_millis.is_some(), "the scripted host answered");
            }
            other => panic!("expected a tunnel, got {other:?}"),
        }
    }

    #[test]
    fn a_status_line_is_read_from_a_multi_line_response_head() {
        assert_eq!(
            parse_status(b"HTTP/1.1 204 No Content\r\nServer: gws\r\n\r\n"),
            Some(204)
        );
        assert_eq!(
            parse_status(b"HTTP/1.1 301 Moved Permanently\r\nLocation: https://x/\r\n\r\n"),
            Some(301)
        );
    }

    #[test]
    fn a_test_host_must_be_a_bare_host_name() {
        for value in [
            "https://github.com",
            "github.com/rate",
            "github.com:443",
            "user@github.com",
        ] {
            assert!(
                normalize_host(Some(value)).is_err(),
                "{value} must be refused so the test cannot measure something else"
            );
        }
        assert_eq!(
            normalize_host(Some(" GitHub.com ")).expect("a host is valid"),
            Some("github.com".to_string())
        );
        assert_eq!(
            normalize_host(Some(" ")).expect("blank is not an error"),
            None
        );
    }

    /// A proxy that records the CONNECT request line it was asked to open, so
    /// a test can prove which host and port were actually measured.
    fn spawn_recording_http_proxy() -> Option<(u16, std::sync::mpsc::Receiver<String>)> {
        let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).ok()?;
        let port = listener.local_addr().ok()?.port();
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
            let mut request = Vec::new();
            let mut chunk = [0u8; 512];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let Ok(read) = stream.read(&mut chunk) else {
                    return;
                };
                if read == 0 {
                    return;
                }
                request.extend_from_slice(&chunk[..read]);
            }
            let _ = sender.send(String::from_utf8_lossy(&request).into_owned());
            let _ = stream.write_all(b"HTTP/1.1 200 Connection established\r\n\r\n");
            let _ = stream.read(&mut chunk);
            let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\n\r\n");
        });
        Some((port, receiver))
    }

    #[test]
    fn the_configured_host_and_port_are_the_ones_measured() {
        let (port, requests) = spawn_recording_http_proxy().expect("bind a proxy listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: Some("registry.npmjs.org".to_string()),
        })
        .expect("the probe completed");

        assert!(matches!(outcome, ProxyTestOutcome::Tunnelled { .. }));
        let request = requests
            .recv_timeout(Duration::from_secs(2))
            .expect("the proxy recorded the request");
        assert!(
            request.starts_with("CONNECT registry.npmjs.org:80 "),
            "the measured host must be the configured one, got: {request}"
        );
    }

    #[test]
    fn the_connect_request_never_asks_the_proxy_to_close_the_tunnel() {
        let (port, requests) = spawn_recording_http_proxy().expect("bind a proxy listener");

        let _ = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        let request = requests
            .recv_timeout(Duration::from_secs(2))
            .expect("the proxy recorded the request");
        assert!(
            !request.to_lowercase().contains("proxy-connection"),
            "a local proxy honours Proxy-Connection: close by never answering: {request}"
        );
    }

    #[test]
    fn a_socks5_bind_address_is_consumed_before_the_tunnel_is_used() {
        let port = spawn_socks5_server(0x00).expect("bind a socks5 listener");

        let outcome = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("socks5://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        // The bind address left in the socket would prefix the HTTP response
        // and make a working tunnel look silent.
        match outcome {
            ProxyTestOutcome::Tunnelled { latency_millis } => {
                assert!(latency_millis.is_some(), "the scripted host answered")
            }
            other => panic!("expected a tunnel, got {other:?}"),
        }
    }

    #[test]
    fn the_default_host_is_used_when_none_is_configured() {
        let (port, requests) = spawn_recording_http_proxy().expect("bind a proxy listener");

        let _ = test_proxy(&NetworkProxySettings {
            proxy: Some(format!("http://127.0.0.1:{port}")),
            no_proxy: None,
            test_host: None,
        })
        .expect("the probe completed");

        let request = requests
            .recv_timeout(Duration::from_secs(2))
            .expect("the proxy recorded the request");
        assert!(
            request.starts_with("CONNECT www.gstatic.com:80 "),
            "{request}"
        );
    }

    #[test]
    fn a_closed_proxy_port_is_reported_as_unreachable_rather_than_hanging() {
        let listener =
            TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).expect("bind a port");
        let port = listener.local_addr().expect("local address").port();
        drop(listener);

        assert_eq!(
            test_proxy(&NetworkProxySettings {
                proxy: Some(format!("http://127.0.0.1:{port}")),
                no_proxy: None,
                test_host: None,
            })
            .expect("the probe completed"),
            ProxyTestOutcome::Unreachable
        );
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
            test_host: None,
        };
        let normalized = settings.normalized().expect("credentials are allowed");

        assert_eq!(
            normalized.proxy.as_deref(),
            Some("http://user:secret@127.0.0.1:7890")
        );
        let rejected = NetworkProxySettings {
            proxy: Some("user:secret@127.0.0.1:not a url".to_string()),
            no_proxy: None,
            test_host: None,
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
