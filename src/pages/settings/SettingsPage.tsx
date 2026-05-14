import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readAlwaysOnTop } from "../../features/pet/services/windowService";
import "./SettingsPage.css";

type DisplayPosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

const POSITION_STORAGE_KEY = "t-pet:display-position";
const POSITION_LABELS: Record<DisplayPosition, string> = {
  "bottom-left": "左下角",
  "bottom-right": "右下角",
  "top-left": "左上角",
  "top-right": "右上角",
};

const POSITION_OPTIONS: DisplayPosition[] = [
  "bottom-left",
  "bottom-right",
  "top-left",
  "top-right",
];

function readSavedPosition(): DisplayPosition {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);

    if (raw && POSITION_LABELS[raw as DisplayPosition]) {
      return raw as DisplayPosition;
    }
  } catch {
    // ignore
  }

  return "bottom-left";
}

function savePosition(position: DisplayPosition) {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, position);
  } catch {
    // ignore
  }
}

function saveAlwaysOnTop(onTop: boolean) {
  try {
    localStorage.setItem("t-pet:always-on-top", String(onTop));
  } catch {
    // ignore
  }
}

export function SettingsPage() {
  const [position, setPosition] = useState<DisplayPosition>(readSavedPosition);
  const [alwaysOnTop, setAlwaysOnTop] = useState(readAlwaysOnTop);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setPosition(e.currentTarget.value as DisplayPosition);
  }, []);

  const handleToggleAlwaysOnTop = useCallback(() => {
    setAlwaysOnTop((prev) => !prev);
  }, []);

  const handleConfirm = useCallback(() => {
    // Persist synchronously
    savePosition(position);
    saveAlwaysOnTop(alwaysOnTop);

    // Fire and forget — must not await, to avoid deadlock when the Rust
    // command touches the settings window from its own command handler.
    invoke("set_all_always_on_top", { onTop: alwaysOnTop }).catch(() => {});
    emitTo("main", "settings-position-changed", position).catch(() => {});
    emitTo("main", "settings-always-on-top-changed", alwaysOnTop).catch(() => {});

    void getCurrentWindow().close();
  }, [position, alwaysOnTop]);

  const handleClose = useCallback(() => {
    void getCurrentWindow().close();
  }, []);

  const handleExit = useCallback(() => {
    void invoke("exit_app");
  }, []);

  const handleHeaderMouseDown = useCallback(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }
    void getCurrentWindow().startDragging();
  }, []);

  const handleMinimize = useCallback(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }
    void getCurrentWindow().minimize();
  }, []);

  // Focus trap / keyboard: close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void getCurrentWindow().close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <main className="settings-page">
      <div className="settings-card">
        <div className="settings-header" onMouseDown={handleHeaderMouseDown}>
          <p className="settings-title">设置</p>
          <div className="settings-header-actions">
            <button
              type="button"
              className="settings-minimize"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleMinimize}
              aria-label="最小化"
            >
              ─
            </button>
            <button
              type="button"
              className="settings-close"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleClose}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="settings-body">
          <label className="settings-field">
            <span className="settings-field-label">默认显示位置</span>
            <select
              className="settings-select"
              value={position}
              onChange={handleChange}
            >
              {POSITION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {POSITION_LABELS[opt]}
                </option>
              ))}
            </select>
          </label>

          <div className="settings-field settings-field--toggle">
            <span className="settings-field-label">锁定层级</span>
            <button
              type="button"
              role="switch"
              aria-checked={alwaysOnTop}
              className={`settings-toggle ${alwaysOnTop ? "settings-toggle--on" : ""}`}
              onClick={handleToggleAlwaysOnTop}
            >
              <span className="settings-toggle-thumb" />
            </button>
          </div>
        </div>

        <div className="settings-footer">
          <button
            type="button"
            className="settings-confirm-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleConfirm}
          >
            确定
          </button>
          <button
            type="button"
            className="settings-exit-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleExit}
          >
            退出应用
          </button>
        </div>
      </div>
    </main>
  );
}
