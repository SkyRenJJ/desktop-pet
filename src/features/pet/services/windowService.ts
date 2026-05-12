import type { MouseEvent } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PetViewport } from "../types/pet";

export async function syncPetWindow(viewport: PetViewport) {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  const currentWindow = getCurrentWindow();

  await Promise.allSettled([
    currentWindow.setSize(new LogicalSize(viewport.width, viewport.height)),
    currentWindow.show(),
    currentWindow.setFocus(),
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
