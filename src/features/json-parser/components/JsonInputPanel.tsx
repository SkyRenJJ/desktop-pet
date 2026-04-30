import { useEffect, useRef, type ChangeEvent, type MouseEvent } from "react";
import "./JsonInputPanel.css";

type JsonInputPanelProps = {
  visible: boolean;
  value: string;
  errorText: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onMouseDown: (event: MouseEvent<HTMLElement>) => void;
};

export function JsonInputPanel({
  visible,
  value,
  errorText,
  onChange,
  onSubmit,
  onMouseDown,
}: JsonInputPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (visible) {
      textareaRef.current?.focus();
    }
  }, [visible]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.currentTarget.value);
  };

  return (
    <section
      className={`json-input-panel${visible ? " is-visible" : ""}`}
      data-pet-interactive="true"
      onMouseDown={onMouseDown}
    >
      <div className="json-input-card">
        <p className="json-input-title">JSON解析</p>

        <textarea
          ref={textareaRef}
          className="json-input-field"
          value={value}
          onChange={handleChange}
          placeholder='例如：{"name":"Kirby","power":"copy"}'
          spellCheck={false}
          data-pet-interactive="true"
        />

        <div className="json-input-footer">
          <span className="json-input-error">{errorText}</span>

          <button
            type="button"
            className="json-input-submit"
            data-pet-interactive="true"
            onMouseDown={onMouseDown}
            onClick={onSubmit}
          >
            确定
          </button>
        </div>
      </div>
    </section>
  );
}