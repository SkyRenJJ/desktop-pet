import { useEffect, useState, useRef } from "react";
import kabiSprite from "../../../assets/kabi.png";
import {
  FRAME_DURATION_MS,
  PET_VIEWPORT_HEIGHT,
  PET_VIEWPORT_WIDTH,
} from "../config/constants";
import { drawFrame, extractFrames, getPetViewport } from "../lib/spriteSheet";
import { ensurePetWindowVisible, syncPetWindow } from "../services/windowService";
import type { DrawState, PetViewport } from "../types/pet";

const FALLBACK_VIEWPORT: PetViewport = {
  width: PET_VIEWPORT_WIDTH,
  height: PET_VIEWPORT_HEIGHT,
};

export function usePetAnimation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawStateRef = useRef<DrawState | null>(null);
  const [viewport, setViewport] = useState<PetViewport>(FALLBACK_VIEWPORT);

  useEffect(() => {
    void ensurePetWindowVisible();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    // Try with willReadFrequently but gracefully fallback if unsupported
    let context: CanvasRenderingContext2D | null = null;

    try {
      context = canvas.getContext("2d", { willReadFrequently: true });
    } catch {
      context = canvas.getContext("2d");
    }

    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = true;

    let disposed = false;
    let animationFrameId = 0;

    const sprite = new Image();
    sprite.decoding = "async";

    sprite.onerror = (err) => {
      // eslint-disable-next-line no-console
      console.error("Failed to load pet sprite:", err, "src=", sprite.src);
    };

    sprite.onload = () => {
      if (disposed) {
        return;
      }

      let frames = extractFrames(sprite);

      // If frame extraction failed, fall back to using the full sprite as a single frame
      if (frames.length === 0) {
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = sprite.width;
        frameCanvas.height = sprite.height;
        const frameCtx = frameCanvas.getContext("2d");

        if (frameCtx) {
          frameCtx.drawImage(sprite, 0, 0);
          frames = [
            {
              bitmap: frameCanvas,
              width: sprite.width,
              height: sprite.height,
              pixels: new Uint8ClampedArray(),
            },
          ];
        }
      }

      if (frames.length === 0) {
        // Nothing to draw; keep fallback viewport but log for debugging
        // eslint-disable-next-line no-console
        console.warn("Pet sprite loaded but no frames could be extracted.");
        return;
      }

      const nextViewport = getPetViewport(frames);
      canvas.width = nextViewport.width;
      canvas.height = nextViewport.height;
      setViewport(nextViewport);
      void syncPetWindow(nextViewport);

      let currentFrameIndex = 0;
      let lastAdvanceTime = 0;
      drawStateRef.current = drawFrame(context, frames[currentFrameIndex], nextViewport);

      // 调试：初始绘制红色空心圆
      {
        const ds = drawStateRef.current;
        if (ds) {
          context.save();
          context.strokeStyle = "red";
          context.lineWidth = 2;
          context.beginPath();
          context.arc(ds.centerX, ds.centerY, 75, 0, Math.PI * 2);
          context.stroke();
          context.beginPath();
          context.moveTo(ds.centerX - 8, ds.centerY);
          context.lineTo(ds.centerX + 8, ds.centerY);
          context.moveTo(ds.centerX, ds.centerY - 8);
          context.lineTo(ds.centerX, ds.centerY + 8);
          context.stroke();
          context.restore();
        }
      }

      const render = (timestamp: number) => {
        if (disposed) {
          return;
        }

        if (lastAdvanceTime === 0) {
          lastAdvanceTime = timestamp;
        }

        const elapsed = timestamp - lastAdvanceTime;

        if (elapsed >= FRAME_DURATION_MS) {
          const steps = Math.floor(elapsed / FRAME_DURATION_MS);
          currentFrameIndex = (currentFrameIndex + steps) % frames.length;
          lastAdvanceTime += steps * FRAME_DURATION_MS;
        }

        drawStateRef.current = drawFrame(
          context!,
          frames[currentFrameIndex],
          nextViewport,
        );

        // 调试：动画中心红色空心圆
        const ds = drawStateRef.current;
        if (ds) {
          context!.save();
          context!.strokeStyle = "red";
          context!.lineWidth = 2;
          context!.beginPath();
          context!.arc(ds.centerX, ds.centerY, 75, 0, Math.PI * 2);
          context!.stroke();
          // 中心十字标记
          context!.beginPath();
          context!.moveTo(ds.centerX - 8, ds.centerY);
          context!.lineTo(ds.centerX + 8, ds.centerY);
          context!.moveTo(ds.centerX, ds.centerY - 8);
          context!.lineTo(ds.centerX, ds.centerY + 8);
          context!.stroke();
          context!.restore();
        }

        animationFrameId = window.requestAnimationFrame(render);
      };

      animationFrameId = window.requestAnimationFrame(render);
    };

    sprite.src = kabiSprite;

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return { canvasRef, drawStateRef, viewport };
}
