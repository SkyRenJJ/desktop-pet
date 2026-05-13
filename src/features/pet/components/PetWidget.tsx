import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ParsedJsonResult } from "../../json-parser";
import { openJsonInputWindow } from "../../json-parser";
import { petBubbleAction, petSettingsAction } from "../config/bubbleAction";
import { usePetAnimation } from "../hooks/usePetAnimation";
import { usePetBubble } from "../hooks/usePetBubble";
import { useStatusMessage } from "../hooks/useStatusMessage";
import { openSettingsWindow } from "../lib/settingsWindow";
import { shouldStartWindowDrag, startWindowDrag, moveToDisplayPosition } from "../services/windowService";
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
  const onJsonParsedRef = useRef(onJsonParsed);
  onJsonParsedRef.current = onJsonParsed;

  useEffect(() => {
    let unlistenJson: UnlistenFn | undefined;
    let unlistenPosition: UnlistenFn | undefined;
    let unlistenTrayJson: UnlistenFn | undefined;

    const setupListeners = async () => {
      unlistenJson = await listen<ParsedJsonResult>("json-input-submitted", (event) => {
        onJsonParsedRef.current(event.payload);
      });

      unlistenPosition = await listen<string>("settings-position-changed", (event) => {
        void moveToDisplayPosition(
          event.payload as "bottom-left" | "bottom-right" | "top-left" | "top-right",
        );
      });

      unlistenTrayJson = await listen("tray-open-json-input", () => {
        void openJsonInputWindow();
      });
    };

    void setupListeners();

    return () => {
      if (unlistenJson) {
        unlistenJson();
      }
      if (unlistenPosition) {
        unlistenPosition();
      }
      if (unlistenTrayJson) {
        unlistenTrayJson();
      }
    };
  }, []);

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

  const handleSettingsClick = useCallback(async () => {
    hideBubble();

    const ds = drawStateRef.current;

    if (!ds) {
      return;
    }

    // Calculate screen position: main window position + pet center + bubble offset
    const mainWindow = getCurrentWindow();
    const scaleFactor = await mainWindow.scaleFactor();
    const outerPos = await mainWindow.outerPosition();
    const logicalPos = outerPos.toLogical(scaleFactor);

    const screenX = logicalPos.x + ds.centerX + petSettingsAction.offsetX;
    const screenY = logicalPos.y + ds.centerY + petSettingsAction.offsetY;

    await openSettingsWindow({ screenX, screenY });
  }, [hideBubble, drawStateRef]);

  const handleContextMenu = useCallback((e: MouseEvent<HTMLElement>) => {
    e.preventDefault();

    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    void invoke("show_pet_context_menu");
  }, []);

  return (
    <section
      className="pet-stage"
      style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
      onMouseDown={handleStageMouseDown}
      onContextMenu={handleContextMenu}
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
