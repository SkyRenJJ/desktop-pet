use tauri::{Manager, PhysicalPosition};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let Some(window) = app.get_webview_window("main") else {
                return Ok(());
            };

            let monitor = window
                .current_monitor()
                .ok()
                .flatten()
                .or_else(|| window.primary_monitor().ok().flatten());

            let Some(monitor) = monitor else {
                return Ok(());
            };

            let work_area = monitor.work_area();
            let window_size = window.outer_size()?;
            let margin = 12;
            let x = work_area.position.x + margin;
            let y = work_area.position.y + work_area.size.height as i32
                - window_size.height as i32
                - margin;

            window.set_position(PhysicalPosition::new(x, y))?;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
