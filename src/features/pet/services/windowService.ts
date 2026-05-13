import type { MouseEvent } from "react";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import type { PetViewport } from "../types/pet";

const WINDOW_MARGIN = 12;
const POSITION_STORAGE_KEY = "t-pet:window-position";
const DISPLAY_POSITION_KEY = "t-pet:display-position";

type DisplayPosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

interface SavedPosition {
  x: number;
  y: number;
}

function persistWindowPosition(x: number, y: number) {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {
    // localStorage 不可用时静默忽略
  }
}

function readSavedPosition(): SavedPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SavedPosition>;

    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }

    return null;
  } catch {
    return null;
  }
}

function readDisplayPosition(): DisplayPosition {
  try {
    const raw = localStorage.getItem(DISPLAY_POSITION_KEY);
    const valid: DisplayPosition[] = [
      "bottom-left", "bottom-right", "top-left", "top-right",
    ];

    if (raw && (valid as string[]).includes(raw)) {
      return raw as DisplayPosition;
    }
  } catch {
    // ignore
  }

  return "bottom-left";
}

function computeDefaultPosition(
  monitorX: number,
  monitorY: number,
  workWidth: number,
  workHeight: number,
  windowWidth: number,
  windowHeight: number,
  position: DisplayPosition,
): LogicalPosition {
  const margin = WINDOW_MARGIN;
  let x: number;
  let y: number;

  switch (position) {
    case "top-left":
      x = monitorX + margin;
      y = monitorY + margin;
      break;
    case "top-right":
      x = monitorX + workWidth - windowWidth - margin;
      y = monitorY + margin;
      break;
    case "bottom-right":
      x = monitorX + workWidth - windowWidth - margin;
      y = monitorY + workHeight - windowHeight - margin;
      break;
    case "bottom-left":
    default:
      x = monitorX + margin;
      y = monitorY + workHeight - windowHeight - margin;
      break;
  }

  return new LogicalPosition(x, y);
}

export async function installWindowPositionPersistence() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  const currentWindow = getCurrentWindow();

  void currentWindow.onMoved((event) => {
    persistWindowPosition(event.payload.x, event.payload.y);
  });
}

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

  const savedPosition = readSavedPosition();

  if (savedPosition) {
    await currentWindow.setPosition(
      new LogicalPosition(savedPosition.x / scaleFactor, savedPosition.y / scaleFactor),
    );
  } else {
    const monitor = await currentMonitor();

    if (monitor) {
      const monitorPosition = monitor.position.toLogical(monitor.scaleFactor);
      const workAreaSize = monitor.size.toLogical(monitor.scaleFactor);
      const displayPosition = readDisplayPosition();
      const nextPos = computeDefaultPosition(
        monitorPosition.x,
        monitorPosition.y,
        workAreaSize.width,
        workAreaSize.height,
        nextWindowSize.width,
        nextWindowSize.height,
        displayPosition,
      );

      await currentWindow.setPosition(nextPos);
    }
  }

  await ensurePetWindowVisible();
}

export async function moveToDisplayPosition(position: DisplayPosition) {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  // Clear saved drag position so display position takes effect
  try {
    localStorage.removeItem(POSITION_STORAGE_KEY);
  } catch {
    // ignore
  }

  try {
    localStorage.setItem(DISPLAY_POSITION_KEY, position);
  } catch {
    // ignore
  }

  const currentWindow = getCurrentWindow();
  const [outerSize, scaleFactor] = await Promise.all([
    currentWindow.outerSize(),
    currentWindow.scaleFactor(),
  ]);
  const logicalOuterSize = outerSize.toLogical(scaleFactor);
  const monitor = await currentMonitor();

  if (monitor) {
    const monitorPosition = monitor.position.toLogical(monitor.scaleFactor);
    const workAreaSize = monitor.size.toLogical(monitor.scaleFactor);
    const nextPos = computeDefaultPosition(
      monitorPosition.x,
      monitorPosition.y,
      workAreaSize.width,
      workAreaSize.height,
      logicalOuterSize.width,
      logicalOuterSize.height,
      position,
    );

    await currentWindow.setPosition(nextPos);
  }
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
