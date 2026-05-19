import { useState, useEffect, useRef, useCallback } from "react";
import "./ColorPickerWorkArea.css";

const CANVAS_SIZE = 280;

interface ColorInfo {
  rgb: { r: number; g: number; b: number };
  hex: string;
  hsl: { h: number; s: number; l: number };
  hsv: { h: number; s: number; v: number };
}

// --- color conversion utilities ---

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }

  return {
    h: Math.round(h * 360),
    s: max === 0 ? 0 : Math.round((d / max) * 100),
    v: Math.round(max * 100),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(
  r: number, g: number, b: number
): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
    case gn: h = ((bn - rn) / d + 2) / 6; break;
    case bn: h = ((rn - gn) / d + 4) / 6; break;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return null;
  const num = parseInt(h, 16);
  if (isNaN(num)) return null;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// --- input parsers ---

function parseRgbInput(raw: string): [number, number, number] | null {
  const cleaned = raw.replace(/rgb\(|\)/gi, "").trim();
  const parts = cleaned.split(/[\s,]+/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [r, g, b] = parts;
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
  return [r, g, b];
}

function parseHslInput(raw: string): [number, number, number] | null {
  const cleaned = raw.replace(/hsl\(|\)|°/gi, "").replace(/%/g, "").trim();
  const parts = cleaned.split(/[\s,]+/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [h, s, l] = parts;
  if (h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) return null;
  return [h, s, l];
}

function parseHsvInput(raw: string): [number, number, number] | null {
  const cleaned = raw.replace(/hsv\(|\)|°/gi, "").replace(/%/g, "").trim();
  const parts = cleaned.split(/[\s,]+/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [h, s, v] = parts;
  if (h < 0 || h > 360 || s < 0 || s > 100 || v < 0 || v > 100) return null;
  return [h, s, v];
}

function parseHexInput(raw: string): [number, number, number] | null {
  return hexToRgb(raw.trim());
}

// --- position math ---

function hsvToPosition(h: number, s: number): { x: number; y: number } {
  const angle = (h * Math.PI) / 180;
  const dist = (s / 100) * (CANVAS_SIZE / 2);
  return {
    x: CANVAS_SIZE / 2 + Math.cos(angle) * dist,
    y: CANVAS_SIZE / 2 + Math.sin(angle) * dist,
  };
}

function buildColorInfo(r: number, g: number, b: number): ColorInfo {
  return {
    rgb: { r, g, b },
    hex: rgbToHex(r, g, b),
    hsl: rgbToHsl(r, g, b),
    hsv: rgbToHsv(r, g, b),
  };
}

function formatRgb(info: ColorInfo): string {
  return `${info.rgb.r}, ${info.rgb.g}, ${info.rgb.b}`;
}

function formatHsl(info: ColorInfo): string {
  return `${info.hsl.h}°, ${info.hsl.s}%, ${info.hsl.l}%`;
}

function formatHsv(info: ColorInfo): string {
  return `${info.hsv.h}°, ${info.hsv.s}%, ${info.hsv.v}%`;
}

// --- component ---

function ColorPickerWorkArea() {
  const [selectedColor, setSelectedColor] = useState<ColorInfo | null>(null);
  const [selectedPos, setSelectedPos] = useState<{ x: number; y: number } | null>(null);
  const [hexInput, setHexInput] = useState("");
  const [rgbInput, setRgbInput] = useState("");
  const [hslInput, setHslInput] = useState("");
  const [hsvInput, setHsvInput] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImageDataRef = useRef<ImageData | null>(null);
  const draggingRef = useRef(false);

  // Build the HSV color wheel once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const half = CANVAS_SIZE / 2;
    const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);

    for (let py = 0; py < CANVAS_SIZE; py++) {
      for (let px = 0; px < CANVAS_SIZE; px++) {
        const dx = px - half;
        const dy = py - half;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const idx = (py * CANVAS_SIZE + px) * 4;

        if (dist <= half) {
          const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
          const sat = dist / half;
          const [r, g, b] = hsvToRgb(hue, sat, 1);

          imageData.data[idx] = r;
          imageData.data[idx + 1] = g;
          imageData.data[idx + 2] = b;
          imageData.data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    baseImageDataRef.current = imageData;
  }, []);

  // Redraw indicator when selection changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImageDataRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.putImageData(baseImageDataRef.current, 0, 0);

    if (selectedPos) {
      const { x, y } = selectedPos;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [selectedPos]);

  // Update color from any source and sync all inputs
  const applyColor = useCallback((r: number, g: number, b: number) => {
    const info = buildColorInfo(r, g, b);
    const pos = hsvToPosition(info.hsv.h, info.hsv.s);
    setSelectedColor(info);
    setSelectedPos(pos);
    setHexInput(info.hex);
    setRgbInput(formatRgb(info));
    setHslInput(formatHsl(info));
    setHsvInput(formatHsv(info));
  }, []);

  // Pick a color from the wheel (mouse)
  const pickColor = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const half = CANVAS_SIZE / 2;
    const dx = x - half;
    const dy = y - half;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > half) return;

    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const sat = dist / half;
    const [r, g, b] = hsvToRgb(hue, sat, 1);

    applyColor(r, g, b);
  }, [applyColor]);

  // --- mouse handlers ---

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    pickColor(e.clientX, e.clientY);
  }, [pickColor]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    pickColor(e.clientX, e.clientY);
  }, [pickColor]);

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // --- input handlers ---

  const handleHexChange = useCallback((raw: string) => {
    setHexInput(raw);
    const rgb = parseHexInput(raw);
    if (rgb) {
      const info = buildColorInfo(rgb[0], rgb[1], rgb[2]);
      setSelectedColor(info);
      setSelectedPos(hsvToPosition(info.hsv.h, info.hsv.s));
      setRgbInput(formatRgb(info));
      setHslInput(formatHsl(info));
      setHsvInput(formatHsv(info));
    }
  }, []);

  const handleRgbChange = useCallback((raw: string) => {
    setRgbInput(raw);
    const rgb = parseRgbInput(raw);
    if (rgb) {
      const info = buildColorInfo(rgb[0], rgb[1], rgb[2]);
      setSelectedColor(info);
      setSelectedPos(hsvToPosition(info.hsv.h, info.hsv.s));
      setHexInput(info.hex);
      setHslInput(formatHsl(info));
      setHsvInput(formatHsv(info));
    }
  }, []);

  const handleHslChange = useCallback((raw: string) => {
    setHslInput(raw);
    const hsl = parseHslInput(raw);
    if (hsl) {
      const [r, g, b] = hslToRgb(hsl[0], hsl[1], hsl[2]);
      const info = buildColorInfo(r, g, b);
      setSelectedColor(info);
      setSelectedPos(hsvToPosition(info.hsv.h, info.hsv.s));
      setHexInput(info.hex);
      setRgbInput(formatRgb(info));
      setHsvInput(formatHsv(info));
    }
  }, []);

  const handleHsvChange = useCallback((raw: string) => {
    setHsvInput(raw);
    const hsv = parseHsvInput(raw);
    if (hsv) {
      const [r, g, b] = hsvToRgb(hsv[0], hsv[1] / 100, hsv[2] / 100);
      const info = buildColorInfo(r, g, b);
      setSelectedColor(info);
      setSelectedPos(hsvToPosition(info.hsv.h, info.hsv.s));
      setHexInput(info.hex);
      setRgbInput(formatRgb(info));
      setHslInput(formatHsl(info));
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  }, []);

  return (
    <div className="color-picker-work">
      <div className="color-picker-board">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="color-picker-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
        />
      </div>

      {selectedColor && (
        <div className="color-picker-result">
          <div className="color-picker-preview-group">
            <div
              className="color-picker-preview"
              style={{ backgroundColor: selectedColor.hex }}
            />
            <div className="color-picker-hex-input-wrap">
              <input
                className="color-picker-hex-input"
                value={hexInput}
                onChange={(e) => handleHexChange(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>

          <div className="color-picker-values">
            <div className="color-picker-value-row">
              <span className="color-picker-label">RGB</span>
              <input
                className="color-picker-value-input"
                value={rgbInput}
                onChange={(e) => handleRgbChange(e.target.value)}
                spellCheck={false}
              />
              <button
                className="color-picker-copy-btn"
                onClick={() => copyToClipboard(`rgb(${selectedColor.rgb.r}, ${selectedColor.rgb.g}, ${selectedColor.rgb.b})`)}
                title="复制 RGB"
              />
            </div>
            <div className="color-picker-value-row">
              <span className="color-picker-label">HSL</span>
              <input
                className="color-picker-value-input"
                value={hslInput}
                onChange={(e) => handleHslChange(e.target.value)}
                spellCheck={false}
              />
              <button
                className="color-picker-copy-btn"
                onClick={() => copyToClipboard(`hsl(${selectedColor.hsl.h}°, ${selectedColor.hsl.s}%, ${selectedColor.hsl.l}%)`)}
                title="复制 HSL"
              />
            </div>
            <div className="color-picker-value-row">
              <span className="color-picker-label">HSV</span>
              <input
                className="color-picker-value-input"
                value={hsvInput}
                onChange={(e) => handleHsvChange(e.target.value)}
                spellCheck={false}
              />
              <button
                className="color-picker-copy-btn"
                onClick={() => copyToClipboard(`hsv(${selectedColor.hsv.h}°, ${selectedColor.hsv.s}%, ${selectedColor.hsv.v}%)`)}
                title="复制 HSV"
              />
            </div>
          </div>
        </div>
      )}

      {!selectedColor && (
        <p className="color-picker-hint">点击取色盘选取颜色</p>
      )}
    </div>
  );
}

export default ColorPickerWorkArea;
