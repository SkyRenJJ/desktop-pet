import type {
  PointerEventHandler,
  RefObject,
} from "react";
import { CANVAS_SIZE } from "../config/constants";

type PetCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerLeave: PointerEventHandler<HTMLCanvasElement>;
};

export function PetCanvas({
  canvasRef,
  onPointerMove,
  onPointerLeave,
}: PetCanvasProps) {
  return (
    <canvas
      ref={canvasRef}
      className="pet-canvas"
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      aria-label="Animated desktop pet"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    />
  );
}