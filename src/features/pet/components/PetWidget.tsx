import { useEffect, type MouseEvent } from "react";
import {
  JsonInputPanel,
  useJsonParser,
  type ParsedJsonResult,
} from "../../json-parser";
import { petBubbleAction } from "../config/bubbleAction";
import { usePetAnimation } from "../hooks/usePetAnimation";
import { usePetBubble } from "../hooks/usePetBubble";
import { useStatusMessage } from "../hooks/useStatusMessage";
import {
  ensureTransparentWindow,
  shouldStartWindowDrag,
  startWindowDrag,
} from "../services/windowService";
import { PetBubble } from "./PetBubble";
import { PetCanvas } from "./PetCanvas";
import { PetStatus } from "./PetStatus";
import "./PetWidget.css";

type PetWidgetProps = {
  onJsonParsed: (result: ParsedJsonResult) => void;
};

export function PetWidget({ onJsonParsed }: PetWidgetProps) {
  const { canvasRef, drawStateRef } = usePetAnimation();
  const {
    bubbleVisible,
    bubbleAnchor,
    hideBubble,
    handleCanvasPointerMove,
    handleCanvasPointerLeave,
    handleBubblePointerEnter,
    handleBubblePointerLeave,
  } = usePetBubble(drawStateRef);
  const { statusText, showStatus } = useStatusMessage();
  const {
    panelVisible,
    inputValue,
    errorText,
    openPanel,
    closePanel,
    handleInputChange,
    submitInput,
  } = useJsonParser(onJsonParsed);

  useEffect(() => {
    void ensureTransparentWindow();
  }, []);

  const handleStageMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (panelVisible) {
      closePanel();
    }

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
    showStatus("输入 JSON 吧");
    openPanel();
  };

  const handlePanelMouseDown = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handlePanelSubmit = () => {
    submitInput();
  };

  return (
    <section className="pet-stage" onMouseDown={handleStageMouseDown}>
      <PetStatus text={statusText} />

      <JsonInputPanel
        visible={panelVisible}
        value={inputValue}
        errorText={errorText}
        onChange={handleInputChange}
        onSubmit={handlePanelSubmit}
        onMouseDown={handlePanelMouseDown}
      />

      <PetCanvas
        canvasRef={canvasRef}
        onPointerMove={handleCanvasPointerMove}
        onPointerLeave={handleCanvasPointerLeave}
      />

      <div className="pet-bubble-layer">
        <PetBubble
          action={petBubbleAction}
          anchor={bubbleAnchor}
          visible={bubbleVisible && !panelVisible}
          onMouseDown={handleBubbleMouseDown}
          onPointerEnter={handleBubblePointerEnter}
          onPointerLeave={handleBubblePointerLeave}
          onClick={handleBubbleClick}
        />
      </div>
    </section>
  );
}