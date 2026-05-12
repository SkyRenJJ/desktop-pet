import type { MouseEvent } from "react";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import type { PetViewport } from "../types/pet";

const WINDOW_MARGIN = 12;

export async function ensurePetWindowVisible() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  const currentWindow = getCurrentWindow();

  await Promise.allSettled([
    currentWindow.show(),
    currentWindow.setFocus(),
  ]);
}

export async function syncPetWindow(viewport: PetViewport) {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  const currentWindow = getCurrentWindow();
  const [innerSize, outerSize, scaleFactor] = await Promise.all([
    currentWindow.innerSize(),
    currentWindow.outerSize(),
    currentWindow.scaleFactor(),
  ]);
  const logicalInnerSize = innerSize.toLogical(scaleFactor);
  const logicalOuterSize = outerSize.toLogical(scaleFactor);
  const widthDelta = Math.max(0, logicalOuterSize.width - logicalInnerSize.width);
  const heightDelta = Math.max(0, logicalOuterSize.height - logicalInnerSize.height);
  const nextWindowSize = new LogicalSize(
    viewport.width + widthDelta,
    viewport.height + heightDelta,
  );

  await currentWindow.setSize(nextWindowSize);

  const monitor = await currentMonitor();

  if (monitor) {
    const monitorPosition = monitor.position.toLogical(monitor.scaleFactor);
    const workAreaSize = monitor.size.toLogical(monitor.scaleFactor);
    const nextX = monitorPosition.x + WINDOW_MARGIN;
    const nextY =
      monitorPosition.y + workAreaSize.height - nextWindowSize.height - WINDOW_MARGIN;

    await currentWindow.setPosition(new LogicalPosition(nextX, nextY));
  }

  await ensurePetWindowVisible();
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
