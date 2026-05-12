import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const JSON_INPUT_WINDOW_LABEL = "json-input";
const JSON_INPUT_VIEW = "json-input";

function buildJsonInputWindowUrl() {
  const url = new URL(window.location.href);

  url.searchParams.set("view", JSON_INPUT_VIEW);
  url.hash = "";

  return url.toString();
}

export function isJsonInputWindowView() {
  const params = new URLSearchParams(window.location.search);

  return params.get("view") === JSON_INPUT_VIEW;
}

async function closeExistingInputWindow() {
  const existingWindow = await WebviewWindow.getByLabel(JSON_INPUT_WINDOW_LABEL);

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

export async function openJsonInputWindow() {
  await closeExistingInputWindow();

  const windowRef = new WebviewWindow(JSON_INPUT_WINDOW_LABEL, {
    url: buildJsonInputWindowUrl(),
    title: "JSON解析",
    width: 320,
    height: 280,
    minWidth: 280,
    minHeight: 240,
    center: true,
    resizable: false,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    focus: true,
  });

  await waitForWindowCreation(windowRef);
}

export async function closeJsonInputWindow() {
  const window = await WebviewWindow.getByLabel(JSON_INPUT_WINDOW_LABEL);

  if (window) {
    await window.close();
  }
}
