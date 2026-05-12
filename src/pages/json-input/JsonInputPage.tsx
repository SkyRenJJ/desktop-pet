import { useCallback, useEffect, useRef, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { parseJsonInput } from "../../features/json-parser/lib/parseJsonInput";
import { closeJsonInputWindow } from "../../features/json-parser/lib/jsonInputWindow";
import type { ParsedJsonResult } from "../../features/json-parser/types/jsonParser";
import "./JsonInputPage.css";

const MAIN_WINDOW_LABEL = "main";

export function JsonInputPage() {
  const [value, setValue] = useState("");
  const [errorText, setErrorText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.currentTarget.value);

    if (errorText) {
      setErrorText("");
    }
  }, [errorText]);

  const handleSubmit = useCallback(async () => {
    try {
      const result: ParsedJsonResult = parseJsonInput(value);
      await emitTo(MAIN_WINDOW_LABEL, "json-input-submitted", result);
      setErrorText("");
      await closeJsonInputWindow();
    } catch (error) {
      if (error instanceof Error) {
        setErrorText(error.message);
      } else {
        setErrorText("输入内容不是合法的 JSON");
      }
    }
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSubmit();
    }
  }, [handleSubmit]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <main className="json-input-page">
      <div className="json-input-card">
        <div className="json-input-header">
          <p className="json-input-title">JSON解析</p>
          <button
            type="button"
            className="json-input-close"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => void closeJsonInputWindow()}
          >
            ✕
          </button>
        </div>

        <textarea
          ref={textareaRef}
          className="json-input-field"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder='例如：{"name":"Kirby","power":"copy"}'
          spellCheck={false}
        />

        <div className="json-input-footer">
          <span className="json-input-error">{errorText}</span>

          <button
            type="button"
            className="json-input-submit"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleSubmit}
          >
            确定
          </button>
        </div>
      </div>
    </main>
  );
}
