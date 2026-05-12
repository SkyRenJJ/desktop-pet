import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import { MENU_CLOSE_DELAY_MS } from "../config/constants";
import { getBubbleAnchor } from "../lib/hitTest";
import type { DrawState, MenuAnchor, PetViewport } from "../types/pet";

export function usePetBubble(
  drawStateRef: MutableRefObject<DrawState | null>,
  viewport: PetViewport,
) {
  const closeTimerRef = useRef<number | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleAnchor, setBubbleAnchor] = useState<MenuAnchor>({
    x: viewport.width / 2,
    y: viewport.height / 2,
  });

  useEffect(() => {
    setBubbleAnchor((current) => {
      const defaultX = Math.round(viewport.width / 2);
      const defaultY = Math.round(viewport.height / 2);

      if (bubbleVisible) {
        return current;
      }

      if (current.x === defaultX && current.y === defaultY) {
        return current;
      }

      return { x: defaultX, y: defaultY };
    });
  }, [bubbleVisible, viewport.height, viewport.width]);

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
