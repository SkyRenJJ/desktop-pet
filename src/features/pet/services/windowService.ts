import type { MouseEvent } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function ensureTransparentWindow() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  await Promise.allSettled([
    getCurrentWindow().setBackgroundColor([0, 0, 0, 0]),
    getCurrentWebviewWindow().setBackgroundColor([0, 0, 0, 0]),
  ]);
}

export function shouldStartWindowDrag(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0 || !("__TAURI_INTERNALS__" in window)) {
    return false;
  }

  if (event.target instanceof HTMLElement) {
    return !event.target.closest("[data-pet-interactive='true']");
  }

  return true;
}

export async function startWindowDrag() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  await getCurrentWindow().startDragging();
}