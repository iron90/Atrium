// Prevents an extra console window on Windows in release builds.
// Captured children start through `captured_process::captured_command`,
// which sets CREATE_NO_WINDOW. A GUI parent otherwise gives each console
// program its own flashing window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    atrium_lib::run();
}
