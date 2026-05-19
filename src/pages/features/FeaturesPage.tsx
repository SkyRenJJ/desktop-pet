import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { closeFeaturesWindow } from "../../features/pet/lib/featuresWindow";
import { ColorPickerWorkArea } from "./color-picker";
import { TimestampConverterWorkArea } from "./timestamp-converter";
import { parseJsonInput } from "../../features/json-parser/lib/parseJsonInput";
import { JsonTree } from "../../features/json-parser";
import type { ParsedJsonResult, JsonValue } from "../../features/json-parser/types/jsonParser";
import "./FeaturesPage.css";

// --- feature registry ---

type FeatureId = "json-parse" | "photo-1inch" | "image-compress" | "color-picker" | "timestamp-converter" | "schedule-shutdown" | "network-speed-test" | "mobile-debug" | "adb-file-manager" | "memo";

interface FeatureEntry {
  id: FeatureId;
  label: string;
  category: string;
}

const FEATURES: FeatureEntry[] = [
  { id: "json-parse", label: "JSON解析", category: "开发工具" },
  { id: "photo-1inch", label: "照片处理工具", category: "实用工具" },
  { id: "image-compress", label: "图片压缩", category: "实用工具" },
  { id: "memo", label: "备忘录", category: "实用工具" },
  { id: "color-picker", label: "取色器", category: "实用工具" },
  { id: "timestamp-converter", label: "时间戳转换器", category: "实用工具" },
  { id: "schedule-shutdown", label: "定时关机", category: "系统工具" },
  { id: "network-speed-test", label: "网速测试", category: "系统工具" },
  // { id: "mobile-debug", label: "手机调试", category: "开发工具" },
  // { id: "adb-file-manager", label: "文件管理", category: "开发工具" },
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

// --- Image compress work area ---

interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
}

async function compressImage(
  imageUrl: string,
  quality: number,
  onProgress: (pct: number) => void,
): Promise<CompressResult> {
  await new Promise((r) => setTimeout(r, 30));
  onProgress(10);

  const img = new Image();
  img.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
  });

  onProgress(40);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  onProgress(70);

  return new Promise<CompressResult>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        onProgress(100);
        resolve({
          blob,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      } else {
        reject(new Error("Failed to encode image"));
      }
    }, "image/jpeg", quality);
  });
}

function ImageCompressWorkArea() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState(0.75);
  const [sourceFileSize, setSourceFileSize] = useState(0);
  const [resultFileSize, setResultFileSize] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultBlobRef = useRef<Blob | null>(null);
  const processingIdRef = useRef(0);

  const handleSelectFile = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);

    const url = URL.createObjectURL(file);
    setFileName(file.name);
    setSourceFileSize(file.size);
    setPreviewUrl(url);
    setResultUrl(null);
    setResultFileSize(0);
    resultBlobRef.current = null;

    // Read dimensions immediately from the image
    const img = new Image();
    img.onload = () => {
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = url;

    e.currentTarget.value = "";
  }, [previewUrl, resultUrl]);

  useEffect(() => {
    if (!previewUrl) return;

    const id = ++processingIdRef.current;

    setProcessing(true);
    setProgress(0);

    compressImage(previewUrl, quality, (pct) => {
      if (processingIdRef.current === id) setProgress(pct);
    })
      .then((result) => {
        if (processingIdRef.current !== id) return;

        resultBlobRef.current = result.blob;
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(URL.createObjectURL(result.blob));
        setDims({ w: result.width, h: result.height });
        setResultFileSize(result.blob.size);
        setProgress(100);
        setProcessing(false);
      })
      .catch(() => {
        if (processingIdRef.current !== id) return;
        setProcessing(false);
      });
  }, [previewUrl, quality]);

  const handleExport = useCallback(async () => {
    const blob = resultBlobRef.current;
    if (!blob) return;

    const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
    const qualityPct = Math.round(quality * 100);
    const defaultName = `${baseName}_compressed_q${qualityPct}.jpg`;

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result as string;
        resolve(r.slice(r.indexOf(",") + 1));
      };
      reader.onerror = () => reject(new Error("Failed to read image data"));
      reader.readAsDataURL(blob);
    });

    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "JPEG Image", extensions: ["jpg", "jpeg"] }],
    });

    if (!filePath) return;
    await invoke("save_file", { path: filePath, data: base64 });
  }, [fileName, quality]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, []);

  const compressRatio = resultFileSize > 0
    ? Math.round((1 - resultFileSize / sourceFileSize) * 100)
    : 0;

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
              <p className="features-photo-panel-label">原始图片</p>
              <div className="features-photo-img-wrap">
                <img
                  src={previewUrl}
                  alt={fileName}
                  className="features-photo-source-img"
                />
              </div>
              <div className="features-photo-info">
                <span>{dims.w} × {dims.h}</span>
                <span className="features-photo-info-sep">|</span>
                <span>{formatFileSize(sourceFileSize)}</span>
              </div>
            </div>

            <div className="features-photo-result">
              <p className="features-photo-panel-label">压缩结果</p>
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
                      压缩中 {progress}%
                    </span>
                  </div>
                ) : resultUrl ? (
                  <img
                    src={resultUrl}
                    alt="压缩结果"
                    className="features-photo-result-img"
                  />
                ) : (
                  <span className="features-photo-result-placeholder">
                    处理中...
                  </span>
                )}
              </div>
              <div className="features-photo-info">
                <span>{dims.w} × {dims.h}</span>
                <span className="features-photo-info-sep">|</span>
                {resultFileSize > 0 ? (
                  <span>{formatFileSize(resultFileSize)}</span>
                ) : (
                  <span className="features-photo-info-placeholder">—</span>
                )}
                {compressRatio > 0 && resultFileSize > 0 && (
                  <>
                    <span className="features-photo-info-sep">|</span>
                    <span className="features-compress-ratio">-{compressRatio}%</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="features-photo-footer">
            <div className="features-photo-footer-top">
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
          </div>
        </>
      ) : (
        <div className="features-photo-empty">
          <p className="features-photo-empty-text">请选择一张图片进行压缩</p>
          <button
            type="button"
            className="features-photo-select-btn"
            onClick={handleSelectFile}
          >
            选择图片
          </button>
        </div>
      )}
    </div>
  );
}

// --- Schedule shutdown work area ---

type ShutdownMode = "countdown" | "system-time";

function padNum(n: number): string {
  return String(n).padStart(2, "0");
}

function formatRemaining(totalSeconds: number): { h: string; m: string; s: string } {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h: padNum(h), m: padNum(m), s: padNum(s) };
}

function ScheduleShutdownWorkArea() {
  const [mode, setMode] = useState<ShutdownMode>("countdown");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [targetTime, setTargetTime] = useState("12:00");
  const [active, setActive] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null); // live countdown seconds
  const [errorText, setErrorText] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const defaults = { hours: 0, minutes: 0, seconds: 0, targetTime: "12:00" };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const clearCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRemaining(null);
  }, []);

  const handleReset = useCallback(() => {
    setHours(defaults.hours);
    setMinutes(defaults.minutes);
    setSeconds(defaults.seconds);
    setTargetTime(defaults.targetTime);
    setErrorText("");
  }, []);

  const handleConfirm = useCallback(async () => {
    if (active) {
      // Cancel shutdown
      try {
        await invoke("cancel_shutdown");
      } catch {
        // ignore errors — the OS may have already completed
      }
      setActive(false);
      setErrorText("");
      clearCountdown();
      return;
    }

    let totalSeconds: number;

    if (mode === "countdown") {
      totalSeconds = hours * 3600 + minutes * 60 + seconds;
      if (totalSeconds <= 0) {
        setErrorText("请设置有效的倒计时时间");
        return;
      }
    } else {
      const now = new Date();
      const [h, m] = targetTime.split(":").map(Number);
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      totalSeconds = Math.round((target.getTime() - now.getTime()) / 1000);
      if (totalSeconds <= 0) {
        setErrorText("请设置有效的目标时间");
        return;
      }
    }

    try {
      await invoke("schedule_shutdown", { seconds: totalSeconds });
      setActive(true);
      setErrorText("");

      // Start live countdown
      setRemaining(totalSeconds);
      const tick = () => {
        setRemaining((prev) => {
          if (prev === null || prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      };
      intervalRef.current = setInterval(tick, 1000);
    } catch (e) {
      setErrorText(String(e));
    }
  }, [active, mode, hours, minutes, seconds, targetTime, clearCountdown]);

  const handleHourChange = useCallback((val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0 && n <= 99) setHours(n);
  }, []);
  const handleMinuteChange = useCallback((val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0 && n <= 59) setMinutes(n);
  }, []);
  const handleSecondChange = useCallback((val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0 && n <= 59) setSeconds(n);
  }, []);

  const isCountdown = mode === "countdown";
  const showLiveCountdown = active && isCountdown && remaining !== null;
  const remainingFmt = remaining !== null ? formatRemaining(remaining) : null;

  return (
    <div className="features-work-shutdown">
      {active && (
        <div className="shutdown-active-banner">
          定时关机已设置 · {isCountdown && remainingFmt ? (
            <>剩余 {remainingFmt.h}:{remainingFmt.m}:{remainingFmt.s}</>
          ) : (
            <>系统将在指定时间自动关闭</>
          )}
        </div>
      )}

      {/* Mode tabs */}
      <div className="shutdown-mode-tabs">
        <button
          type="button"
          className={`shutdown-mode-tab${mode === "countdown" ? " is-active" : ""}`}
          disabled={active}
          onClick={() => setMode("countdown")}
        >
          倒计时关机
        </button>
        <button
          type="button"
          className={`shutdown-mode-tab${mode === "system-time" ? " is-active" : ""}`}
          disabled={active}
          onClick={() => setMode("system-time")}
        >
          系统时间关机
        </button>
      </div>

      {/* Time input / countdown display area */}
      <div className="shutdown-time-input">
        {isCountdown ? (
          showLiveCountdown && remainingFmt ? (
            <div className="shutdown-countdown-live">
              <div className="shutdown-countdown-digit">
                <span className="shutdown-countdown-val">{remainingFmt.h}</span>
                <span className="shutdown-time-label">时</span>
              </div>
              <span className="shutdown-time-colon">:</span>
              <div className="shutdown-countdown-digit">
                <span className="shutdown-countdown-val">{remainingFmt.m}</span>
                <span className="shutdown-time-label">分</span>
              </div>
              <span className="shutdown-time-colon">:</span>
              <div className="shutdown-countdown-digit">
                <span className="shutdown-countdown-val">{remainingFmt.s}</span>
                <span className="shutdown-time-label">秒</span>
              </div>
            </div>
          ) : (
            <div className="shutdown-countdown">
              <div className="shutdown-time-field">
                <input
                  type="number"
                  className="shutdown-time-number"
                  min={0}
                  max={99}
                  value={hours}
                  disabled={active}
                  onChange={(e) => handleHourChange(e.currentTarget.value)}
                />
                <span className="shutdown-time-label">时</span>
              </div>
              <span className="shutdown-time-colon">:</span>
              <div className="shutdown-time-field">
                <input
                  type="number"
                  className="shutdown-time-number"
                  min={0}
                  max={59}
                  value={padNum(minutes)}
                  disabled={active}
                  onChange={(e) => handleMinuteChange(e.currentTarget.value)}
                />
                <span className="shutdown-time-label">分</span>
              </div>
              <span className="shutdown-time-colon">:</span>
              <div className="shutdown-time-field">
                <input
                  type="number"
                  className="shutdown-time-number"
                  min={0}
                  max={59}
                  value={padNum(seconds)}
                  disabled={active}
                  onChange={(e) => handleSecondChange(e.currentTarget.value)}
                />
                <span className="shutdown-time-label">秒</span>
              </div>
            </div>
          )
        ) : (
          <div className="shutdown-system-time">
            <input
              type="time"
              className="shutdown-time-picker"
              value={targetTime}
              disabled={active}
              onChange={(e) => setTargetTime(e.currentTarget.value)}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shutdown-footer">
        <span className="shutdown-error">{errorText}</span>
        <div className="shutdown-footer-actions">
          <button
            type="button"
            className="shutdown-reset-btn"
            disabled={active}
            onClick={handleReset}
          >
            重置
          </button>
          <button
            type="button"
            className={`shutdown-confirm-btn${active ? " is-cancel" : ""}`}
            onClick={handleConfirm}
          >
            {active ? "取消" : "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Network speed test work area ---

interface GaugeTick {
  value: number;
  label: string;
  angle: number; // radians
}

function buildTicks(maxSpeed: number): GaugeTick[] {
  const steps = maxSpeed <= 50 ? 4 : 5;
  const ticks: GaugeTick[] = [];
  for (let i = 0; i <= steps; i++) {
    const value = Math.round((maxSpeed / steps) * i);
    const angle = Math.PI + (value / maxSpeed) * Math.PI;
    ticks.push({ value, label: value >= 1000 ? `${(value / 1000).toFixed(0)}G` : `${value}`, angle });
  }
  return ticks;
}

function formatSpeed(mbps: number): string {
  if (mbps < 1) return `${(mbps * 1000).toFixed(0)} Kbps`;
  if (mbps < 1000) return `${mbps.toFixed(1)} Mbps`;
  return `${(mbps / 1000).toFixed(2)} Gbps`;
}

/** Test URLs ordered by preference. Uses a streaming fetch to measure throughput. */
const TEST_URLS = [
  "https://speed.cloudflare.com/__down?bytes=52428800",
];

const SPEED_TEST_DURATION_MS = 8000; // max 8 seconds per test
const GAUGE_MAX_DEFAULT = 100; // Mbps

function NetworkSpeedWorkArea() {
  const [testing, setTesting] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0); // live Mbps
  const [finalSpeed, setFinalSpeed] = useState<number | null>(null);
  const [gaugeMax, setGaugeMax] = useState(GAUGE_MAX_DEFAULT);
  const [errorText, setErrorText] = useState("");
  const [phase, setPhase] = useState<"idle" | "connecting" | "testing" | "done">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const stopTest = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setTesting(false);
    setPhase("idle");
  }, []);

  const startTest = useCallback(async () => {
    setTesting(true);
    setCurrentSpeed(0);
    setFinalSpeed(null);
    setErrorText("");
    setPhase("connecting");
    setGaugeMax(GAUGE_MAX_DEFAULT);

    const controller = new AbortController();
    abortRef.current = controller;

    const startTime = performance.now();
    let receivedBytes = 0;
    let lastUpdateTime = startTime;
    let lastUpdateBytes = 0;
    let maxMeasured = 0;

    try {
      setPhase("testing");

      // Use multiple concurrent fetches to saturate the connection
      const url = TEST_URLS[0];
      const concurrency = 3;
      const fetches = Array.from({ length: concurrency }, () =>
        fetch(url, { signal: controller.signal })
      );

      const responses = await Promise.all(fetches);

      // Read all streams concurrently
      const readers = responses.map((r) => r.body!.getReader());

      const readAll = async () => {
        const promises = readers.map(async (reader) => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedBytes += value.length;

            const now = performance.now();
            const windowMs = now - lastUpdateTime;

            if (windowMs >= 150) {
              const windowBytes = receivedBytes - lastUpdateBytes;
              const windowMbps = (windowBytes * 8) / (windowMs * 1000); // Mbps
              const elapsedTotal = (now - startTime) / 1000;
              const avgMbps = (receivedBytes * 8) / (elapsedTotal * 1000000);

              // Use a blend of average and window speed
              const displaySpeed = windowMbps * 0.4 + avgMbps * 0.6;
              setCurrentSpeed(displaySpeed);

              if (displaySpeed > maxMeasured) maxMeasured = displaySpeed;
              if (maxMeasured > gaugeMax * 0.85) {
                setGaugeMax(Math.max(maxMeasured * 1.3, GAUGE_MAX_DEFAULT));
              }

              lastUpdateTime = now;
              lastUpdateBytes = receivedBytes;
            }

            // Auto-stop after duration
            if (performance.now() - startTime > SPEED_TEST_DURATION_MS) {
              controller.abort();
              break;
            }
          }
        });
        await Promise.all(promises);
      };

      await readAll();
    } catch (err) {
      // AbortError is expected (stop button or auto-stop)
      if ((err as Error).name !== "AbortError") {
        setErrorText(String(err));
      }
    }

    // Calculate final speed
    const totalTime = (performance.now() - startTime) / 1000;
    const speed = totalTime > 0 && receivedBytes > 0
      ? (receivedBytes * 8) / (totalTime * 1000000)
      : 0;

    setCurrentSpeed(speed);
    setFinalSpeed(speed);
    setPhase("done");

    // Smooth animate needle to final position
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const startAnim = performance.now();
    const startVal = currentSpeed;
    const animDuration = 600;
    const animateNeedle = (now: number) => {
      const elapsed = now - startAnim;
      const t = Math.min(elapsed / animDuration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      setCurrentSpeed(startVal + (speed - startVal) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animateNeedle);
      }
    };
    rafRef.current = requestAnimationFrame(animateNeedle);

    setTesting(false);
    abortRef.current = null;
  }, [gaugeMax]);

  // Compute needle angle
  const maxForAngle = gaugeMax > 0 ? gaugeMax : GAUGE_MAX_DEFAULT;
  const speedClamped = Math.min(currentSpeed, maxForAngle);
  const needleAngle = Math.PI + (speedClamped / maxForAngle) * Math.PI;

  // SVG constants
  const svgW = 260;
  const svgH = 155;
  const cx = 130;
  const cy = 130;
  const r = 110;
  const needleLen = r - 14;

  const ticks = buildTicks(gaugeMax);

  // Arc path: from π to 2π (left-bottom-right semi-circle)
  const arcStart = { x: cx - r, y: cy };
  const arcEnd = { x: cx + r, y: cy };
  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;

  // Needle end point
  const needleX = cx + needleLen * Math.cos(needleAngle);
  const needleY = cy + needleLen * Math.sin(needleAngle);

  // Filled arc up to current speed
  const filledAngle = Math.PI + (speedClamped / maxForAngle) * Math.PI;
  const filledX = cx + r * Math.cos(filledAngle);
  const filledY = cy + r * Math.sin(filledAngle);
  const filledPath = speedClamped > 0
    ? `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${filledAngle > Math.PI * 1.5 ? 1 : 0} 1 ${filledX} ${filledY}`
    : "";

  return (
    <div className="speedtest-work">
      {/* Gauge */}
      <div className="speedtest-gauge-wrap">
        <svg
          className="speedtest-gauge"
          viewBox={`0 0 ${svgW} ${svgH}`}
          width={svgW}
          height={svgH}
        >
          {/* Background arc */}
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(180,155,210,0.2)"
            strokeWidth={18}
            strokeLinecap="round"
          />

          {/* Filled arc */}
          {speedClamped > 0 && (
            <path
              d={filledPath}
              fill="none"
              stroke="url(#speedtestGradient)"
              strokeWidth={18}
              strokeLinecap="round"
            />
          )}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="speedtestGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#9b5fc0" />
              <stop offset="50%" stopColor="#c8a0e0" />
              <stop offset="100%" stopColor="#4caf50" />
            </linearGradient>
          </defs>

          {/* Tick marks */}
          {ticks.map((tick) => {
            const tx = cx + (r - 2) * Math.cos(tick.angle);
            const ty = cy + (r - 2) * Math.sin(tick.angle);
            const txInner = cx + (r - 14) * Math.cos(tick.angle);
            const tyInner = cy + (r - 14) * Math.sin(tick.angle);
            return (
              <g key={tick.value}>
                <line
                  x1={txInner} y1={tyInner}
                  x2={tx} y2={ty}
                  stroke="rgba(160,100,210,0.5)"
                  strokeWidth={2}
                />
                <text
                  x={cx + (r - 22) * Math.cos(tick.angle)}
                  y={cy + (r - 22) * Math.sin(tick.angle)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#7b5a90"
                  fontSize={10}
                  fontWeight={600}
                >
                  {tick.label}
                </text>
              </g>
            );
          })}

          {/* Needle */}
          <line
            x1={cx} y1={cy}
            x2={needleX} y2={needleY}
            stroke="#752fb0"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* Needle center dot */}
          <circle cx={cx} cy={cy} r={5} fill="#752fb0" />
          <circle cx={cx} cy={cy} r={2.5} fill="#fff" />
        </svg>

        {/* Speed text below center of gauge */}
        <div className="speedtest-value">
          <span className="speedtest-number">
            {phase === "connecting" ? "—" : formatSpeed(currentSpeed)}
          </span>
          {phase === "done" && finalSpeed !== null && (
            <span className="speedtest-done-label">测试完成</span>
          )}
          {phase === "testing" && (
            <span className="speedtest-testing-label">测试中...</span>
          )}
          {phase === "connecting" && (
            <span className="speedtest-testing-label">连接中...</span>
          )}
        </div>
      </div>

      {errorText && (
        <p className="speedtest-error">{errorText}</p>
      )}

      {/* Buttons */}
      <div className="speedtest-actions">
        <button
          type="button"
          className="speedtest-btn speedtest-start-btn"
          disabled={testing}
          onClick={startTest}
        >
          开始测试
        </button>
        <button
          type="button"
          className="speedtest-btn speedtest-stop-btn"
          disabled={!testing}
          onClick={stopTest}
        >
          停止测试
        </button>
      </div>
    </div>
  );
}

// --- Mobile debug work area (scrcpy) ---

type MobileDebugPhase = "checking" | "not-found" | "installing" | "found" | "error";

const SCRCPY_PATH_KEY = "scrcpy-install-path";

function getStoredPath(): string | null {
  try {
    return localStorage.getItem(SCRCPY_PATH_KEY);
  } catch {
    return null;
  }
}

function setStoredPath(path: string) {
  try {
    localStorage.setItem(SCRCPY_PATH_KEY, path);
  } catch { /* ignore */ }
}

function MobileDebugWorkArea() {
  const [phase, setPhase] = useState<MobileDebugPhase>("checking");
  const [errorText, setErrorText] = useState("");
  const [installProgress, setInstallProgress] = useState(0);
  const [installDir, setInstallDir] = useState<string | null>(getStoredPath);
  const unlistenRef = useRef<(() => void) | null>(null);

  const doCheck = useCallback(async () => {
    setPhase("checking");
    setErrorText("");
    try {
      const status: { installed: boolean; path: string } = await invoke("scrcpy_check", {
        customPath: getStoredPath(),
      });
      setPhase(status.installed ? "found" : "not-found");
    } catch (e) {
      setErrorText(String(e));
      setPhase("error");
    }
  }, []);

  // Check on mount
  useEffect(() => {
    doCheck();
  }, [doCheck]);

  // Cleanup event listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) unlistenRef.current();
    };
  }, []);

  const handleLaunch = useCallback(async () => {
    setErrorText("");
    try {
      await invoke("scrcpy_launch", { customPath: getStoredPath() });
    } catch (e) {
      setErrorText(String(e));
    }
  }, []);

  const handleInstall = useCallback(async () => {
    setErrorText("");

    // Let user choose install directory
    const selected = await open({
      directory: true,
      title: "选择 scrcpy 安装目录",
    });

    if (!selected) return; // user cancelled

    const dir = selected as string;
    setInstallDir(dir);

    setPhase("installing");
    setInstallProgress(0);

    // Listen for progress events
    const unlisten = await listen<number>("scrcpy-install-progress", (event) => {
      setInstallProgress(event.payload);
    });
    unlistenRef.current = unlisten;

    try {
      await invoke("scrcpy_install", { path: dir });
      setStoredPath(dir);
      // After install completes, re-check
      const status: { installed: boolean; path: string } = await invoke("scrcpy_check", {
        customPath: dir,
      });
      setPhase(status.installed ? "found" : "not-found");
    } catch (e) {
      setErrorText(String(e));
      setPhase("error");
    } finally {
      unlisten();
      unlistenRef.current = null;
    }
  }, []);

  return (
    <div className="mobile-debug-work">
      {/* Checking */}
      {phase === "checking" && (
        <div className="mobile-debug-empty">
          <p className="mobile-debug-empty-text">正在检查 scrcpy...</p>
        </div>
      )}

      {/* Not found */}
      {phase === "not-found" && (
        <div className="mobile-debug-empty">
          <p className="mobile-debug-empty-text">未检测到 scrcpy</p>
          <p className="mobile-debug-empty-hint">
            scrcpy 是一个免费开源的 Android 屏幕镜像工具，安装后可实现手机画面投射与控制
          </p>
          {installDir && (
            <p className="mobile-debug-empty-hint">
              当前安装目录：{installDir}
            </p>
          )}
          <button type="button" className="mobile-debug-scan-btn" onClick={handleInstall}>
            选择目录并安装
          </button>
          <button type="button" className="mobile-debug-retry-btn" onClick={doCheck}>
            重新检测
          </button>
        </div>
      )}

      {/* Installing */}
      {phase === "installing" && (
        <div className="mobile-debug-empty">
          <p className="mobile-debug-empty-text">正在下载 scrcpy...</p>
          <div className="mobile-debug-progress">
            <div className="mobile-debug-progress-bar">
              <div
                className="mobile-debug-progress-fill"
                style={{ width: `${installProgress}%` }}
              />
            </div>
            <span className="mobile-debug-progress-text">{installProgress}%</span>
          </div>
          <p className="mobile-debug-empty-hint">
            安装目录：{installDir}
          </p>
        </div>
      )}

      {/* Found / Ready to launch */}
      {phase === "found" && (
        <div className="mobile-debug-empty">
          <p className="mobile-debug-empty-text">scrcpy 已就绪</p>
          <p className="mobile-debug-empty-hint">
            连接 Android 手机并开启 USB 调试后，点击下方按钮启动画面投射
          </p>
          {installDir && (
            <p className="mobile-debug-empty-hint">
              安装目录：{installDir}
            </p>
          )}
          <button type="button" className="mobile-debug-scan-btn" onClick={handleLaunch}>
            启动 scrcpy
          </button>
          <button type="button" className="mobile-debug-retry-btn" onClick={doCheck}>
            重新检测
          </button>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="mobile-debug-empty">
          <p className="mobile-debug-empty-text">出错了</p>
          <p className="mobile-debug-empty-hint">{errorText}</p>
          <button type="button" className="mobile-debug-scan-btn" onClick={doCheck}>
            重新检测
          </button>
        </div>
      )}
    </div>
  );
}

// --- ADB file manager work area ---

interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  permissions: string;
  modified: string;
}

interface DeviceInfo {
  serial: string;
  state: string;
}

function AdbFileManagerWorkArea() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState("/sdcard");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [phase, setPhase] = useState<"no-device" | "browsing">("no-device");

  const fetchDevices = useCallback(async () => {
    setErrorText("");
    try {
      const list: DeviceInfo[] = await invoke("adb_devices");
      setDevices(list);
      if (list.length > 0 && !selectedSerial) {
        const serial = list[0].serial;
        setSelectedSerial(serial);
        setPhase("browsing");
      } else if (list.length === 0) {
        setPhase("no-device");
        setFiles([]);
      }
    } catch (e) {
      setErrorText(String(e));
    }
  }, [selectedSerial]);

  const fetchFiles = useCallback(async (serial: string, path: string) => {
    setLoading(true);
    setErrorText("");
    try {
      const entries: FileEntry[] = await invoke("adb_file_list", {
        serial,
        path,
      });

      entries.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setFiles(entries);
    } catch (e) {
      setErrorText(String(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    if (selectedSerial && phase === "browsing") {
      fetchFiles(selectedSerial, currentPath);
    }
  }, [selectedSerial, currentPath, phase, fetchFiles]);

  const handleSelectDevice = useCallback((serial: string) => {
    setSelectedSerial(serial);
    setCurrentPath("/sdcard");
    setPhase("browsing");
  }, []);

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);

  const goToParent = useCallback(() => {
    if (currentPath === "/") return;
    const parent = currentPath.substring(0, currentPath.lastIndexOf("/")) || "/";
    setCurrentPath(parent);
  }, [currentPath]);

  const handleDelete = useCallback(async (name: string, isDir: boolean) => {
    if (!selectedSerial) return;
    const fullPath = currentPath + "/" + name;
    try {
      await invoke("adb_file_delete", { serial: selectedSerial, path: fullPath, isDir });
      fetchFiles(selectedSerial, currentPath);
    } catch (e) {
      setErrorText(String(e));
    }
  }, [selectedSerial, currentPath, fetchFiles]);

  const handleDownload = useCallback(async (name: string) => {
    if (!selectedSerial) return;
    const remotePath = currentPath + "/" + name;

    const destPath = await save({
      defaultPath: name,
      title: "导出文件",
    });

    if (!destPath) return;

    try {
      await invoke("adb_file_pull", { serial: selectedSerial, remotePath, localPath: destPath });
    } catch (e) {
      setErrorText(String(e));
    }
  }, [selectedSerial, currentPath]);

  // Build breadcrumb segments: start with "/" root, then each path segment
  const breadcrumbSegments = (() => {
    const segs = currentPath.split("/").filter(Boolean);
    return [{ label: "/", path: "/" }].concat(
      segs.map((seg, i) => ({
        label: seg,
        path: "/" + segs.slice(0, i + 1).join("/"),
      }))
    );
  })();

  return (
    <div className="filemgr-work">
      {phase === "no-device" && (
        <div className="mobile-debug-empty">
          <p className="mobile-debug-empty-text">未检测到设备</p>
          <p className="mobile-debug-empty-hint">请连接 Android 手机并开启 USB 调试</p>
          <button type="button" className="mobile-debug-scan-btn" onClick={fetchDevices}>
            重新检测
          </button>
        </div>
      )}

      {phase === "browsing" && selectedSerial && (
        <>
          <div className="filemgr-topbar">
            <select
              className="filemgr-device-select"
              value={selectedSerial}
              onChange={(e) => handleSelectDevice(e.currentTarget.value)}
            >
              {devices.map((d) => (
                <option key={d.serial} value={d.serial}>
                  {d.serial} ({d.state})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="filemgr-refresh-btn"
              onClick={() => fetchFiles(selectedSerial, currentPath)}
              disabled={loading}
            >
              刷新
            </button>
          </div>

          <div className="filemgr-breadcrumb">
            {breadcrumbSegments.map((seg, i) => {
              const isLast = i === breadcrumbSegments.length - 1;
              return (
                <span key={seg.path}>
                  {i > 0 && <span className="filemgr-breadcrumb-sep"> &gt; </span>}
                  {isLast ? (
                    <span className="filemgr-breadcrumb-item active">{seg.label}</span>
                  ) : (
                    <span
                      className="filemgr-breadcrumb-item"
                      onClick={() => navigateTo(seg.path)}
                    >
                      {seg.label}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          <div className="filemgr-list">
            {/* Parent directory row */}
            {currentPath !== "/" && (
              <div className="filemgr-row is-dir" onClick={goToParent}>
                <span className="filemgr-row-icon">目录</span>
                <span className="filemgr-row-name">..</span>
                <span className="filemgr-row-size">—</span>
                <span className="filemgr-row-date"></span>
                <span className="filemgr-row-actions"></span>
              </div>
            )}

            {loading && files.length === 0 ? (
              <div className="filemgr-loading">加载中...</div>
            ) : !loading && files.length === 0 ? (
              <div className="filemgr-empty-dir">此目录为空</div>
            ) : (
              files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className={`filemgr-row${f.is_dir ? " is-dir" : ""}`}
                  onClick={f.is_dir ? () => navigateTo(currentPath + "/" + f.name) : undefined}
                >
                  <span className="filemgr-row-icon">
                    {f.is_dir ? "目录" : "文件"}
                  </span>
                  <span className="filemgr-row-name">{f.name}</span>
                  <span className="filemgr-row-size">
                    {f.is_dir ? "—" : formatFileSize(f.size)}
                  </span>
                  <span className="filemgr-row-date">{f.modified}</span>
                  <span className="filemgr-row-actions">
                    <button
                      type="button"
                      className="filemgr-action-btn"
                      onClick={(e) => { e.stopPropagation(); handleDownload(f.name); }}
                    >
                      导出
                    </button>
                    <button
                      type="button"
                      className="filemgr-action-btn is-delete"
                      onClick={(e) => { e.stopPropagation(); handleDelete(f.name, f.is_dir); }}
                    >
                      删除
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>

          {errorText && (
            <p className="filemgr-error">{errorText}</p>
          )}

          <div className="filemgr-footer">
            <span className="filemgr-count">共 {files.length} 项</span>
          </div>
        </>
      )}
    </div>
  );
}

interface MemoItem {
  id: string;
  content: string;
  deadline_epoch: number;
  completed: boolean;
}

function MemoWorkArea() {
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [deadline, setDeadline] = useState(() => {
    // Default: 30 minutes from now, as "YYYY-MM-DDTHH:MM"
    const d = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());

  // Sync with backend every 5s
  const fetchMemos = useCallback(async () => {
    try {
      const list: MemoItem[] = await invoke("load_memos");
      list.sort((a, b) => a.deadline_epoch - b.deadline_epoch);
      setMemos(list);
    } catch (e) {
      setErrorText(String(e));
    }
  }, []);

  // Tick clock every second for countdown display
  useEffect(() => {
    fetchMemos();
    const syncInterval = setInterval(fetchMemos, 5000);
    const tickInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(syncInterval);
      clearInterval(tickInterval);
    };
  }, [fetchMemos]);

  const handleSave = useCallback(async () => {
    if (!inputText.trim()) {
      setErrorText("请输入备忘录内容");
      return;
    }
    if (!deadline) {
      setErrorText("请选择截止时间");
      return;
    }
    setErrorText("");
    const deadlineEpoch = Math.floor(new Date(deadline).getTime() / 1000);
    try {
      await invoke("save_memo", { content: inputText.trim(), deadlineEpoch });
      setInputText("");
      fetchMemos();
    } catch (e) {
      setErrorText(String(e));
    }
  }, [inputText, deadline, fetchMemos]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("确定要删除这条备忘录吗？")) return;
    try {
      await invoke("delete_memo", { id });
      fetchMemos();
    } catch (e) {
      setErrorText(String(e));
    }
  }, [fetchMemos]);

  const formatCountdown = (deadlineEpoch: number): string => {
    const remain = deadlineEpoch - Math.floor(now / 1000);
    if (remain <= 0) return "已过期";
    const h = Math.floor(remain / 3600);
    const m = Math.floor((remain % 3600) / 60);
    const s = remain % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  return (
    <div className="memo-work">
      <div className="memo-list">
        {memos.length === 0 ? (
          <div className="memo-empty">暂无备忘录</div>
        ) : (
          memos.map((m) => (
            <div key={m.id} className="memo-row">
              <span className="memo-row-content">{m.content}</span>
              <span className={`memo-row-countdown${m.completed ? " is-completed" : ""}`}>
                {m.completed ? "已完成" : formatCountdown(m.deadline_epoch)}
              </span>
              <button
                type="button"
                className="memo-delete-btn"
                onClick={() => handleDelete(m.id)}
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>

      {errorText && <p className="memo-error">{errorText}</p>}

      <div className="memo-input-bar">
        <input
          type="text"
          className="memo-input"
          placeholder="输入备忘录内容..."
          value={inputText}
          onChange={(e) => setInputText(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
        <input
          type="datetime-local"
          className="memo-datetime"
          value={deadline}
          onChange={(e) => setDeadline(e.currentTarget.value)}
        />
        <button type="button" className="memo-save-btn" onClick={handleSave}>
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
    case "photo-1inch":
      return <Photo1InchWorkArea />;
    case "image-compress":
      return <ImageCompressWorkArea />;
    case "color-picker":
      return <ColorPickerWorkArea />;
    case "timestamp-converter":
      return <TimestampConverterWorkArea />;
    case "schedule-shutdown":
      return <ScheduleShutdownWorkArea />;
    case "network-speed-test":
      return <NetworkSpeedWorkArea />;
    case "mobile-debug":
      return <MobileDebugWorkArea />;
    case "adb-file-manager":
      return <AdbFileManagerWorkArea />;
    case "memo":
      return <MemoWorkArea />;
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
