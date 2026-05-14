import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { closeFeaturesWindow } from "../../features/pet/lib/featuresWindow";
import { parseJsonInput } from "../../features/json-parser/lib/parseJsonInput";
import { JsonTree } from "../../features/json-parser";
import type { ParsedJsonResult, JsonValue } from "../../features/json-parser/types/jsonParser";
import "./FeaturesPage.css";

// --- feature registry ---

type FeatureId = "json-parse";

interface FeatureEntry {
  id: FeatureId;
  label: string;
}

const FEATURES: FeatureEntry[] = [
  { id: "json-parse", label: "JSON解析" },
];

const MAIN_WINDOW_LABEL = "main";

function getInitialFeature(): FeatureId {
  const params = new URLSearchParams(window.location.search);
  const feature = params.get("feature") as FeatureId | null;

  if (feature && FEATURES.some((f) => f.id === feature)) {
    return feature;
  }

  return FEATURES[0].id;
}

// --- JSON Parse work area (split: left input, right formatted preview) ---

function JsonParseWorkArea() {
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
      setValue("");
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

  // Live preview: try to parse the current value for tree view
  const liveParsed = useMemo((): JsonValue | null => {
    if (!value.trim()) {
      return null;
    }

    try {
      return JSON.parse(value) as JsonValue;
    } catch {
      return null;
    }
  }, [value]);

  return (
    <div className="features-work-json">
      <div className="features-json-panels">
        <textarea
          ref={textareaRef}
          className="features-json-textarea"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder='例如：{"name":"Kirby","power":"copy"}'
          spellCheck={false}
        />
        <div className="features-json-preview">
          {liveParsed ? (
            <JsonTree value={liveParsed} />
          ) : (
            <span className="features-json-preview-placeholder">格式化预览</span>
          )}
        </div>
      </div>
      <div className="features-json-footer">
        <span className="features-json-error">{errorText}</span>
        <button
          type="button"
          className="features-json-submit"
          onClick={handleSubmit}
        >
          确定
        </button>
      </div>
    </div>
  );
}

// --- work area router ---

function WorkArea({ feature }: { feature: FeatureId }) {
  switch (feature) {
    case "json-parse":
      return <JsonParseWorkArea />;
    default:
      return null;
  }
}

// --- features page ---

export function FeaturesPage() {
  const [activeFeature, setActiveFeature] = useState<FeatureId>(getInitialFeature);
  const [sidebarRatio, setSidebarRatio] = useState(0.25);
  const [dragging, setDragging] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const handleClose = useCallback(() => {
    void closeFeaturesWindow();
  }, []);

  const handleMinimize = useCallback(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }
    void getCurrentWindow().minimize();
  }, []);

  const handleHeaderMouseDown = useCallback(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }
    void getCurrentWindow().startDragging();
  }, []);

  // Sidebar splitter drag
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);

    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = bodyEl.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const ratio = Math.min(0.5, Math.max(0.12, x / rect.width));
      setSidebarRatio(ratio);
    };

    const onMouseUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void closeFeaturesWindow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Listen for always-on-top changes
  useEffect(() => {
    const unlisten = listen<boolean>("settings-always-on-top-changed", (event) => {
      if ("__TAURI_INTERNALS__" in window) {
        void invoke("set_always_on_top", { onTop: event.payload });
      }
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <main className="features-page">
      <div className="features-window">
        {/* header */}
        <div className="features-header" onMouseDown={handleHeaderMouseDown}>
          <p className="features-title">功能</p>
          <div className="features-header-actions">
            <button
              type="button"
              className="features-minimize"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleMinimize}
              aria-label="最小化"
            >
              ─
            </button>
            <button
              type="button"
              className="features-close"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* body: sidebar + splitter + work area */}
        <div
          className={`features-body${dragging ? " is-dragging" : ""}`}
          ref={bodyRef}
        >
          <nav
            className="features-sidebar"
            style={{ width: `${sidebarRatio * 100}%` }}
          >
            {FEATURES.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`features-nav-item${activeFeature === f.id ? " is-active" : ""}`}
                onClick={() => setActiveFeature(f.id)}
              >
                {f.label}
              </button>
            ))}
          </nav>

          <div
            className="features-splitter"
            onMouseDown={handleSplitterMouseDown}
          />

          <div className="features-work-area">
            <WorkArea feature={activeFeature} />
          </div>
        </div>
      </div>
    </main>
  );
}
