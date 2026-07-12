import { useState, useEffect, useCallback, useRef } from "react";
import "./DeepseekBalanceWorkArea.css";

const SK_KEY = "deepseek_api_key";
const SK_INT = "deepseek_refresh_interval";
const SK_RUN = "deepseek_is_running";
const API_URL = "https://api.deepseek.com/user/balance";

interface BalanceInfo {
  currency: string;
  total_balance: string;
  total_used: string;
  remaining_balance: string;
}

interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

function fmtCurrency(code: string): string {
  const m: Record<string, string> = { CNY: "¥", USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  return m[code] ?? code;
}

function formatRefresh(timestamp: number | null): string {
  if (timestamp === null) return "--";
  const d = new Date(timestamp);
  const p = (n: number) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return "***";
  return key.slice(0, 7) + "****" + key.slice(-4);
}

export default function DeepseekBalanceWorkArea() {
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem(SK_KEY) || ""; }
    catch { return ""; }
  });
  const [showKey, setShowKey] = useState(false);
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [intervalMin, setIntervalMin] = useState(() => {
    try { return Number(localStorage.getItem(SK_INT)) || 30; }
    catch { return 30; }
  });
  const [isRunning, setIsRunning] = useState(() => {
    try { return localStorage.getItem(SK_RUN) === "1"; }
    catch { return false; }
  });
  const [detailTab, setDetailTab] = useState<"request" | "response" | null>(null);
  const [reqInfo, setReqInfo] = useState({ status: 0, statusText: "", rawBody: "", time: 0 });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;
  const intervalRef = useRef(intervalMin);
  intervalRef.current = intervalMin;

  const fetchBalance = useCallback(async (key?: string) => {
    const k = key ?? apiKeyRef.current;
    if (!k.trim()) { setError("请输入 API Key"); return; }
    setLoading(true); setError("");
    const startTime = performance.now();
    try {
      const res = await fetch(API_URL, {
        headers: { Authorization: "Bearer " + k.trim() },
      });
      const rawBody = await res.text();
      const elapsed = Math.round(performance.now() - startTime);
      if (!res.ok) {
        setReqInfo({ status: res.status, statusText: res.statusText, rawBody, time: elapsed });
        if (res.status === 401 || res.status === 403) throw new Error("API Key 无效");
        throw new Error("请求失败 (" + res.status + ")");
      }
      const json: BalanceResponse = JSON.parse(rawBody);
      setData(json);
      setLastRefresh(Date.now());
      setReqInfo({ status: res.status, statusText: res.statusText, rawBody, time: elapsed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SK_INT, String(intervalMin)); }
    catch {}
  }, [intervalMin]);

  useEffect(() => {
    try { localStorage.setItem(SK_RUN, isRunning ? "1" : "0"); }
    catch {}
  }, [isRunning]);

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (isRunning && apiKeyRef.current.trim()) {
      timerRef.current = setInterval(() => { fetchBalance(); }, intervalRef.current * 60 * 1000);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [isRunning, fetchBalance]);

  const saveKey = useCallback(() => {
    try { localStorage.setItem(SK_KEY, apiKey.trim()); } catch {}
  }, [apiKey]);

  const handleRefresh = useCallback(() => {
    saveKey(); fetchBalance();
  }, [saveKey, fetchBalance]);

  const handleToggle = useCallback(() => {
    if (!apiKey.trim()) { setError("请先设置 API Key"); return; }
    if (!isRunning) { fetchBalance(); }
    setIsRunning((p) => !p);
  }, [isRunning, apiKey, fetchBalance]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { handleRefresh(); }
  }, [handleRefresh]);

  useEffect(() => {
    if (isRunning && apiKey.trim()) { fetchBalance(apiKey); }
  }, []);

  const reqHeaders = "GET " + API_URL + "\nAuthorization: Bearer " + maskKey(apiKey);

  const resPretty = (() => {
    try { return JSON.stringify(JSON.parse(reqInfo.rawBody), null, 2); }
    catch { return reqInfo.rawBody; }
  })();

  return (
    <div className="deepseek-work">
      <div className="deepseek-section">
        <div className="deepseek-section-header">API Key</div>
        <div className="deepseek-key-row">
          <div className="deepseek-key-input-wrap">
            <input className="deepseek-key-input" type={showKey ? "text" : "password"}
              placeholder="输入 DeepSeek API Key" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} onKeyDown={handleKeyDown}
              onBlur={saveKey} spellCheck={false} />
            <button type="button" className="deepseek-key-toggle"
              onClick={() => setShowKey((v) => !v)} title={showKey ? "隐藏" : "显示"}>
              {showKey ? "隐藏" : "显示"}</button>
          </div>
        </div>
      </div>

      <div className="deepseek-section">
        <div className="deepseek-section-header">余额信息</div>
        {error && <div className="deepseek-error">{error}</div>}
        {loading ? <div className="deepseek-loading">查询中...</div> : data && data.balance_infos.length > 0 ? (
          <div className="deepseek-balances">
            {data.balance_infos.map((bi, i) => {
              const rem = parseFloat(bi.remaining_balance);
              return (
                <div key={i}>
                  {data.balance_infos.length > 1 && (
                    <div className="deepseek-balance-label-row">
                      <span className="deepseek-currency-tag">{fmtCurrency(bi.currency)} {bi.currency}</span>
                    </div>
                  )}
                  <div className="deepseek-balance-grid">
                    <div className="deepseek-balance-item">
                      <span className="deepseek-balance-label">总额</span>
                      <span className="deepseek-balance-value">{bi.total_balance || "--"}{" " + fmtCurrency(bi.currency)}</span>
                    </div>
                    <div className="deepseek-balance-item">
                      <span className="deepseek-balance-label">已用</span>
                      <span className="deepseek-balance-value deepseek-used">{bi.total_used || "--"}{" " + fmtCurrency(bi.currency)}</span>
                    </div>
                    <div className="deepseek-balance-item">
                      <span className="deepseek-balance-label">剩余</span>
                      <span className={"deepseek-balance-value deepseek-remaining" + (!isNaN(rem) ? (rem > 5 ? " is-rich" : rem > 1 ? " is-ok" : " is-low") : "")}>
                        {bi.remaining_balance || "--"}{" " + fmtCurrency(bi.currency)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="deepseek-placeholder">设置 API Key 后点击刷新</div>}
      </div>

      <div className="deepseek-section">
        <div className="deepseek-section-header">查询控制</div>
        <div className="deepseek-controls">
          <button type="button" className="deepseek-btn deepseek-refresh-btn"
            onClick={handleRefresh} disabled={loading || !apiKey.trim()}>
            {loading ? "查询中..." : "刷新"}</button>
          <button type="button" className={"deepseek-btn deepseek-timer-btn" + (isRunning ? " is-active" : "")}
            onClick={handleToggle}>
            {isRunning ? "停止定时" : "定时查询"}</button>
        </div>
        <div className="deepseek-interval-row">
          <label className="deepseek-interval-label">
            查询间隔 <span className="deepseek-interval-value">{intervalMin} 分钟</span></label>
          <input type="range" className="deepseek-interval-slider" min={5} max={120} step={5}
            value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))}
            disabled={isRunning} />
          <div className="deepseek-interval-ends"><span>5m</span><span>120m</span></div>
        </div>
      </div>

      <div className="deepseek-status-bar">
        <span className="deepseek-status-item">上次刷新：{formatRefresh(lastRefresh)}</span>
        {isRunning && <span className="deepseek-status-item deepseek-timer-active">● 定时中（每 {intervalMin} 分钟）</span>}
        {!isRunning && !loading && <span className="deepseek-status-item deepseek-timer-idle">定时未开启</span>}
      </div>

      {reqInfo.rawBody && (
        <div className="deepseek-section deepseek-detail-section">
          <div className="deepseek-detail-tabs">
            <button className={"deepseek-detail-tab" + (detailTab === "request" ? " is-active" : "")}
              onClick={() => setDetailTab((p) => p === "request" ? null : "request")}>
              请求参数</button>
            <button className={"deepseek-detail-tab" + (detailTab === "response" ? " is-active" : "")}
              onClick={() => setDetailTab((p) => p === "response" ? null : "response")}>
              响应参数</button>
            {reqInfo.status > 0 && (
              <span className={"deepseek-response-status" + (reqInfo.status >= 200 && reqInfo.status < 300 ? "" : " is-err")}>
                {reqInfo.status} {reqInfo.statusText} | {reqInfo.time}ms</span>
            )}
          </div>
          {detailTab === "request" && (
            <pre className="deepseek-detail-pre">{reqHeaders}</pre>
          )}
          {detailTab === "response" && (
            <pre className="deepseek-detail-pre">{resPretty}</pre>
          )}
        </div>
      )}
    </div>
  );
}