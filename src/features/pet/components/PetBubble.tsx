import type {
  CSSProperties,
  MouseEventHandler,
  PointerEventHandler,
} from "react";
import type { BubbleAction, MenuAnchor } from "../types/pet";

type PetBubbleProps = {
  action: BubbleAction;
  anchor: MenuAnchor;
  visible: boolean;
  onClick: () => void;
  onMouseDown: MouseEventHandler<HTMLButtonElement>;
  onPointerEnter: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave: PointerEventHandler<HTMLButtonElement>;
};

export function PetBubble({
  action,
  anchor,
  visible,
  onClick,
  onMouseDown,
  onPointerEnter,
  onPointerLeave,
}: PetBubbleProps) {
  const style = {
    left: `${anchor.x}px`,
    top: `${anchor.y}px`,
    "--bubble-x": `${action.offsetX}px`,
    "--bubble-y": `${action.offsetY}px`,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`pet-bubble${visible ? " is-visible" : ""}`}
      style={style}
      data-pet-action="true"
      data-pet-interactive="true"
      onMouseDown={onMouseDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      {action.label}
    </button>
  );
}