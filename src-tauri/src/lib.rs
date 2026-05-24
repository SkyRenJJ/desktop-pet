use std::io::Read;
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

#[tauri::command]
async fn set_always_on_top(window: tauri::Window, on_top: bool) -> Result<(), String> {
    window.set_always_on_top(on_top).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_all_always_on_top(app: tauri::AppHandle, on_top: bool) -> Result<(), String> {
    for (_label, window) in app.webview_windows().iter() {
        window.set_always_on_top(on_top).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn save_file(path: String, data: String) -> Result<(), String> {
    let bytes = base64_decode(&data).map_err(|e| format!("Base64 decode failed: {}", e))?;
    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn schedule_shutdown(seconds: u64) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("shutdown")
            .args(["/s", "/t", &seconds.to_string()])
            .spawn()
            .map_err(|e| format!("Failed to schedule shutdown: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        let minutes = (seconds + 59) / 60;
        std::process::Command::new("shutdown")
            .args(["-h", &format!("+{}", minutes)])
            .spawn()
            .map_err(|e| format!("Failed to schedule shutdown: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        let minutes = (seconds + 59) / 60;
        std::process::Command::new("shutdown")
            .args([&format!("+{}", minutes)])
            .spawn()
            .map_err(|e| format!("Failed to schedule shutdown: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn cancel_shutdown() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("shutdown")
            .args(["/a"])
            .spawn()
            .map_err(|e| format!("Failed to cancel shutdown: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("killall")
            .args(["shutdown"])
            .spawn()
            .map_err(|e| format!("Failed to cancel shutdown: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("shutdown")
            .args(["-c"])
            .spawn()
            .map_err(|e| format!("Failed to cancel shutdown: {}", e))?;
    }
    Ok(())
}

// --- scrcpy ---

const SCRCPY_VERSION: &str = "v3.2";
const SCRCPY_INSTALL_DIR: &str = "scrcpy";

#[derive(serde::Serialize)]
struct ScrcpyStatus {
    installed: bool,
    path: String,
}

fn find_scrcpy(custom_path: Option<&str>) -> Option<String> {
    let candidates = if cfg!(target_os = "windows") {
        vec!["scrcpy.exe", "scrcpy"]
    } else {
        vec!["scrcpy"]
    };

    // 1. Check PATH
    for name in &candidates {
        if std::process::Command::new(name)
            .arg("--version")
            .output()
            .is_ok()
        {
            return Some(name.to_string());
        }
    }

    // 2. Check custom user-selected directory first
    if let Some(custom) = custom_path {
        for name in &candidates {
            let exe_path = std::path::Path::new(custom).join(name);
            if exe_path.exists() {
                return Some(exe_path.to_string_lossy().to_string());
            }
        }
    }

    // 3. Check default local install directory
    if let Some(data_dir) = app_data_dir() {
        let install_dir = data_dir.join(SCRCPY_INSTALL_DIR);
        for name in &candidates {
            let exe_path = install_dir.join(name);
            if exe_path.exists() {
                return Some(exe_path.to_string_lossy().to_string());
            }
        }
    }

    // 4. Check common paths
    #[cfg(target_os = "windows")]
    {
        let common_paths = [
            r"C:\Program Files\scrcpy\scrcpy.exe",
            r"C:\Program Files (x86)\scrcpy\scrcpy.exe",
        ];
        for path in &common_paths {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }
    }

    None
}

fn app_data_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("LOCALAPPDATA").ok().map(std::path::PathBuf::from)
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join("Library").join("Application Support"))
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_DATA_HOME").ok().map(std::path::PathBuf::from)
            .or_else(|| std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join(".local").join("share")))
    }
}

#[tauri::command]
fn scrcpy_check(custom_path: Option<String>) -> Result<ScrcpyStatus, String> {
    match find_scrcpy(custom_path.as_deref()) {
        Some(path) => Ok(ScrcpyStatus {
            installed: true,
            path,
        }),
        None => Ok(ScrcpyStatus {
            installed: false,
            path: String::new(),
        }),
    }
}

#[tauri::command]
fn scrcpy_launch(custom_path: Option<String>) -> Result<(), String> {
    let scrcpy_path = find_scrcpy(custom_path.as_deref())
        .ok_or("scrcpy 未安装，请先安装")?;

    // Launch scrcpy detached so it runs independently
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&scrcpy_path)
            .args(["--window-title", "scrcpy"])
            .spawn()
            .map_err(|e| format!("启动 scrcpy 失败: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new(&scrcpy_path)
            .spawn()
            .map_err(|e| format!("启动 scrcpy 失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn scrcpy_install(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let install_dir = std::path::PathBuf::from(&path);
    std::fs::create_dir_all(&install_dir)
        .map_err(|e| format!("创建安装目录失败: {}", e))?;

    let zip_path = install_dir.join("scrcpy.zip");

    // Build download URL
    let url = if cfg!(target_os = "windows") {
        format!(
            "https://github.com/Genymobile/scrcpy/releases/download/{}/scrcpy-win64-{}.zip",
            SCRCPY_VERSION,
            &SCRCPY_VERSION[1..] // strip leading 'v'
        )
    } else if cfg!(target_os = "macos") {
        format!(
            "https://github.com/Genymobile/scrcpy/releases/download/{}/scrcpy-macos-{}.tar.gz",
            SCRCPY_VERSION,
            &SCRCPY_VERSION[1..]
        )
    } else {
        format!(
            "https://github.com/Genymobile/scrcpy/releases/download/{}/scrcpy-server-{}.tar.gz",
            SCRCPY_VERSION,
            &SCRCPY_VERSION[1..]
        )
    };

    // Download
    let response = ureq::get(&url)
        .call()
        .map_err(|e| format!("下载失败: {}", e))?;

    let total_size: u64 = response
        .header("Content-Length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let mut downloaded: u64 = 0;
    let mut buf: Vec<u8> = Vec::new();
    let mut reader = response.into_reader();

    let mut chunk = [0u8; 8192];
    loop {
        let n = reader
            .read(&mut chunk)
            .map_err(|e| format!("下载读取失败: {}", e))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        downloaded += n as u64;

        // Emit progress
        if total_size > 0 {
            let pct = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
            let _ = app.emit("scrcpy-install-progress", pct);
        }
    }

    // Write zip to disk
    std::fs::write(&zip_path, &buf)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    // Extract zip
    let zip_file = std::fs::File::open(&zip_path)
        .map_err(|e| format!("打开压缩包失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(zip_file)
        .map_err(|e| format!("读取压缩包失败: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
        let out_path = install_dir.join(file.name());

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut out_file = std::fs::File::create(&out_path)
                .map_err(|e| format!("创建文件失败: {}", e))?;
            std::io::copy(&mut file, &mut out_file)
                .map_err(|e| format!("解压文件失败: {}", e))?;
        }
    }

    // Cleanup zip
    std::fs::remove_file(&zip_path).ok();

    Ok(())
}

// --- ADB file management ---

#[derive(serde::Serialize)]
struct AdbDevice {
    serial: String,
    state: String,
}

#[derive(serde::Serialize)]
struct FileEntry {
    name: String,
    is_dir: bool,
    size: u64,
    permissions: String,
    modified: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Memo {
    id: String,
    content: String,
    deadline_epoch: i64,
    completed: bool,
}

fn current_epoch_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}


fn memos_file_path() -> Option<std::path::PathBuf> {
    app_data_dir().map(|d| d.join("desktop-pet").join("memos.json"))
}

fn load_memos_from_file() -> Vec<Memo> {
    if let Some(path) = memos_file_path() {
        if path.exists() {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(memos) = serde_json::from_str::<Vec<Memo>>(&data) {
                    return memos;
                }
            }
        }
    }
    Vec::new()
}

fn save_memos_to_file(memos: &[Memo]) {
    if let Some(path) = memos_file_path() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(memos) {
            let _ = std::fs::write(&path, json);
        }
    }
}

fn show_memo_notification(content: &str) {
    let _ = notify_rust::Notification::new()
        .summary("备忘录提醒")
        .body(content)
        .show();
}

fn find_adb() -> Option<String> {
    let candidates = if cfg!(target_os = "windows") {
        vec!["adb.exe", "adb"]
    } else {
        vec!["adb"]
    };

    // 1. Check PATH
    for name in &candidates {
        if std::process::Command::new(name)
            .arg("version")
            .output()
            .is_ok()
        {
            return Some(name.to_string());
        }
    }

    // 2. Check scrcpy install directories
    if let Some(path) = find_scrcpy(None) {
        let scrcpy_dir = std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new("."));
        for name in &candidates {
            let adb_path = scrcpy_dir.join(name);
            if adb_path.exists() {
                return Some(adb_path.to_string_lossy().to_string());
            }
        }
    }

    // 3. Check custom scrcpy path (from common directories)
    if let Some(data_dir) = app_data_dir() {
        let install_dir = data_dir.join(SCRCPY_INSTALL_DIR);
        for name in &candidates {
            let adb_path = install_dir.join(name);
            if adb_path.exists() {
                return Some(adb_path.to_string_lossy().to_string());
            }
        }
    }

    None
}

#[tauri::command]
fn adb_devices() -> Result<Vec<AdbDevice>, String> {
    let adb = find_adb().ok_or("ADB 未找到，请确认已安装 scrcpy 或 Android SDK Platform Tools")?;

    let output = std::process::Command::new(&adb)
        .args(["devices"])
        .output()
        .map_err(|e| format!("ADB 执行失败: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout);
    let mut devices = Vec::new();

    for line in text.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() { continue; }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            devices.push(AdbDevice {
                serial: parts[0].to_string(),
                state: parts[1].to_string(),
            });
        }
    }

    Ok(devices)
}

fn parse_ls_line(line: &str) -> Option<FileEntry> {
    let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    let line = line.trim();
    if line.is_empty() || line.starts_with("total ") {
        return None;
    }

    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 7 { return None; }

    let permissions = parts[0];
    let is_dir = permissions.starts_with('d');
    let size: u64 = parts.get(4).and_then(|s| s.parse().ok()).unwrap_or(0);

    let date_is_month_name = months.contains(&parts[5]);
    let name_start = if date_is_month_name { 8 } else { 7 };
    let name = if name_start < parts.len() {
        parts[name_start..].join(" ")
    } else {
        return None;
    };

    let modified = if date_is_month_name {
        if parts.len() >= 8 {
            format!("{} {} {}", parts[5], parts[6], parts[7])
        } else { String::new() }
    } else {
        if parts.len() >= 7 {
            format!("{} {}", parts[5], parts[6])
        } else { String::new() }
    };

    Some(FileEntry {
        name,
        is_dir,
        size,
        permissions: permissions.to_string(),
        modified,
    })
}

#[tauri::command]
fn adb_file_list(serial: String, path: String) -> Result<Vec<FileEntry>, String> {
    let adb = find_adb().ok_or("ADB 未找到")?;

    let output = std::process::Command::new(&adb)
        .args(["-s", &serial, "shell", "ls", "-a", "-l", &path])
        .output()
        .map_err(|e| format!("列出文件失败: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() && !text.contains("total ") {
        let err_msg = if stderr.is_empty() { text.to_string() } else { stderr.to_string() };
        return Err(format!("列出文件失败: {}", err_msg.trim()));
    }

    let mut entries = Vec::new();
    for line in text.lines() {
        if let Some(entry) = parse_ls_line(line) {
            entries.push(entry);
        }
    }
    Ok(entries)
}

#[tauri::command]
fn adb_file_delete(serial: String, path: String, is_dir: bool) -> Result<(), String> {
    let adb = find_adb().ok_or("ADB 未找到")?;

    let cmd = if is_dir {
        format!("rm -rf '{}'", path)
    } else {
        format!("rm -f '{}'", path)
    };

    let output = std::process::Command::new(&adb)
        .args(["-s", &serial, "shell", &cmd])
        .output()
        .map_err(|e| format!("删除失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("删除失败: {}", stderr.trim()));
    }

    Ok(())
}

#[tauri::command]
fn adb_file_pull(serial: String, remote_path: String, local_path: String) -> Result<(), String> {
    let adb = find_adb().ok_or("ADB 未找到")?;

    let output = std::process::Command::new(&adb)
        .args(["-s", &serial, "pull", &remote_path, &local_path])
        .output()
        .map_err(|e| format!("导出失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if stderr.is_empty() { stdout } else { stderr };
        return Err(format!("导出失败: {}", msg.trim()));
    }

    Ok(())
}

#[tauri::command]
fn save_memo(app: tauri::AppHandle, content: String, deadline_epoch: i64) -> Result<Vec<Memo>, String> {
    let state = app.state::<Mutex<Vec<Memo>>>();
    let mut memos = state.lock().map_err(|e| e.to_string())?;

    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string();

    memos.push(Memo { id, content, deadline_epoch, completed: false });
    save_memos_to_file(&memos);
    Ok(memos.clone())
}

#[tauri::command]
fn load_memos(app: tauri::AppHandle) -> Result<Vec<Memo>, String> {
    let state = app.state::<Mutex<Vec<Memo>>>();
    let memos = state.lock().map_err(|e| e.to_string())?;
    Ok(memos.clone())
}

#[tauri::command]
fn delete_memo(app: tauri::AppHandle, id: String) -> Result<Vec<Memo>, String> {
    let state = app.state::<Mutex<Vec<Memo>>>();
    let mut memos = state.lock().map_err(|e| e.to_string())?;
    memos.retain(|m| m.id != id);
    save_memos_to_file(&memos);
    Ok(memos.clone())
}


fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use std::collections::HashMap;

    let alphabet: Vec<char> =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
            .chars()
            .collect();
    let mut lookup = HashMap::new();
    for (i, &c) in alphabet.iter().enumerate() {
        lookup.insert(c, i as u8);
    }

    let input = input.trim_end_matches('=');
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let chars: Vec<char> = input.chars().collect();

    for chunk in chars.chunks(4) {
        let mut buf = 0u32;
        let mut count = 0;

        for (i, &c) in chunk.iter().enumerate() {
            if c == '=' {
                break;
            }
            let val = lookup
                .get(&c)
                .ok_or_else(|| format!("Invalid base64 character: {}", c))?;
            buf |= (*val as u32) << (18 - i * 6);
            count += 1;
        }

        if count >= 2 {
            output.push((buf >> 16) as u8);
        }
        if count >= 3 {
            output.push((buf >> 8) as u8);
        }
        if count >= 4 {
            output.push(buf as u8);
        }
    }

    Ok(output)
}

fn base64_encode(input: &[u8]) -> String {
    let alphabet: Vec<char> =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
            .chars()
            .collect();
    let mut result = String::with_capacity((input.len() + 2) / 3 * 4);

    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(alphabet[((triple >> 18) & 0x3F) as usize]);
        result.push(alphabet[((triple >> 12) & 0x3F) as usize]);
        if chunk.len() > 1 {
            result.push(alphabet[((triple >> 6) & 0x3F) as usize]);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(alphabet[(triple & 0x3F) as usize]);
        } else {
            result.push('=');
        }
    }

    result
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64_encode(&bytes))
}

// --- PDF commands (lopdf) ---

/// Resolve an object — if it's already a dictionary, return it directly;
/// if it's a reference, look it up.  Returns None on failure.
fn resolve_dict<'a>(doc: &'a lopdf::Document, obj: &'a lopdf::Object) -> Option<&'a lopdf::Dictionary> {
    match obj {
        lopdf::Object::Dictionary(d) => Some(d),
        lopdf::Object::Reference(id) => match doc.get_object(*id) {
            Ok(lopdf::Object::Dictionary(ref d)) => Some(d),
            _ => None,
        },
        _ => None,
    }
}

fn count_pages_in_node(doc: &lopdf::Document, dict: &lopdf::Dictionary, depth: u32) -> usize {
    if depth > 30 {
        return 0;
    }
    // Check /Type
    let is_page = dict
        .get(b"Type")
        .ok()
        .and_then(|o| o.as_name().ok())
        .map_or(false, |n| n == b"Page");
    if is_page {
        return 1;
    }
    // Recurse into /Kids
    if let Ok(lopdf::Object::Array(kids)) = dict.get(b"Kids") {
        let mut total = 0;
        for kid_obj in kids.iter() {
            if let Some(kid_dict) = resolve_dict(doc, kid_obj) {
                total += count_pages_in_node(doc, kid_dict, depth + 1);
            }
        }
        return total;
    }
    0
}

fn get_page_count(doc: &lopdf::Document) -> usize {
    let count = doc.get_pages().len();
    if count > 0 {
        return count;
    }
    // Fallback: walk the page tree from the catalog root
    let root_obj = doc.trailer.get(b"Root").ok();
    if let Some(cat_dict) = root_obj.and_then(|o| resolve_dict(doc, o)) {
        if let Ok(pages_obj) = cat_dict.get(b"Pages") {
            if let Some(pages_dict) = resolve_dict(doc, pages_obj) {
                return count_pages_in_node(doc, pages_dict, 0);
            }
        }
    }
    0
}

#[tauri::command]
fn pdf_page_count(path: String) -> Result<usize, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    let doc = lopdf::Document::load_mem(&bytes).map_err(|e| format!("解析PDF失败: {}", e))?;

    let count = get_page_count(&doc);
    if count == 0 {
        return Err(format!(
            "无法解析该PDF的页面信息（PDF对象总数: {}）。请尝试用其他工具重新保存后再拆分。",
            doc.objects.len()
        ));
    }
    Ok(count)
}

/// Collect all Page object IDs in tree order by walking the page tree.
fn collect_all_page_ids(doc: &lopdf::Document, node: &lopdf::Dictionary, depth: u32) -> Vec<lopdf::ObjectId> {
    if depth > 30 {
        return vec![];
    }
    if let Ok(Ok(n)) = node.get(b"Type").map(|o| o.as_name()) {
        if n == b"Page" {
            return vec![]; // leaf page — caller tracks ID
        }
    }
    if let Ok(lopdf::Object::Array(kids)) = node.get(b"Kids") {
        let mut ids = vec![];
        for kid in kids.iter() {
            if let Ok(id) = kid.as_reference() {
                match doc.get_object(id) {
                    Ok(lopdf::Object::Dictionary(ref d)) => {
                        if d.get(b"Type").ok().and_then(|o| o.as_name().ok()).map_or(false, |n| n == b"Page") {
                            ids.push(id);
                        } else {
                            ids.extend(collect_all_page_ids(doc, d, depth + 1));
                        }
                    }
                    _ => {}
                }
            }
        }
        return ids;
    }
    vec![]
}

/// Rebuild the root Pages node's /Kids to only contain the kept pages (flat list).
fn rebuild_page_tree(doc: &mut lopdf::Document, keep: &std::collections::HashSet<u32>) -> Result<(), String> {
    // Locate the root Pages dictionary
    let root = doc.trailer.get(b"Root").map_err(|e| format!("无Root: {}", e))?;
    let cat = resolve_dict(doc, root).ok_or("Root不是字典")?;
    let pages_obj = cat.get(b"Pages").map_err(|e| format!("无Pages: {}", e))?;
    let pages_dict = resolve_dict(doc, pages_obj).ok_or("Pages不是字典")?;

    // Collect all page object IDs via recursive walk
    let all_ids = collect_all_page_ids(doc, pages_dict, 0);

    // If the pages root directly contains Page objects (flat structure), those are in all_ids already.
    // But some PDFs put Page objects directly in the root Pages node's Kids.
    // Let's also check for that case.
    let mut all_ids = all_ids;
    if let Ok(lopdf::Object::Array(kids)) = pages_dict.get(b"Kids") {
        for kid in kids.iter() {
            if let Ok(id) = kid.as_reference() {
                if let Ok(lopdf::Object::Dictionary(ref d)) = doc.get_object(id) {
                    if d.get(b"Type").ok().and_then(|o| o.as_name().ok()).map_or(false, |n| n == b"Page") {
                        if !all_ids.contains(&id) {
                            all_ids.push(id);
                        }
                    }
                }
            }
        }
    }

    if all_ids.is_empty() {
        return Err("未能找到任何页面对象".into());
    }

    // Collect page IDs from all_ids AND from get_pages() to get complete list
    let mut page_list: Vec<lopdf::ObjectId> = vec![];
    // First try get_pages() — it may have pages the manual walk missed
    for (&_num, &id) in doc.get_pages().iter() {
        if !page_list.contains(&id) {
            page_list.push(id);
        }
    }
    // Then add from manual walk
    for id in &all_ids {
        if !page_list.contains(id) {
            page_list.push(*id);
        }
    }

    if page_list.is_empty() {
        return Err("未能找到任何页面对象".into());
    }

    // Build new Kids array with only kept pages
    let mut new_kids = lopdf::Object::Array(vec![]);
    for (i, &page_id) in page_list.iter().enumerate() {
        let page_num = (i + 1) as u32;
        if keep.contains(&page_num) {
            new_kids.as_array_mut().unwrap().push(lopdf::Object::Reference(page_id));
        }
    }

    // Get the pages root object ID to update it
    let pages_id = match pages_obj {
        lopdf::Object::Reference(id) => *id,
        _ => {
            // Pages is a direct dictionary in catalog — need to handle differently
            // For now, find the pages reference from catalog
            return Err("Pages节点不是引用，暂不支持此结构".into());
        }
    };

    // Update the pages root's Kids and Count
    let new_count = new_kids.as_array().map(|a| a.len() as i64).unwrap_or(0);
    if let Ok(lopdf::Object::Dictionary(ref mut d)) = doc.get_object_mut(pages_id) {
        d.set(b"Kids", new_kids);
        d.set(b"Count", lopdf::Object::Integer(new_count));
    }

    // Remove orphaned page objects from document
    let page_ids_to_remove: Vec<lopdf::ObjectId> = page_list
        .iter()
        .enumerate()
        .filter(|(i, _)| !keep.contains(&((*i + 1) as u32)))
        .map(|(_, &id)| id)
        .collect();
    for id in &page_ids_to_remove {
        doc.objects.remove(id);
    }

    Ok(())
}

#[tauri::command]
fn pdf_extract_pages(path: String, pages: Vec<u32>, output: String) -> Result<(), String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    let mut doc = lopdf::Document::load_mem(&bytes).map_err(|e| format!("解析PDF失败: {}", e))?;

    let total = get_page_count(&doc) as u32;
    if total == 0 {
        return Err("无法读取PDF页数，该文件可能不受支持".into());
    }
    let keep: std::collections::HashSet<u32> = pages.iter().copied().collect();

    let indexed_count = doc.get_pages().len() as u32;
    if indexed_count > 0 {
        let to_delete: Vec<u32> = (1..=indexed_count).filter(|p| !keep.contains(p)).collect();
        if !to_delete.is_empty() {
            doc.delete_pages(&to_delete);
        }
    } else {
        rebuild_page_tree(&mut doc, &keep)?;
    }

    doc.save(&output).map(|_| ()).map_err(|e| format!("保存PDF失败: {}", e))
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

            // --- memo state and background checker ---
            let memos = load_memos_from_file();
            app.manage(Mutex::new(memos));

            
            let memo_handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    let state = memo_handle.state::<Mutex<Vec<Memo>>>();
                    let mut memos = match state.lock() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let now = current_epoch_secs();
                    let mut changed = false;
                    for m in memos.iter_mut() {
                        if !m.completed && m.deadline_epoch <= now {
                            show_memo_notification(&m.content);
                            m.completed = true;
                            changed = true;
                        }
                    }
                    if changed {
                        save_memos_to_file(&memos);
                    }
                    drop(memos);
                }
            });

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![greet, exit_app, show_pet_context_menu, set_always_on_top, set_all_always_on_top, save_file, read_file, pdf_page_count, pdf_extract_pages, schedule_shutdown, cancel_shutdown, scrcpy_check, scrcpy_launch, scrcpy_install, adb_devices, adb_file_list, adb_file_delete, adb_file_pull, save_memo, load_memos, delete_memo])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
