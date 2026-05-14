import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { closeFeaturesWindow } from "../../features/pet/lib/featuresWindow";
import { parseJsonInput } from "../../features/json-parser/lib/parseJsonInput";
import { JsonTree } from "../../features/json-parser";
import type { ParsedJsonResult, JsonValue } from "../../features/json-parser/types/jsonParser";
import "./FeaturesPage.css";

// --- feature registry ---

type FeatureId = "json-parse" | "photo-1inch";

interface FeatureEntry {
  id: FeatureId;
  label: string;
  category: string;
}

const FEATURES: FeatureEntry[] = [
  { id: "json-parse", label: "JSON解析", category: "开发工具" },
  { id: "photo-1inch", label: "一寸照片生成", category: "实用工具" },
];

/** FEATURES grouped by category, in insertion order. */
function groupByCategory(features: FeatureEntry[]): Map<string, FeatureEntry[]> {
  const map = new Map<string, FeatureEntry[]>();

  for (const f of features) {
    const group = map.get(f.category);

    if (group) {
      group.push(f);
    } else {
      map.set(f.category, [f]);
    }
  }

  return map;
}

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

// --- Photo 1-inch work area ---

type PhotoSize =
  | "1inch"
  | "2inch"
  | "large-1inch"
  | "small-1inch"
  | "large-2inch"
  | "small-2inch"
  | "resume"
  | "cet"
  | "psc";

interface PhotoSizeSpec {
  label: string;
  /** physical size description, e.g. "25×35mm" */
  physical: string;
  width: number;
  height: number;
}

const PHOTO_SIZES: Record<PhotoSize, PhotoSizeSpec> = {
  "1inch":      { label: "1寸",       physical: "25×35mm", width: 295, height: 413 },
  "small-1inch": { label: "小一寸",   physical: "22×32mm", width: 260, height: 378 },
  "large-1inch": { label: "大一寸",   physical: "33×48mm", width: 390, height: 567 },
  "2inch":      { label: "2寸",       physical: "35×49mm", width: 413, height: 579 },
  "small-2inch": { label: "小二寸",   physical: "35×45mm", width: 413, height: 531 },
  "large-2inch": { label: "大二寸",   physical: "35×53mm", width: 413, height: 626 },
  "resume":     { label: "简历照",    physical: "25×35mm", width: 295, height: 413 },
  "cet":        { label: "四六级照",  physical: "25×35mm", width: 295, height: 413 },
  "psc":        { label: "普通话照",  physical: "25×35mm", width: 295, height: 413 },
};

interface ProcessResult {
  blob: Blob;
  sourceWidth: number;
  sourceHeight: number;
}

async function processPhoto(
  imageUrl: string,
  spec: PhotoSizeSpec,
  quality: number,
  onProgress: (pct: number) => void,
): Promise<ProcessResult> {
  await new Promise((r) => setTimeout(r, 60));
  onProgress(10);

  const img = new Image();
  img.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
  });

  onProgress(30);

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = spec.width * scale;
  canvas.height = spec.height * scale;

  const ctx = canvas.getContext("2d")!;
  const targetRatio = spec.width / spec.height;
  const imgRatio = img.naturalWidth / img.naturalHeight;

  let sx: number, sy: number, sw: number, sh: number;

  if (imgRatio > targetRatio) {
    sh = img.naturalHeight;
    sw = img.naturalHeight * targetRatio;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = img.naturalWidth / targetRatio;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }

  onProgress(60);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  onProgress(85);

  return new Promise<ProcessResult>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        onProgress(95);
        resolve({
          blob,
          sourceWidth: img.naturalWidth,
          sourceHeight: img.naturalHeight,
        });
      } else {
        reject(new Error("Failed to encode image"));
      }
    }, "image/jpeg", quality);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Photo1InchWorkArea() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [selectedSize, setSelectedSize] = useState<PhotoSize>("1inch");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState(0.92);
  const [sourceFileSize, setSourceFileSize] = useState(0);
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null);
  const [resultFileSize, setResultFileSize] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultBlobRef = useRef<Blob | null>(null);
  const processingIdRef = useRef(0);

  const resultDims = PHOTO_SIZES[selectedSize];

  const handleSelectFile = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
    }

    setFileName(file.name);
    setSourceFileSize(file.size);
    setPreviewUrl(URL.createObjectURL(file));
    setResultUrl(null);
    setSourceDims(null);
    setResultFileSize(0);
    resultBlobRef.current = null;

    e.currentTarget.value = "";
  }, [previewUrl, resultUrl]);

  // Auto-process when photo, size or quality changes
  useEffect(() => {
    if (!previewUrl) return;

    const id = ++processingIdRef.current;

    setProcessing(true);
    setProgress(0);

    processPhoto(previewUrl, PHOTO_SIZES[selectedSize], quality, (pct) => {
      if (processingIdRef.current === id) {
        setProgress(pct);
      }
    })
      .then((result) => {
        if (processingIdRef.current !== id) return;

        resultBlobRef.current = result.blob;
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(URL.createObjectURL(result.blob));
        setSourceDims({ w: result.sourceWidth, h: result.sourceHeight });
        setResultFileSize(result.blob.size);
        setProgress(100);
        setProcessing(false);
      })
      .catch(() => {
        if (processingIdRef.current !== id) return;
        setProcessing(false);
      });
  }, [previewUrl, selectedSize, quality]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = useCallback(async () => {
    const blob = resultBlobRef.current;
    if (!blob) return;

    const spec = PHOTO_SIZES[selectedSize];
    const baseName = fileName.replace(/\.[^.]+$/, "") || "photo";
    const defaultName = `${baseName}_${spec.label}.jpg`;

    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the "data:image/jpeg;base64," prefix
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(new Error("Failed to read image data"));
      reader.readAsDataURL(blob);
    });

    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "JPEG Image", extensions: ["jpg", "jpeg"] }],
    });

    if (!filePath) return; // user cancelled

    await invoke("save_file", { path: filePath, data: base64 });
  }, [fileName, selectedSize]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="features-work-photo">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="features-photo-input-hidden"
        onChange={handleFileChange}
      />

      {previewUrl ? (
        <>
          <div className="features-photo-panels">
            <div className="features-photo-source">
              <p className="features-photo-panel-label">原图</p>
              <div className="features-photo-img-wrap">
                <img
                  src={previewUrl}
                  alt={fileName}
                  className="features-photo-source-img"
                />
              </div>
              <div className="features-photo-info">
                {sourceDims ? (
                  <span>{sourceDims.w} × {sourceDims.h}</span>
                ) : (
                  <span className="features-photo-info-placeholder">—</span>
                )}
                <span className="features-photo-info-sep">|</span>
                <span>{formatFileSize(sourceFileSize)}</span>
              </div>
            </div>

            <div className="features-photo-result">
              <p className="features-photo-panel-label">结果</p>
              <div className="features-photo-img-wrap">
                {processing ? (
                  <div className="features-photo-progress">
                    <div className="features-photo-progress-bar">
                      <div
                        className="features-photo-progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="features-photo-progress-text">
                      处理中 {progress}%
                    </span>
                  </div>
                ) : resultUrl ? (
                  <img
                    src={resultUrl}
                    alt="处理结果"
                    className="features-photo-result-img"
                  />
                ) : (
                  <span className="features-photo-result-placeholder">
                    处理中...
                  </span>
                )}
              </div>
              <div className="features-photo-info">
                <span>{resultDims.width} × {resultDims.height}（{resultDims.physical}）</span>
                <span className="features-photo-info-sep">|</span>
                {resultFileSize > 0 ? (
                  <span>{formatFileSize(resultFileSize)}</span>
                ) : (
                  <span className="features-photo-info-placeholder">—</span>
                )}
              </div>
            </div>
          </div>

          <div className="features-photo-footer">
            <div className="features-photo-footer-top">
              <div className="features-photo-sizes">
                {(Object.keys(PHOTO_SIZES) as PhotoSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`features-photo-size-btn${selectedSize === size ? " is-active" : ""}`}
                    disabled={processing}
                    onClick={() => setSelectedSize(size)}
                  >
                    {PHOTO_SIZES[size].label}
                  </button>
                ))}
              </div>
              <div className="features-photo-footer-actions">
                <button
                  type="button"
                  className="features-photo-select-btn"
                  disabled={processing}
                  onClick={handleSelectFile}
                >
                  重新选择
                </button>
                <button
                  type="button"
                  className="features-photo-confirm-btn"
                  disabled={processing || !resultUrl}
                  onClick={handleExport}
                >
                  导出
                </button>
              </div>
            </div>
            <div className="features-photo-quality">
              <label className="features-photo-quality-label">
                压缩质量
                <span className="features-photo-quality-value">
                  {Math.round(quality * 100)}%
                </span>
              </label>
              <input
                type="range"
                className="features-photo-quality-slider"
                min={0.1}
                max={1}
                step={0.05}
                value={quality}
                disabled={processing}
                onChange={(e) => setQuality(Number(e.currentTarget.value))}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="features-photo-empty">
          <p className="features-photo-empty-text">请选择一张照片</p>
          <button
            type="button"
            className="features-photo-select-btn"
            onClick={handleSelectFile}
          >
            选择照片
          </button>
        </div>
      )}
    </div>
  );
}

// --- work area router ---

function WorkArea({ feature }: { feature: FeatureId }) {
  switch (feature) {
    case "json-parse":
      return <JsonParseWorkArea />;
    case "photo-1inch":
      return <Photo1InchWorkArea />;
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
            {Array.from(groupByCategory(FEATURES).entries()).map(([category, entries]) => (
              <div key={category} className="features-category">
                <p className="features-category-label">{category}</p>
                {entries.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`features-nav-item${activeFeature === f.id ? " is-active" : ""}`}
                    onClick={() => setActiveFeature(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
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
