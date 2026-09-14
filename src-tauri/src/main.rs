#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use tauri::{Url, WebviewUrl, WebviewWindowBuilder};

/// The window is only a frame: `simplify-migrate` starts the local server and passes its address.
fn main() {
    let address = std::env::args()
        .nth(1)
        .or_else(|| std::env::var("MIGRATE_URL").ok())
        .unwrap_or_else(|| "http://127.0.0.1:4800".to_string());
    let url: Url = address.parse().expect("the app address must be a URL");
    let origin = url.origin();

    tauri::Builder::default()
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.clone()))
                .title("Migrate")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 680.0)
                // Links leaving the app (a running legacy or v2 service) open in the system browser.
                .on_navigation(move |target| {
                    if target.origin() == origin {
                        return true;
                    }
                    let _ = open_external(target.as_str());
                    false
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to open the Migrate window");
}

fn open_external(url: &str) -> std::io::Result<std::process::Child> {
    if cfg!(target_os = "macos") {
        Command::new("open").arg(url).spawn()
    } else if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", "start", "", url]).spawn()
    } else {
        Command::new("xdg-open").arg(url).spawn()
    }
}
