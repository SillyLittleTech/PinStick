// Cross-platform PinStick (Tauri)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Serialize)]
struct PinState {
    pinned: bool,
}

#[derive(Serialize)]
struct OverlayStateResponse {
    enabled: bool,
    opacity: f32,
}

#[derive(Serialize)]
struct OverlayInputAvailability {
    click_through: bool,
    platform: String,
    message: Option<String>,
}

#[derive(Clone)]
struct OverlayState {
    enabled: bool,
    opacity: f32,
    saved_pin: bool,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            enabled: false,
            opacity: 0.7,
            saved_pin: false,
        }
    }
}

struct PinStore(Mutex<bool>);
struct OverlayStore(Mutex<OverlayState>);

fn clamp_opacity(opacity: f32) -> f32 {
    opacity.clamp(0.4, 1.0)
}

fn platform_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        return "macos";
    }
    #[cfg(target_os = "windows")]
    {
        return "windows";
    }
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            return "linux-wayland";
        }
        return "linux-x11";
    }
    #[allow(unreachable_code)]
    "unknown"
}

fn overlay_input_available() -> OverlayInputAvailability {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            return OverlayInputAvailability {
                click_through: false,
                platform: "linux-wayland".into(),
                message: Some(
                    "Full click-through isn't available on Wayland. Use the toolbar to exit or change opacity.".into(),
                ),
            };
        }
    }

    OverlayInputAvailability {
        click_through: true,
        platform: platform_name().into(),
        message: None,
    }
}

#[cfg(target_os = "macos")]
fn set_window_opacity(window: &tauri::Window, opacity: f32) -> Result<(), String> {
    use cocoa::appkit::NSWindow;
    use cocoa::base::id;

    let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;
    unsafe {
        ns_window.setAlphaValue_(opacity as _);
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_window_opacity(_window: &tauri::Window, _opacity: f32) -> Result<(), String> {
    // Opacity is applied via CSS on Windows (avoids HWND API version conflicts with Tauri).
    Ok(())
}

#[cfg(target_os = "linux")]
fn set_window_opacity(_window: &tauri::Window, _opacity: f32) -> Result<(), String> {
    // Opacity is applied via CSS on Linux.
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn set_window_opacity(_window: &tauri::Window, _opacity: f32) -> Result<(), String> {
    Ok(())
}

fn apply_overlay_window(
    window: &tauri::Window,
    enabled: bool,
    opacity: f32,
    click_through: bool,
) -> Result<(), String> {
    if enabled {
        window
            .set_always_on_top(true)
            .map_err(|e| format!("Failed to set always on top: {e}"))?;
        set_window_opacity(window, opacity)?;
        if click_through {
            window
                .set_ignore_cursor_events(true)
                .map_err(|e| format!("Failed to set click-through: {e}"))?;
        } else {
            window
                .set_ignore_cursor_events(false)
                .map_err(|e| format!("Failed to disable click-through: {e}"))?;
        }
    } else {
        set_window_opacity(window, 1.0)?;
        window
            .set_ignore_cursor_events(false)
            .map_err(|e| format!("Failed to restore click-through: {e}"))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn get_cursor_position_impl(window: &tauri::Window) -> Result<(f64, f64), String> {
    use cocoa::appkit::{NSEvent, NSWindow};
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSRect;

    let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    unsafe {
        let mouse = NSEvent::mouseLocation(nil);
        let frame: NSRect = ns_window.frame();
        let x = (mouse.x - frame.origin.x) / scale;
        let y = (frame.origin.y + frame.size.height - mouse.y) / scale;
        Ok((x, y))
    }
}

#[cfg(target_os = "windows")]
fn get_cursor_position_impl(window: &tauri::Window) -> Result<(f64, f64), String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let outer = window
        .outer_position()
        .map_err(|e| format!("Failed to get window position: {e}"))?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    unsafe {
        let mut point = POINT::default();
        GetCursorPos(&mut point)
            .as_bool()
            .then_some(())
            .ok_or_else(|| "GetCursorPos failed".to_string())?;
        let x = (point.x as f64 - outer.x as f64) / scale;
        let y = (point.y as f64 - outer.y as f64) / scale;
        Ok((x, y))
    }
}

#[cfg(target_os = "linux")]
fn linux_x_display() -> Result<*mut x11::xlib::Display, String> {
    use std::cell::RefCell;
    use x11::xlib;

    thread_local! {
        static DISPLAY: RefCell<Option<*mut xlib::Display>> = RefCell::new(None);
    }

    DISPLAY.with(|cell| {
        let mut guard = cell.borrow_mut();
        if guard.is_none() {
            let display = unsafe { xlib::XOpenDisplay(std::ptr::null()) };
            if display.is_null() {
                return Err("XOpenDisplay failed".into());
            }
            *guard = Some(display);
        }
        Ok(*guard.as_ref().unwrap())
    })
}

#[cfg(target_os = "linux")]
fn get_cursor_position_impl(window: &tauri::Window) -> Result<(f64, f64), String> {
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        return Err("wayland_cursor_unavailable".into());
    }

    use raw_window_handle::{HasRawWindowHandle, RawWindowHandle};
    use x11::xlib;

    let handle = window.raw_window_handle();

    match handle {
        RawWindowHandle::Xlib(xlib_handle) => unsafe {
            let display = linux_x_display()?;
            let mut root_return: xlib::Window = 0;
            let mut child_return: xlib::Window = 0;
            let mut root_x: i32 = 0;
            let mut root_y: i32 = 0;
            let mut win_x: i32 = 0;
            let mut win_y: i32 = 0;
            let mut mask: u32 = 0;

            let ok = xlib::XQueryPointer(
                display,
                xlib_handle.window as u64,
                &mut root_return,
                &mut child_return,
                &mut root_x,
                &mut root_y,
                &mut win_x,
                &mut win_y,
                &mut mask,
            );
            if ok == 0 {
                return Err("XQueryPointer failed".into());
            }

            let scale = window.scale_factor().map_err(|e| e.to_string())?;
            Ok((win_x as f64 / scale, win_y as f64 / scale))
        },
        RawWindowHandle::Wayland(_) => Err("wayland_cursor_unavailable".into()),
        _ => Err("unsupported_linux_display".into()),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn get_cursor_position_impl(_window: &tauri::Window) -> Result<(f64, f64), String> {
    Err("cursor_position_unavailable".into())
}

#[tauri::command]
fn toggle_pin(
    window: tauri::Window,
    pin_store: State<PinStore>,
    overlay_store: State<OverlayStore>,
) -> Result<PinState, String> {
    let overlay = overlay_store.0.lock().unwrap_or_else(|e| e.into_inner());
    if overlay.enabled {
        return Err("Disable overlay before changing pin state.".into());
    }
    drop(overlay);

    let mut pinned = pin_store.0.lock().unwrap_or_else(|e| e.into_inner());
    let next = !*pinned;
    window
        .set_always_on_top(next)
        .map_err(|e| format!("Failed to toggle pin: {e}"))?;
    *pinned = next;
    Ok(PinState { pinned: next })
}

#[tauri::command]
fn toggle_overlay(
    window: tauri::Window,
    pin_store: State<PinStore>,
    overlay_store: State<OverlayStore>,
) -> Result<OverlayStateResponse, String> {
    let availability = overlay_input_available();
    let mut overlay = overlay_store.0.lock().unwrap_or_else(|e| e.into_inner());
    let mut pinned = pin_store.0.lock().unwrap_or_else(|e| e.into_inner());

    let next = !overlay.enabled;
    if next {
        overlay.saved_pin = *pinned;
        overlay.enabled = true;
        apply_overlay_window(&window, true, overlay.opacity, availability.click_through)?;
    } else {
        overlay.enabled = false;
        apply_overlay_window(&window, false, overlay.opacity, availability.click_through)?;
        window
            .set_always_on_top(overlay.saved_pin)
            .map_err(|e| format!("Failed to restore pin state: {e}"))?;
        *pinned = overlay.saved_pin;
    }

    Ok(OverlayStateResponse {
        enabled: overlay.enabled,
        opacity: overlay.opacity,
    })
}

#[tauri::command]
fn set_overlay_opacity(
    opacity: f32,
    window: tauri::Window,
    overlay_store: State<OverlayStore>,
) -> Result<OverlayStateResponse, String> {
    let mut overlay = overlay_store.0.lock().unwrap_or_else(|e| e.into_inner());
    overlay.opacity = clamp_opacity(opacity);

    if overlay.enabled {
        set_window_opacity(&window, overlay.opacity)?;
    }

    Ok(OverlayStateResponse {
        enabled: overlay.enabled,
        opacity: overlay.opacity,
    })
}

#[tauri::command]
fn set_ignore_cursor_events(ignore: bool, window: tauri::Window) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| format!("Failed to set ignore cursor events: {e}"))
}

#[tauri::command]
fn get_cursor_position(window: tauri::Window) -> Result<(f64, f64), String> {
    get_cursor_position_impl(&window)
}

#[tauri::command]
fn check_overlay_input_available() -> OverlayInputAvailability {
    overlay_input_available()
}

#[tauri::command]
fn get_overlay_state(overlay_store: State<OverlayStore>) -> Result<OverlayStateResponse, String> {
    let overlay = overlay_store.0.lock().unwrap_or_else(|e| e.into_inner());
    Ok(OverlayStateResponse {
        enabled: overlay.enabled,
        opacity: overlay.opacity,
    })
}

fn main() {
    tauri::Builder::default()
        .manage(PinStore(Mutex::new(false)))
        .manage(OverlayStore(Mutex::new(OverlayState::default())))
        .invoke_handler(tauri::generate_handler![
            toggle_pin,
            toggle_overlay,
            set_overlay_opacity,
            set_ignore_cursor_events,
            get_cursor_position,
            check_overlay_input_available,
            get_overlay_state,
        ])
        .setup(|app| {
            if let Some(window) = app.get_window("main") {
                window.set_title("PinStick")?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PinStick");
}
