import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import "./ApiDebuggerWorkArea.css";

type MainTab = "api" | "socket";
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
type ParamType = "query" | "form" | "json";
type ResponseTab = "body" | "req-headers" | "res-headers";

interface KeyValuePair {
  id: number;
  key: string;
  value: string;
}

interface HttpResponse {
  status: number;
  statusText: string;
  resHeaders: Record<string, string>;
  body: string;
  time: number;
  reqHeaders: Record<string, string>;
}

interface SocketMessage {
  id: number;
  type: "sent" | "received" | "system" | "error";
  content: string;
  timestamp: number;
}

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "api", label: "接口调试" },
  { id: "socket", label: "Socket调试" },
];

const PARAM_TYPE_LABELS: Record<ParamType, string> = {
  query: "Query 参数",
  form: "表单数据",
  json: "JSON 请求体",
};

function formatJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

let nextId = 1;
function newPair(key = "", value = ""): KeyValuePair {
  return { id: nextId++, key, value };
}

export default function ApiDebuggerWorkArea() {
  const [mainTab, setMainTab] = useState<MainTab>("api");

  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [paramType, setParamType] = useState<ParamType>("query");
  const [params, setParams] = useState<KeyValuePair[]>([newPair()]);
  const [jsonBody, setJsonBody] = useState("");
  const [headers, setHeaders] = useState<KeyValuePair[]>([newPair("Content-Type", "application/json")]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");

  // --- socket state ---
  const [socketUrl, setSocketUrl] = useState("ws://");
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketConnecting, setSocketConnecting] = useState(false);
  const [socketMessages, setSocketMessages] = useState<SocketMessage[]>([]);
  const [socketInput, setSocketInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const socketMsgId = useRef(0);
  const socketLogRef = useRef<HTMLDivElement | null>(null);

  const addSocketMsg = useCallback((type: SocketMessage["type"], content: string) => {
    socketMsgId.current += 1;
    setSocketMessages((prev) => [...prev, { id: socketMsgId.current, type, content, timestamp: Date.now() }]);
  }, []);

  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg((s) => (s === msg ? "" : s)), 4000);
  }, []);

  const availableParamTypes = useMemo<ParamType[]>(() => {
    if (method === "GET" || method === "HEAD" || method === "DELETE") {
      return ["query"];
    }
    return ["query", "form", "json"];
  }, [method]);

  const effectiveParamType: ParamType = availableParamTypes.includes(paramType) ? paramType : availableParamTypes[0];

  const handleAddParam = () => setParams((prev) => [...prev, newPair()]);
  const handleRemoveParam = (id: number) => setParams((prev) => prev.filter((p) => p.id !== id));
  const handleUpdateParam = (id: number, field: "key" | "value", val: string) => {
    setParams((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const handleAddHeader = () => setHeaders((prev) => [...prev, newPair()]);
  const handleRemoveHeader = (id: number) => setHeaders((prev) => prev.filter((h) => h.id !== id));
  const handleUpdateHeader = (id: number, field: "key" | "value", val: string) => {
    setHeaders((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: val } : h)));
  };

  const handleSend = async () => {
    if (!url.trim()) {
      showStatus("请输入请求 URL");
      return;
    }

    setLoading(true);
    setResponse(null);
    const startTime = performance.now();

    try {
      let finalUrl = url.trim();
      const queryPairs = effectiveParamType === "query"
        ? params.filter((p) => p.key.trim())
        : [];

      if (queryPairs.length > 0) {
        const sp = new URLSearchParams();
        queryPairs.forEach((p) => sp.append(p.key, p.value));
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + sp.toString();
      }

      const reqHeaders: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key.trim()) reqHeaders[h.key] = h.value;
      });

      const fetchOpts: RequestInit = { method };

      if (method !== "GET" && method !== "HEAD") {
        if (effectiveParamType === "json") {
          if (!reqHeaders["Content-Type"]) {
            reqHeaders["Content-Type"] = "application/json";
          }
          fetchOpts.body = jsonBody || "{}";
        } else if (effectiveParamType === "form") {
          const formPairs = params.filter((p) => p.key.trim());
          if (formPairs.length > 0) {
            const fd = new URLSearchParams();
            formPairs.forEach((p) => fd.append(p.key, p.value));
            fetchOpts.body = fd.toString();
            if (!reqHeaders["Content-Type"]) {
              reqHeaders["Content-Type"] = "application/x-www-form-urlencoded";
            }
          }
        }
      }

      fetchOpts.headers = reqHeaders;
      const sentReqHeaders = { ...reqHeaders };

      const res = await fetch(finalUrl, fetchOpts);
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      const body = await res.text();
      const elapsed = Math.round(performance.now() - startTime);

      setResponse({
        status: res.status,
        statusText: res.statusText,
        resHeaders,
        body,
        time: elapsed,
        reqHeaders: sentReqHeaders,
      });
    } catch (e: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setResponse({
        status: 0,
        statusText: "请求失败",
        resHeaders: {},
        body: String(e),
        time: elapsed,
        reqHeaders: {},
      });
    } finally {
      setLoading(false);
    }
  };

  // --- socket handlers ---

  const handleSocketConnect = useCallback(() => {
    if (!socketUrl.trim()) {
      showStatus("请输入 WebSocket 地址");
      return;
    }
    if (wsRef.current) {
      wsRef.current.close();
    }

    setSocketConnecting(true);
    setSocketMessages([]);
    socketMsgId.current = 0;

    try {
      const ws = new WebSocket(socketUrl.trim());
      wsRef.current = ws;

      ws.onopen = () => {
        setSocketConnected(true);
        setSocketConnecting(false);
        addSocketMsg("system", "连接已建立");
      };

      ws.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : "[Binary data]";
        addSocketMsg("received", data);
      };

      ws.onerror = () => {
        addSocketMsg("error", "连接发生错误");
      };

      ws.onclose = (event) => {
        setSocketConnected(false);
        setSocketConnecting(false);
        wsRef.current = null;
        const reason = event.reason ? ` (${event.reason})` : "";
        addSocketMsg("system", `连接已关闭，状态码: ${event.code}${reason}`);
      };
    } catch (e: any) {
      setSocketConnecting(false);
      showStatus(`连接失败: ${e}`);
    }
  }, [socketUrl, addSocketMsg, showStatus]);

  const handleSocketDisconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, "主动断开");
    }
  }, []);

  const handleSocketSend = useCallback(() => {
    if (!wsRef.current || !socketConnected) {
      showStatus("请先建立连接");
      return;
    }
    if (!socketInput.trim()) return;

    wsRef.current.send(socketInput);
    addSocketMsg("sent", socketInput);
    setSocketInput("");
  }, [socketConnected, socketInput, addSocketMsg, showStatus]);

  const handleClearMessages = useCallback(() => {
    setSocketMessages([]);
    socketMsgId.current = 0;
  }, []);

  // auto-scroll socket log
  useEffect(() => {
    if (socketLogRef.current) {
      socketLogRef.current.scrollTop = socketLogRef.current.scrollHeight;
    }
  }, [socketMessages]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, "页面关闭");
      }
    };
  }, []);

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  }

  function tryFormatJson(s: string): string {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }

  return (
    <div className="api-debugger-work">
      <div className="api-main-tabs">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            className={`api-main-tab${mainTab === t.id ? " api-main-tab--active" : ""}`}
            onClick={() => setMainTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="api-main-body">
        {mainTab === "api" && (
          <div className="api-panel">
            {/* request bar */}
            <div className="api-request-bar">
              <select
                className="api-method-select"
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                className="api-url-input"
                placeholder="输入请求 URL，如 https://api.example.com/data"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              />
              <button
                className="api-send-btn"
                onClick={handleSend}
                disabled={loading}
              >
                {loading ? "发送中…" : "发送"}
              </button>
            </div>

            {/* param type selector */}
            <div className="api-param-type-bar">
              {(["query", "form", "json"] as ParamType[]).map((t) => (
                <button
                  key={t}
                  className={`api-param-type-btn${effectiveParamType === t ? " api-param-type-btn--active" : ""}${!availableParamTypes.includes(t) ? " api-param-type-btn--disabled" : ""}`}
                  onClick={() => availableParamTypes.includes(t) && setParamType(t)}
                  disabled={!availableParamTypes.includes(t)}
                >
                  {PARAM_TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {/* headers section */}
            <div className="api-section">
              <div className="api-section-header">
                <span className="api-section-title">请求头</span>
                <button className="api-add-btn" onClick={handleAddHeader}>+ 添加</button>
              </div>
              <div className="api-kv-list">
                {headers.map((h) => (
                  <div key={h.id} className="api-kv-row">
                    <input
                      className="api-kv-key"
                      placeholder="Header 名"
                      value={h.key}
                      onChange={(e) => handleUpdateHeader(h.id, "key", e.target.value)}
                    />
                    <input
                      className="api-kv-value"
                      placeholder="Header 值"
                      value={h.value}
                      onChange={(e) => handleUpdateHeader(h.id, "value", e.target.value)}
                    />
                    <button className="api-kv-remove" onClick={() => handleRemoveHeader(h.id)}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* params / body section */}
            <div className="api-section">
              <div className="api-section-header">
                <span className="api-section-title">
                  {effectiveParamType === "json" ? "请求体 (JSON)" : PARAM_TYPE_LABELS[effectiveParamType]}
                </span>
                {effectiveParamType !== "json" && (
                  <button className="api-add-btn" onClick={handleAddParam}>+ 添加</button>
                )}
              </div>
              {effectiveParamType === "json" ? (
                <textarea
                  className="api-json-input"
                  placeholder='{"key": "value"}'
                  value={jsonBody}
                  onChange={(e) => setJsonBody(e.target.value)}
                  rows={5}
                  spellCheck={false}
                />
              ) : (
                <div className="api-kv-list">
                  {params.map((p) => (
                    <div key={p.id} className="api-kv-row">
                      <input
                        className="api-kv-key"
                        placeholder="参数名"
                        value={p.key}
                        onChange={(e) => handleUpdateParam(p.id, "key", e.target.value)}
                      />
                      <input
                        className="api-kv-value"
                        placeholder="参数值"
                        value={p.value}
                        onChange={(e) => handleUpdateParam(p.id, "value", e.target.value)}
                      />
                      <button className="api-kv-remove" onClick={() => handleRemoveParam(p.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* response section */}
            <div className="api-response-section">
              <div className="api-response-topbar">
                <div className="api-response-tabs">
                  {([
                    ["body", "响应体"],
                    ["req-headers", "请求头"],
                    ["res-headers", "响应头"],
                  ] as [ResponseTab, string][]).map(([id, label]) => (
                    <button
                      key={id}
                      className={`api-response-tab${responseTab === id ? " api-response-tab--active" : ""}`}
                      onClick={() => setResponseTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {response && (
                  <div className="api-response-meta">
                    <span className={`api-status-code${response.status >= 200 && response.status < 300 ? " api-status-ok" : response.status === 0 || response.status >= 400 ? " api-status-err" : ""}`}>
                      {response.status > 0 ? `${response.status} ${response.statusText}` : "请求失败"}
                    </span>
                    <span className="api-response-time">{response.time}ms</span>
                  </div>
                )}
              </div>
              <div className="api-response-body">
                {!response && !loading && (
                  <div className="api-response-placeholder">点击"发送"按钮发起请求</div>
                )}
                {loading && (
                  <div className="api-response-placeholder">请求中…</div>
                )}
                {response && responseTab === "body" && (
                  <pre className="api-response-pre">{formatJson(response.body)}</pre>
                )}
                {response && responseTab === "req-headers" && (
                  <pre className="api-response-pre">{JSON.stringify(response.reqHeaders, null, 2)}</pre>
                )}
                {response && responseTab === "res-headers" && (
                  <pre className="api-response-pre">{JSON.stringify(response.resHeaders, null, 2)}</pre>
                )}
              </div>
            </div>
          </div>
        )}

        {mainTab === "socket" && (
          <div className="api-panel">
            {/* connection bar */}
            <div className="api-request-bar">
              <div className={`socket-status-dot${socketConnected ? " socket-status-dot--on" : socketConnecting ? " socket-status-dot--connecting" : ""}`} />
              <input
                className="api-url-input"
                placeholder="ws://localhost:8080/ws"
                value={socketUrl}
                onChange={(e) => setSocketUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSocketConnect(); }}
                disabled={socketConnected || socketConnecting}
              />
              {socketConnected ? (
                <button className="api-send-btn socket-disconnect-btn" onClick={handleSocketDisconnect}>
                  断开
                </button>
              ) : (
                <button
                  className="api-send-btn"
                  onClick={handleSocketConnect}
                  disabled={socketConnecting}
                >
                  {socketConnecting ? "连接中…" : "连接"}
                </button>
              )}
            </div>

            {/* message log */}
            <div className="api-response-section socket-log-section">
              <div className="api-response-topbar">
                <span className="api-section-title" style={{ margin: 0 }}>消息记录</span>
                <div className="socket-log-actions">
                  <span className="socket-msg-count">{socketMessages.length} 条消息</span>
                  <button className="api-add-btn" onClick={handleClearMessages}>清空</button>
                </div>
              </div>
              <div className="api-response-body socket-log-body" ref={socketLogRef}>
                {socketMessages.length === 0 && !socketConnected && (
                  <div className="api-response-placeholder">输入地址并点击"连接"</div>
                )}
                {socketMessages.map((msg) => (
                  <div key={msg.id} className={`socket-msg socket-msg--${msg.type}`}>
                    <span className="socket-msg-time">{formatTime(msg.timestamp)}</span>
                    <span className={`socket-msg-tag${msg.type === "sent" ? " socket-msg-tag--sent" : msg.type === "received" ? " socket-msg-tag--recv" : msg.type === "error" ? " socket-msg-tag--err" : ""}`}>
                      {msg.type === "sent" ? "发送" : msg.type === "received" ? "接收" : msg.type === "error" ? "错误" : "系统"}
                    </span>
                    <pre className="socket-msg-content">{tryFormatJson(msg.content)}</pre>
                  </div>
                ))}
              </div>
            </div>

            {/* send input */}
            <div className="api-section socket-send-section">
              <div className="api-section-header">
                <span className="api-section-title">发送消息</span>
              </div>
              <div className="socket-send-row">
                <textarea
                  className="api-json-input socket-send-input"
                  placeholder='输入要发送的消息...'
                  value={socketInput}
                  onChange={(e) => setSocketInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSocketSend();
                    }
                  }}
                  rows={3}
                  spellCheck={false}
                  disabled={!socketConnected}
                />
                <button
                  className="api-send-btn socket-send-btn"
                  onClick={handleSocketSend}
                  disabled={!socketConnected || !socketInput.trim()}
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {statusMsg && <div className="api-status">{statusMsg}</div>}
    </div>
  );
}
