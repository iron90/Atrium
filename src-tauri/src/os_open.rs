use std::io;
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "macos")]
pub fn open_path(path: &Path) -> io::Result<()> {
    Command::new("open").arg(path).spawn().map(|_| ())
}

#[cfg(target_os = "windows")]
pub fn open_path(path: &Path) -> io::Result<()> {
    Command::new("explorer").arg(path).spawn().map(|_| ())
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn open_path(path: &Path) -> io::Result<()> {
    Command::new("xdg-open").arg(path).spawn().map(|_| ())
}

#[cfg(not(any(unix, target_os = "windows")))]
pub fn open_path(_path: &Path) -> io::Result<()> {
    Err(io::Error::other(
        "Opening paths is not supported on this platform",
    ))
}

// Reveal selects the artifact in the system file manager instead of handing
// it to a launcher, so a declared artifact can never be executed by opening.
#[cfg(target_os = "macos")]
pub fn reveal_path(path: &Path) -> io::Result<()> {
    Command::new("open").arg("-R").arg(path).spawn().map(|_| ())
}

#[cfg(target_os = "windows")]
pub fn reveal_path(path: &Path) -> io::Result<()> {
    Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map(|_| ())
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn reveal_path(path: &Path) -> io::Result<()> {
    Command::new("xdg-open").arg(path).spawn().map(|_| ())
}

#[cfg(not(any(unix, target_os = "windows")))]
pub fn reveal_path(_path: &Path) -> io::Result<()> {
    Err(io::Error::other(
        "Revealing paths is not supported on this platform",
    ))
}

// xdg-open dispatches to the default handler, which can execute; Atrium
// therefore refuses executable artifact files on Linux instead of opening.
#[cfg(all(unix, not(target_os = "macos")))]
pub fn is_executable_file(metadata: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn is_executable_file(_metadata: &std::fs::Metadata) -> bool {
    // `open -R` and `explorer /select` only reveal; no launcher is involved.
    false
}

#[cfg(target_os = "macos")]
pub fn open_url(url: &str) -> io::Result<()> {
    Command::new("open").arg(url).spawn().map(|_| ())
}

#[cfg(target_os = "windows")]
pub fn open_url(url: &str) -> io::Result<()> {
    Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map(|_| ())
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn open_url(url: &str) -> io::Result<()> {
    Command::new("xdg-open").arg(url).spawn().map(|_| ())
}

#[cfg(not(any(unix, target_os = "windows")))]
pub fn open_url(_url: &str) -> io::Result<()> {
    Err(io::Error::other(
        "Opening URLs is not supported on this platform",
    ))
}
