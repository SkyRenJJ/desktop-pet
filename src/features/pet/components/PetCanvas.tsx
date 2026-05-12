import type {
  PointerEventHandler,
  RefObject,
} from "react";
import type { PetViewport } from "../types/pet";

type PetCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewport: PetViewport;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerLeave: PointerEventHandler<HTMLCanvasElement>;
};

export function PetCanvas({
  canvasRef,
  viewport,
  onPointerMove,
  onPointerLeave,
}: PetCanvasProps) {
  return (
    <canvas
      ref={canvasRef}
      className="pet-canvas"
      width={viewport.width}
      height={viewport.height}
      style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
      aria-label="Animated desktop pet"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    />
  );
}
