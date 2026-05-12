import type { PointerEvent } from "react";
import {
  HIT_ALPHA_THRESHOLD,
  PET_BUBBLE_MARGIN,
  PET_BUBBLE_SIZE,
} from "../config/constants";
import type { DrawState, MenuAnchor } from "../types/pet";

export function getBubbleAnchor(
  event: PointerEvent<HTMLCanvasElement>,
  drawState: DrawState | null,
): MenuAnchor | null {
  if (!drawState) {
    return null;
  }

  const rect = event.currentTarget.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) {
    return null;
  }

  const canvasX = ((event.clientX - rect.left) / rect.width) * drawState.canvasWidth;
  const canvasY = ((event.clientY - rect.top) / rect.height) * drawState.canvasHeight;

  if (
    canvasX < drawState.x ||
    canvasX > drawState.x + drawState.width ||
    canvasY < drawState.y ||
    canvasY > drawState.y + drawState.height
  ) {
    return null;
  }

  const sourceX = Math.max(
    0,
    Math.min(
      drawState.frame.width - 1,
      Math.floor(((canvasX - drawState.x) / drawState.width) * drawState.frame.width),
    ),
  );
  const sourceY = Math.max(
    0,
    Math.min(
      drawState.frame.height - 1,
      Math.floor(
        ((canvasY - drawState.y) / drawState.height) * drawState.frame.height,
      ),
    ),
  );
  const alphaIndex = (sourceY * drawState.frame.width + sourceX) * 4 + 3;

  if (drawState.frame.pixels[alphaIndex] < HIT_ALPHA_THRESHOLD) {
    return null;
  }

  const stageElement = event.currentTarget.parentElement;

  if (!(stageElement instanceof HTMLElement)) {
    return null;
  }

  const stageRect = stageElement.getBoundingClientRect();
  const scaleX = rect.width / drawState.canvasWidth;
  const scaleY = rect.height / drawState.canvasHeight;
  const bubbleRadius = PET_BUBBLE_SIZE / 2;
  const minAnchorX = bubbleRadius + PET_BUBBLE_MARGIN;
  const maxAnchorX = drawState.canvasWidth - bubbleRadius - PET_BUBBLE_MARGIN;
  const minAnchorY = bubbleRadius + PET_BUBBLE_MARGIN;
  const maxAnchorY = drawState.canvasHeight - bubbleRadius - PET_BUBBLE_MARGIN;
  const preferredAnchorX = drawState.x + drawState.width / 2;
  const preferredAnchorY = drawState.y - bubbleRadius - PET_BUBBLE_MARGIN;
  const anchorCanvasX = clamp(preferredAnchorX, minAnchorX, maxAnchorX);
  const anchorCanvasY = clamp(preferredAnchorY, minAnchorY, maxAnchorY);

  return {
    x: Math.round(rect.left - stageRect.left + anchorCanvasX * scaleX),
    y: Math.round(rect.top - stageRect.top + anchorCanvasY * scaleY),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
