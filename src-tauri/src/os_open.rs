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
