import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { JsonTree, readStoredJsonResult, type JsonValue } from "../../features/json-parser";
import "./JsonResultPage.css";

export function JsonResultPage() {
  const initialResult = useMemo(() => readStoredJsonResult(), []);
  const [result] = useState(initialResult);

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

  const parsedJsonState = useMemo(() => {
    if (!result) {
      return { isParsed: false, value: null as JsonValue | null };
    }

    try {
      return {
        isParsed: true,
        value: JSON.parse(result.formattedJson) as JsonValue,
      };
    } catch {
      return { isParsed: false, value: null as JsonValue | null };
    }
  }, [result]);

  const handleMinimize = () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }
    void getCurrentWebviewWindow().minimize();
  };

  const handleClose = () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      window.close();
      return;
    }

    void getCurrentWebviewWindow().close();
  };

  return (
    <main className="json-result-page">
      <section className="json-result-card">
        <header className="json-result-header" data-tauri-drag-region>
          <div className="json-result-heading">
            <p className="json-result-kicker">JSON 解析结果</p>
            <h1 className="json-result-title">新窗口查看</h1>
          </div>

          <div className="json-result-header-actions">
            <button
              type="button"
              className="json-result-minimize"
              onClick={handleMinimize}
              aria-label="最小化"
            >
              ─
            </button>
            <button
              type="button"
              className="json-result-close"
              onClick={handleClose}
              aria-label="关闭窗口"
            >
              ×
            </button>
          </div>
        </header>

        <section className="json-result-grid">
          <article className="json-result-panel">
            <div className="json-result-panel-header">
              <h2 className="json-result-section-title">原始数据</h2>
            </div>

            <pre className="json-result-raw">
              {result?.rawInput ?? "等待 JSON 数据..."}
            </pre>
          </article>

          <article className="json-result-panel">
            <div className="json-result-panel-header">
              <h2 className="json-result-section-title">格式化后的 JSON</h2>
            </div>

            <div className="json-result-pretty">
              {parsedJsonState.isParsed ? (
                <JsonTree value={parsedJsonState.value} />
              ) : (
                <pre className="json-result-fallback">
                  {result?.formattedJson ?? "等待 JSON 数据..."}
                </pre>
              )}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}