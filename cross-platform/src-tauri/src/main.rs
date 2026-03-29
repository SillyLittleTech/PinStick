// Cross-platform PinStick (Tauri)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
struct PinState {
    pinned: bool,
}

#[tauri::command]
fn toggle_pin(window: tauri::Window) -> Result<PinState, String> {
    let current = window.is_always_on_top().unwrap_or(false);
    let next = !current;
    window
        .set_always_on_top(next)
        .map_err(|e| format!("Failed to toggle pin: {e}"))?;
    Ok(PinState { pinned: next })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![toggle_pin])
        .setup(|app| {
            if let Some(window) = app.get_window("main") {
                window
                    .set_title("PinStick")
                    .map_err(|e| tauri::Error::Runtime(e.to_string()))?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PinStick");
}
