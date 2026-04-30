import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import {
  MENU_CLOSE_DELAY_MS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "../config/constants";
import { getBubbleAnchor } from "../lib/hitTest";
import type { DrawState, MenuAnchor } from "../types/pet";

export function usePetBubble(
  drawStateRef: MutableRefObject<DrawState | null>,
) {
  const closeTimerRef = useRef<number | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleAnchor, setBubbleAnchor] = useState<MenuAnchor>({
    x: STAGE_WIDTH / 2,
    y: STAGE_HEIGHT / 2,
  });

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const hideBubble = () => {
    clearCloseTimer();
    setBubbleVisible(false);
  };

  const scheduleBubbleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setBubbleVisible(false);
    }, MENU_CLOSE_DELAY_MS);
  };

  const handleCanvasPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const anchor = getBubbleAnchor(event, drawStateRef.current);

    if (!anchor) {
      scheduleBubbleClose();
      return;
    }

    clearCloseTimer();
    setBubbleVisible(true);
    setBubbleAnchor((current) =>
      current.x === anchor.x && current.y === anchor.y ? current : anchor,
    );
  };

  const handleCanvasPointerLeave = () => {
    scheduleBubbleClose();
  };

  const handleBubblePointerEnter = () => {
    clearCloseTimer();
  };

  const handleBubblePointerLeave = () => {
    scheduleBubbleClose();
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  return {
    bubbleVisible,
    bubbleAnchor,
    hideBubble,
    handleCanvasPointerMove,
    handleCanvasPointerLeave,
    handleBubblePointerEnter,
    handleBubblePointerLeave,
  };
}