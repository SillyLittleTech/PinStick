// Cross-platform PinStick (Tauri)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Serialize)]
struct PinState {
    pinned: bool,
}

struct PinStore(Mutex<bool>);

#[tauri::command]
fn toggle_pin(window: tauri::Window, store: State<PinStore>) -> Result<PinState, String> {
    let mut pinned = store.0.lock().unwrap_or_else(|e| e.into_inner());

    let next = !*pinned;
    window
        .set_always_on_top(next)
        .map_err(|e| format!("Failed to toggle pin: {e}"))?;

    *pinned = next;
    Ok(PinState { pinned: next })
}

fn main() {
    tauri::Builder::default()
        .manage(PinStore(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![toggle_pin])
        .setup(|app| {
            if let Some(window) = app.get_window("main") {
                window.set_title("PinStick")?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PinStick");
}
