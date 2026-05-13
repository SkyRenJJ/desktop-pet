import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { closeSettingsWindow } from "../../features/pet/lib/settingsWindow";
import "./SettingsPage.css";

type DisplayPosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

const POSITION_STORAGE_KEY = "t-pet:display-position";
const MAIN_WINDOW_LABEL = "main";
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

export function SettingsPage() {
  const [position, setPosition] = useState<DisplayPosition>(readSavedPosition);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setPosition(e.currentTarget.value as DisplayPosition);
  }, []);

  const handleConfirm = useCallback(async () => {
    savePosition(position);

    // Notify main window to reposition immediately
    await emitTo(MAIN_WINDOW_LABEL, "settings-position-changed", position);
    await closeSettingsWindow();
  }, [position]);

  const handleClose = useCallback(() => {
    void closeSettingsWindow();
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

  // Focus trap / keyboard: close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void closeSettingsWindow();
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
          <button
            type="button"
            className="settings-close"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleClose}
          >
            ✕
          </button>
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
