import { useState, useEffect, useCallback } from "react";
import "./TimestampConverterWorkArea.css";

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function formatDatetime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function detectUnit(ts: number): "s" | "ms" {
  return ts > 9999999999 ? "ms" : "s";
}

function tsToDate(ts: number, unit: "s" | "ms"): Date {
  return new Date(unit === "s" ? ts * 1000 : ts);
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  });
}

function TimestampConverterWorkArea() {
  // live clock
  const [now, setNow] = useState(new Date());

  // timestamp → datetime
  const [tsInput, setTsInput] = useState("");
  const [tsUnit, setTsUnit] = useState<"s" | "ms" | null>(null);
  const [tsResult, setTsResult] = useState("");

  // datetime → timestamp
  const [dtInput, setDtInput] = useState("");
  const [dtResultS, setDtResultS] = useState("");
  const [dtResultMs, setDtResultMs] = useState("");

  // Live clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 200);
    return () => clearInterval(id);
  }, []);

  // --- timestamp → datetime ---

  const handleTsChange = useCallback((raw: string) => {
    setTsInput(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      setTsUnit(null);
      setTsResult("");
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      setTsUnit(null);
      setTsResult("");
      return;
    }
    const unit = detectUnit(num);
    setTsUnit(unit);
    const d = tsToDate(num, unit);
    if (isNaN(d.getTime())) {
      setTsResult("");
      return;
    }
    setTsResult(formatDatetime(d));
  }, []);

  // --- datetime → timestamp ---

  const handleDtChange = useCallback((raw: string) => {
    setDtInput(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      setDtResultS("");
      setDtResultMs("");
      return;
    }
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) {
      setDtResultS("");
      setDtResultMs("");
      return;
    }
    const sec = Math.floor(d.getTime() / 1000);
    setDtResultS(String(sec));
    setDtResultMs(String(d.getTime()));
  }, []);

  const nowS = Math.floor(now.getTime() / 1000);
  const nowMs = now.getTime();

  return (
    <div className="timestamp-work">
      {/* live clock */}
      <div className="ts-live-clock">
        <div className="ts-live-time-row">
          <span className="ts-live-time">{formatDatetime(now)}</span>
          <button
            className="ts-copy-btn"
            onClick={() => copyText(formatDatetime(now))}
            title="复制当前时间"
          />
        </div>
        <div className="ts-live-stamps">
          <div className="ts-live-row">
            <span className="ts-live-label">秒</span>
            <span className="ts-live-value">{nowS}</span>
            <button
              className="ts-copy-btn"
              onClick={() => copyText(String(nowS))}
              title="复制秒级时间戳"
            />
          </div>
          <div className="ts-live-row">
            <span className="ts-live-label">毫秒</span>
            <span className="ts-live-value">{nowMs}</span>
            <button
              className="ts-copy-btn"
              onClick={() => copyText(String(nowMs))}
              title="复制毫秒级时间戳"
            />
          </div>
        </div>
      </div>

      {/* timestamp → datetime */}
      <div className="ts-section">
        <div className="ts-section-header">时间戳 → 时间</div>
        <div className="ts-input-row">
          <input
            className="ts-input"
            placeholder="输入时间戳，如 1747729825"
            value={tsInput}
            onChange={(e) => handleTsChange(e.target.value)}
          />
          {tsUnit && (
            <span className={`ts-unit-badge ${tsUnit === "ms" ? "ts-unit-ms" : "ts-unit-s"}`}>
              {tsUnit === "ms" ? "毫秒" : "秒"}
            </span>
          )}
        </div>
        {tsResult && (
          <div className="ts-result">{tsResult}</div>
        )}
      </div>

      {/* datetime → timestamp */}
      <div className="ts-section">
        <div className="ts-section-header">时间 → 时间戳</div>
        <div className="ts-input-row">
          <input
            className="ts-input"
            placeholder="输入时间，如 2026-05-20 14:30:00"
            value={dtInput}
            onChange={(e) => handleDtChange(e.target.value)}
          />
        </div>
        {dtResultS && (
          <div className="ts-result-group">
            <div className="ts-result-row">
              <span className="ts-result-label">秒</span>
              <span className="ts-result-value">{dtResultS}</span>
            </div>
            <div className="ts-result-row">
              <span className="ts-result-label">毫秒</span>
              <span className="ts-result-value">{dtResultMs}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TimestampConverterWorkArea;
