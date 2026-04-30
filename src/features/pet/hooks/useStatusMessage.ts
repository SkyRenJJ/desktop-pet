import { useEffect, useRef, useState } from "react";
import { STATUS_RESET_DELAY_MS } from "../config/constants";

export function useStatusMessage() {
  const statusTimerRef = useRef<number | null>(null);
  const [statusText, setStatusText] = useState("");

  const showStatus = (text: string) => {
    setStatusText(text);

    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }

    statusTimerRef.current = window.setTimeout(() => {
      setStatusText("");
      statusTimerRef.current = null;
    }, STATUS_RESET_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, []);

  return { statusText, showStatus };
}