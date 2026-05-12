import { useEffect, type MouseEvent } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ParsedJsonResult } from "../../json-parser";
import { openJsonInputWindow } from "../../json-parser";
import { petBubbleAction, petSettingsAction } from "../config/bubbleAction";
import { usePetAnimation } from "../hooks/usePetAnimation";
import { usePetBubble } from "../hooks/usePetBubble";
import { useStatusMessage } from "../hooks/useStatusMessage";
import { shouldStartWindowDrag, startWindowDrag } from "../services/windowService";
import { PetBubble } from "./PetBubble";
import { PetCanvas } from "./PetCanvas";
import { PetStatus } from "./PetStatus";
import "./PetWidget.css";

type PetWidgetProps = {
  onJsonParsed: (result: ParsedJsonResult) => void;
};

export function PetWidget({ onJsonParsed }: PetWidgetProps) {
  const { canvasRef, drawStateRef, viewport } = usePetAnimation();
  const {
    bubbleVisible,
    bubbleAnchor,
    hideBubble,
    handleCanvasPointerMove,
    handleCanvasPointerLeave,
    handleBubblePointerEnter,
    handleBubblePointerLeave,
  } = usePetBubble(drawStateRef, viewport);
  const { statusText } = useStatusMessage();

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<ParsedJsonResult>("json-input-submitted", (event) => {
        onJsonParsed(event.payload);
      });
    };

    void setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [onJsonParsed]);

  const handleStageMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (!shouldStartWindowDrag(event)) {
      return;
    }

    void startWindowDrag();
  };

  const handleBubbleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleBubbleClick = () => {
    hideBubble();
    void openJsonInputWindow();
  };

  const handleSettingsClick = () => {
    // 设置功能待实现
  };

  return (
    <section
      className="pet-stage"
      style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
      onMouseDown={handleStageMouseDown}
    >
      <PetStatus text={statusText} />

      <PetCanvas
        canvasRef={canvasRef}
        viewport={viewport}
        onPointerMove={handleCanvasPointerMove}
        onPointerLeave={handleCanvasPointerLeave}
      />

      <div className="pet-bubble-layer">
        <PetBubble
          action={petBubbleAction}
          anchor={bubbleAnchor}
          visible={bubbleVisible}
          onMouseDown={handleBubbleMouseDown}
          onPointerEnter={handleBubblePointerEnter}
          onPointerLeave={handleBubblePointerLeave}
          onClick={handleBubbleClick}
        />
        <PetBubble
          action={petSettingsAction}
          anchor={bubbleAnchor}
          visible={bubbleVisible}
          className="pet-bubble--settings"
          onMouseDown={handleBubbleMouseDown}
          onPointerEnter={handleBubblePointerEnter}
          onPointerLeave={handleBubblePointerLeave}
          onClick={handleSettingsClick}
        />
      </div>
    </section>
  );
}
