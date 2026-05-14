import { LogicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { readAlwaysOnTop } from "../services/windowService";

const SETTINGS_WINDOW_LABEL = "settings";
const SETTINGS_VIEW = "settings";

function buildSettingsWindowUrl() {
  const url = new URL(window.location.href);

  url.searchParams.set("view", SETTINGS_VIEW);
  url.hash = "";

  return url.toString();
}

export function isSettingsWindowView() {
  const params = new URLSearchParams(window.location.search);

  return params.get("view") === SETTINGS_VIEW;
}

async function closeExistingSettingsWindow() {
  const existingWindow = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);

  if (existingWindow) {
    await existingWindow.close();
  }
}

async function waitForWindowCreation(windowRef: WebviewWindow) {
  const created = new Promise<void>((resolve) => {
    void windowRef.once("tauri://created", () => {
      resolve();
    });
  });

  const failed = new Promise<never>((_, reject) => {
    void windowRef.once("tauri://error", (event) => {
      reject(new Error(String(event.payload)));
    });
  });

  await Promise.race([created, failed]);
}

export interface SettingsWindowAnchor {
  /** screen x of the trigger element center */
  screenX: number;
  /** screen y of the trigger element center */
  screenY: number;
}

export async function openSettingsWindow(anchor: SettingsWindowAnchor) {
  await closeExistingSettingsWindow();

  const windowRef = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
    url: buildSettingsWindowUrl(),
    title: "设置",
    width: 280,
    height: 220,
    resizable: false,
    decorations: false,
    transparent: true,
    alwaysOnTop: readAlwaysOnTop(),
    focus: true,
    visible: false,
  });

  await waitForWindowCreation(windowRef);

  // Position the settings window above the trigger bubble
  const scaleFactor = await windowRef.scaleFactor();
  const size = await windowRef.outerSize();
  const logicalSize = size.toLogical(scaleFactor);

  const windowX = anchor.screenX - logicalSize.width / 2;
  const windowY = anchor.screenY - logicalSize.height - 10;

  await windowRef.setPosition(new LogicalPosition(windowX, windowY));
  await windowRef.show();
  await windowRef.setFocus();
}

export async function closeSettingsWindow() {
  const window = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);

  if (window) {
    await window.close();
  }
}
