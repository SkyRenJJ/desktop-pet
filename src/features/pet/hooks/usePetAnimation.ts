import { useEffect, useRef } from "react";
import kabiSprite from "../../../assets/kabi.png";
import { FRAME_DURATION_MS } from "../config/constants";
import { drawFrame, extractFrames } from "../lib/spriteSheet";
import type { DrawState } from "../types/pet";

export function usePetAnimation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawStateRef = useRef<DrawState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = true;

    let disposed = false;
    let animationFrameId = 0;

    const sprite = new Image();
    sprite.decoding = "async";

    sprite.onload = () => {
      if (disposed) {
        return;
      }

      const frames = extractFrames(sprite);

      if (frames.length === 0) {
        return;
      }

      let currentFrameIndex = 0;
      let lastAdvanceTime = 0;
      drawStateRef.current = drawFrame(context, frames[currentFrameIndex]);

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

        drawStateRef.current = drawFrame(context, frames[currentFrameIndex]);
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

  return { canvasRef, drawStateRef };
}