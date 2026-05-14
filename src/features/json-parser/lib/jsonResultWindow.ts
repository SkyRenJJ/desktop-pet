import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { readAlwaysOnTop } from "../../pet/services/windowService";
import type { ParsedJsonResult } from "../types/jsonParser";

const JSON_RESULT_WINDOW_LABEL = "json-result";
const JSON_RESULT_STORAGE_KEY = "t-pet:json-result";
const JSON_RESULT_VIEW = "json-result";

function buildJsonResultWindowUrl() {
  const url = new URL(window.location.href);

  url.searchParams.set("view", JSON_RESULT_VIEW);
  url.hash = "";

  return url.toString();
}

export function isJsonResultWindowView() {
  const params = new URLSearchParams(window.location.search);

  return params.get("view") === JSON_RESULT_VIEW;
}

export function readStoredJsonResult() {
  const value = window.localStorage.getItem(JSON_RESULT_STORAGE_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as ParsedJsonResult;
  } catch {
    return null;
  }
}

function storeJsonResult(result: ParsedJsonResult) {
  window.localStorage.setItem(JSON_RESULT_STORAGE_KEY, JSON.stringify(result));
}

async function closeExistingResultWindow() {
  const existingWindow = await WebviewWindow.getByLabel(JSON_RESULT_WINDOW_LABEL);

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

export async function openJsonResultWindow(result: ParsedJsonResult) {
  storeJsonResult(result);
  await closeExistingResultWindow();

  const windowRef = new WebviewWindow(JSON_RESULT_WINDOW_LABEL, {
    url: buildJsonResultWindowUrl(),
    title: "JSON解析结果",
    width: 980,
    height: 640,
    minWidth: 760,
    minHeight: 420,
    center: true,
    resizable: true,
    decorations: false,
    transparent: false,
    alwaysOnTop: readAlwaysOnTop(),
    focus: true,
  });

  await waitForWindowCreation(windowRef);
}