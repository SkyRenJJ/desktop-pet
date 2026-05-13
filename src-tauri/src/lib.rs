use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn show_pet_context_menu(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    let state = app.state::<Mutex<Option<tauri::menu::Menu<tauri::Wry>>>>();
    let guard = state.lock().map_err(|e| e.to_string())?;

    if let Some(ref menu) = *guard {
        window
            .popup_menu(menu)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // --- context menu for pet right-click ---
            let minimize_item = MenuItemBuilder::with_id("minimize", "最小化到托盘")
                .build(app)?;
            let exit_item = MenuItemBuilder::with_id("exit", "退出")
                .build(app)?;
            let pet_menu = MenuBuilder::new(app)
                .item(&minimize_item)
                .item(&exit_item)
                .build()?;

            app.manage(Mutex::new(Some(pet_menu)));

            // Handle pet context menu clicks
            app.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "minimize" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "exit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "tray-json-parse" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("tray-open-json-input", ());
                        }
                    }
                    _ => {}
                }
            });

            // --- tray icon with menu ---
            let show_item = MenuItemBuilder::with_id("show", "显示")
                .build(app)?;
            let json_parse_item = MenuItemBuilder::with_id("tray-json-parse", "JSON解析")
                .build(app)?;
            let tray_exit = MenuItemBuilder::with_id("exit", "退出")
                .build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&json_parse_item)
                .item(&tray_exit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("t-pet")
                .menu(&tray_menu)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // --- initial window positioning (bottom-left as safe default) ---
            if let Some(window) = app.get_webview_window("main") {
                let monitor = window
                    .current_monitor()
                    .ok()
                    .flatten()
                    .or_else(|| window.primary_monitor().ok().flatten());

                if let Some(monitor) = monitor {
                    let work_area = monitor.work_area();
                    let window_size = window.outer_size()?;
                    let margin = 12;
                    let x = work_area.position.x + margin;
                    let y = work_area.position.y + work_area.size.height as i32
                        - window_size.height as i32
                        - margin;

                    window.set_position(PhysicalPosition::new(x, y))?;
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, exit_app, show_pet_context_menu])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
