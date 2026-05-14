import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { readAlwaysOnTop } from "../services/windowService";

const FEATURES_WINDOW_LABEL = "features";
const FEATURES_VIEW = "features";
const SCREEN_RATIO = 0.8;

function buildFeaturesWindowUrl(feature?: string) {
  const url = new URL(window.location.href);

  url.searchParams.set("view", FEATURES_VIEW);
  if (feature) {
    url.searchParams.set("feature", feature);
  }
  url.hash = "";

  return url.toString();
}

export function isFeaturesWindowView() {
  const params = new URLSearchParams(window.location.search);

  return params.get("view") === FEATURES_VIEW;
}

async function closeExistingFeaturesWindow() {
  const existingWindow = await WebviewWindow.getByLabel(FEATURES_WINDOW_LABEL);

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

export async function openFeaturesWindow(feature?: string) {
  await closeExistingFeaturesWindow();

  // Get monitor size for 80% calculation
  const monitor = await currentMonitor();
  const scaleFactor = monitor?.scaleFactor ?? 1;
  const monitorSize = monitor?.size.toLogical(scaleFactor);

  const windowWidth = Math.round((monitorSize?.width ?? 1200) * SCREEN_RATIO);
  const windowHeight = Math.round((monitorSize?.height ?? 800) * SCREEN_RATIO);

  const windowRef = new WebviewWindow(FEATURES_WINDOW_LABEL, {
    url: buildFeaturesWindowUrl(feature),
    title: "功能",
    width: windowWidth,
    height: windowHeight,
    minWidth: 420,
    minHeight: 280,
    resizable: true,
    decorations: false,
    transparent: true,
    alwaysOnTop: readAlwaysOnTop(),
    focus: true,
    visible: false,
  });

  await waitForWindowCreation(windowRef);

  // Center on the current monitor
  const logicalSize = new LogicalSize(windowWidth, windowHeight);

  if (monitor) {
    const monitorPos = monitor.position.toLogical(monitor.scaleFactor);
    const workAreaSize = monitor.size.toLogical(monitor.scaleFactor);
    const cx = monitorPos.x + (workAreaSize.width - logicalSize.width) / 2;
    const cy = monitorPos.y + (workAreaSize.height - logicalSize.height) / 2;
    await windowRef.setPosition(new LogicalPosition(cx, cy));
  } else {
    await windowRef.center();
  }

  await windowRef.show();
  await windowRef.setFocus();
}

export async function closeFeaturesWindow() {
  const window = await WebviewWindow.getByLabel(FEATURES_WINDOW_LABEL);

  if (window) {
    await window.close();
  }
}
