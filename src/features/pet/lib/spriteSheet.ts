import {
  COLOR_TOLERANCE,
  PET_MAX_ANIMATION_RATIO,
  PET_VIEWPORT_HEIGHT,
  PET_VIEWPORT_WIDTH,
  SHEET_COLUMNS,
  SHEET_ROWS,
} from "../config/constants";
import type {
  DrawState,
  Frame,
  PetViewport,
  RgbColor,
} from "../types/pet";

export function extractFrames(sprite: HTMLImageElement): Frame[] {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sprite.width;
  sourceCanvas.height = sprite.height;

  const sourceContext = sourceCanvas.getContext("2d");

  if (!sourceContext) {
    return [];
  }

  sourceContext.drawImage(sprite, 0, 0);
  const fullSheet = sourceContext.getImageData(0, 0, sprite.width, sprite.height);
  const backgroundColors = collectBackgroundColors(
    fullSheet.data,
    sprite.width,
    sprite.height,
  );
  const frames: Frame[] = [];

  for (let row = 0; row < SHEET_ROWS; row += 1) {
    for (let column = 0; column < SHEET_COLUMNS; column += 1) {
      const left = Math.round((column * sprite.width) / SHEET_COLUMNS);
      const right = Math.round(((column + 1) * sprite.width) / SHEET_COLUMNS);
      const top = Math.round((row * sprite.height) / SHEET_ROWS);
      const bottom = Math.round(((row + 1) * sprite.height) / SHEET_ROWS);
      const paddedBounds = { left, top, right, bottom };
      const frameWidth = paddedBounds.right - paddedBounds.left;
      const frameHeight = paddedBounds.bottom - paddedBounds.top;

      if (frameWidth <= 0 || frameHeight <= 0) {
        continue;
      }

      const framePixels = sourceContext.getImageData(
        paddedBounds.left,
        paddedBounds.top,
        frameWidth,
        frameHeight,
      );

      removeBackground(
        framePixels.data,
        frameWidth,
        frameHeight,
        backgroundColors,
      );

      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = frameWidth;
      frameCanvas.height = frameHeight;

      const frameContext = frameCanvas.getContext("2d");

      if (!frameContext) {
        continue;
      }

      frameContext.putImageData(framePixels, 0, 0);
      frames.push({
        bitmap: frameCanvas,
        width: frameWidth,
        height: frameHeight,
        pixels: new Uint8ClampedArray(framePixels.data),
      });
    }
  }

  return frames;
}

export function getPetViewport(frames: Frame[]): PetViewport {
  void frames;

  return {
    width: PET_VIEWPORT_WIDTH,
    height: PET_VIEWPORT_HEIGHT,
  };
}

export function drawFrame(
  context: CanvasRenderingContext2D,
  frame: Frame,
  viewport: PetViewport,
): DrawState {
  context.clearRect(0, 0, viewport.width, viewport.height);

  const maxDrawWidth = viewport.width * PET_MAX_ANIMATION_RATIO;
  const maxDrawHeight = viewport.height * PET_MAX_ANIMATION_RATIO;
  const drawScale = Math.min(
    maxDrawWidth / frame.width,
    maxDrawHeight / frame.height,
    1,
  );
  const drawWidth = frame.width * drawScale;
  const drawHeight = frame.height * drawScale;
  const drawX = (viewport.width - drawWidth) / 2;
  const drawY = (viewport.height - drawHeight) / 2;

  context.drawImage(frame.bitmap, drawX, drawY, drawWidth, drawHeight);

  return {
    frame,
    canvasWidth: viewport.width,
    canvasHeight: viewport.height,
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
    centerX: Math.round(drawX + drawWidth / 2),
    centerY: Math.round(drawY + drawHeight / 2),
  };
}

function collectBackgroundColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): RgbColor[] {
  const colors: RgbColor[] = [];

  for (let row = 0; row < SHEET_ROWS; row += 1) {
    for (let column = 0; column < SHEET_COLUMNS; column += 1) {
      const left = Math.round((column * width) / SHEET_COLUMNS);
      const right = Math.round(((column + 1) * width) / SHEET_COLUMNS) - 1;
      const top = Math.round((row * height) / SHEET_ROWS);
      const bottom = Math.round(((row + 1) * height) / SHEET_ROWS) - 1;
      const inset = 10;
      const samplePoints = [
        [left + inset, top + inset],
        [right - inset, top + inset],
        [left + inset, bottom - inset],
        [right - inset, bottom - inset],
      ];

      for (const [x, y] of samplePoints) {
        const safeX = Math.min(Math.max(x, 0), width - 1);
        const safeY = Math.min(Math.max(y, 0), height - 1);
        const index = (safeY * width + safeX) * 4;
        const color: RgbColor = [data[index], data[index + 1], data[index + 2]];

        if (!colors.some((candidate) => isSimilarColor(color, candidate, 4))) {
          colors.push(color);
        }
      }
    }
  }

  return colors.length > 0 ? colors : [[255, 255, 255]];
}

function removeBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  backgroundColors: RgbColor[],
): void {
  const pixelCount = data.length / 4;
  const visited = new Uint8Array(pixelCount);
  const queue: number[] = [];

  if (width <= 0 || height <= 0 || width * height !== pixelCount) {
    return;
  }

  const enqueueIfBackground = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const pixelIndex = y * width + x;

    if (visited[pixelIndex] === 1) {
      return;
    }

    const colorIndex = pixelIndex * 4;

    if (!isBackgroundPixel(data, colorIndex, backgroundColors)) {
      return;
    }

    visited[pixelIndex] = 1;
    queue.push(pixelIndex);
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x, 0);
    enqueueIfBackground(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    enqueueIfBackground(0, y);
    enqueueIfBackground(width - 1, y);
  }

  while (queue.length > 0) {
    const pixelIndex = queue.pop();

    if (pixelIndex === undefined) {
      continue;
    }

    const colorIndex = pixelIndex * 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    data[colorIndex + 3] = 0;

    enqueueIfBackground(x - 1, y);
    enqueueIfBackground(x + 1, y);
    enqueueIfBackground(x, y - 1);
    enqueueIfBackground(x, y + 1);
  }

  for (let index = 0; index < data.length; index += 4) {
    if (!isBackgroundPixel(data, index, backgroundColors)) {
      continue;
    }

    const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;

    if (brightness > 246) {
      data[index + 3] = 0;
    } else if (brightness > 232) {
      data[index + 3] = Math.min(data[index + 3], 96);
    }
  }
}

function isBackgroundPixel(
  data: Uint8ClampedArray,
  index: number,
  backgroundColors: RgbColor[],
): boolean {
  const color: RgbColor = [data[index], data[index + 1], data[index + 2]];
  const brightness = (color[0] + color[1] + color[2]) / 3;
  const colorSpread = Math.max(...color) - Math.min(...color);

  if (brightness < 210 || colorSpread > 18) {
    return false;
  }

  return backgroundColors.some((candidate) =>
    isSimilarColor(color, candidate, COLOR_TOLERANCE),
  );
}

function isSimilarColor(
  source: RgbColor,
  candidate: RgbColor,
  tolerance: number,
): boolean {
  return (
    Math.abs(source[0] - candidate[0]) <= tolerance &&
    Math.abs(source[1] - candidate[1]) <= tolerance &&
    Math.abs(source[2] - candidate[2]) <= tolerance
  );
}
