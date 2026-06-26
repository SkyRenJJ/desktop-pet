import { useState, useCallback, useRef } from "react";
import "./WechatTransferWorkArea.css";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatWechatTime(v: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v.replace("T", " ");
  return `${d.getFullYear()}年${pad(d.getMonth()+1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatAmount(v: string): string {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return "0.00";
  return n.toFixed(2);
}

interface TextStyle {
  size: number;
  color: string;
  bold: boolean;
  weight: number;
  marginTop: number;
}

const DEFAULTS = {
  amount: "7870.00",
  transfer: "2026-03-13T16:27:55",
  receive: "2026-03-13T21:35:52",
  phoneTime: "8:32",
  battery: "43",
  title: "你已收款，资金已转入余额账户",
  iconTop: 0,
  links: "零钱通余额 | 处理订单",
  textStyles: {
    phoneTime: { size: 16, color: "#393c43", bold: false, weight: 600, marginTop: 0 },
    battery: { size: 11, color: "#393c43", bold: false, weight: 400, marginTop: 0 },
    title: { size: 17, color: "#20242b", bold: false, weight: 400, marginTop: 42 },
    currency: { size: 48, color: "#15171b", bold: false, weight: 450, marginTop: 0 },
    amount: { size: 62, color: "#15171b", bold: false, weight: 450, marginTop: 20 },
    links: { size: 17, color: "#64758f", bold: false, weight: 400, marginTop: 32 },
    transferLabel: { size: 17, color: "#878991", bold: false, weight: 400, marginTop: 0 },
    transferValue: { size: 17, color: "#22252b", bold: false, weight: 400, marginTop: 0 },
    receiveLabel: { size: 17, color: "#878991", bold: false, weight: 400, marginTop: 0 },
    receiveValue: { size: 17, color: "#22252b", bold: false, weight: 400, marginTop: 0 },
    footer: { size: 18, color: "#64758f", bold: false, weight: 600, marginTop: 0 },
    demo: { size: 12, color: "#078b4d", bold: true, weight: 700, marginTop: 0 },
  } as Record<string, TextStyle>,
};

const STYLE_KEYS = [
  { key: "phoneTime", name: "顶部时间", target: "phoneTime" },
  { key: "battery", name: "电量文字", target: "batteryText" },
  { key: "title", name: "结果文案", target: "statusTitle" },
  { key: "currency", name: "金额符号", target: "currencyText" },
  { key: "amount", name: "金额数字", target: "amountText" },
  { key: "links", name: "操作链接", target: "linksText" },
  { key: "transferLabel", name: "转账标签", target: "transferLabel" },
  { key: "transferValue", name: "转账时间", target: "transferText" },
  { key: "receiveLabel", name: "收款标签", target: "receiveLabel" },
  { key: "receiveValue", name: "收款时间", target: "receiveText" },
  { key: "footer", name: "账单详情", target: "footerText" },
  { key: "demo", name: "演示标识", target: "demoText" },
];

const stepperClass = "wt-stepper";

interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}

function Stepper({ value, onChange, min, max, step }: StepperProps) {
  const down = useCallback(() => { const nv = Math.max(min, value - step); if (nv !== value) onChange(nv); }, [value, min, step, onChange]);
  const up = useCallback(() => { const nv = Math.min(max, value + step); if (nv !== value) onChange(nv); }, [value, max, step, onChange]);
  return (
    <span className={stepperClass}>
      <button className="wt-step-btn wt-step-down" onClick={down} tabIndex={-1}>-</button>
      <span className="wt-step-val">{value}</span>
      <button className="wt-step-btn wt-step-up" onClick={up} tabIndex={-1}>+</button>
    </span>
  );
}


export default function WechatTransferWorkArea() {
  const [amount, setAmount] = useState(DEFAULTS.amount);
  const [transfer, setTransfer] = useState(DEFAULTS.transfer);
  const [receive, setReceive] = useState(DEFAULTS.receive);
  const [phoneTime, setPhoneTime] = useState(DEFAULTS.phoneTime);
  const [battery, setBattery] = useState(DEFAULTS.battery);
  const [title, setTitle] = useState(DEFAULTS.title);
  const [iconTop, setIconTop] = useState(DEFAULTS.iconTop);
  const [links, setLinks] = useState(DEFAULTS.links);
  const [textStyles, setTextStyles] = useState<Record<string, TextStyle>>(DEFAULTS.textStyles);
  const [markImage, setMarkImage] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  const applyStyle = useCallback((target: string, s: TextStyle) => {
    const el = document.getElementById("wt-" + target);
    if (!el) return;
    el.style.fontSize = s.size + "px";
    el.style.color = s.color;
    el.style.fontWeight = s.bold ? "700" : String(s.weight);
    el.style.marginTop = s.marginTop > 0 ? s.marginTop + "px" : "";
  }, []);

  const updateStyle = useCallback((key: string, patch: Partial<TextStyle>) => {
    setTextStyles((prev) => {
      const next = { ...prev[key], ...patch };
      const updated = { ...prev, [key]: next };
      applyStyle(STYLE_KEYS.find((k) => k.key === key)!.target, next);
      return updated;
    });
  }, [applyStyle]);

  const resetAll = useCallback(() => {
    setAmount(DEFAULTS.amount);
    setTransfer(DEFAULTS.transfer);
    setReceive(DEFAULTS.receive);
    setPhoneTime(DEFAULTS.phoneTime);
    setBattery(DEFAULTS.battery);
    setTitle(DEFAULTS.title);
    setIconTop(DEFAULTS.iconTop);
    setLinks(DEFAULTS.links);
    setTextStyles(DEFAULTS.textStyles);
    setMarkImage(null);
    setExportMsg("");
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMarkImage(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleExport = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) return;
    setExportMsg("生成中...");
    const rect = preview.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));

    const clone = preview.cloneNode(true) as HTMLElement;
    const sourceEls = [preview, ...Array.from(preview.querySelectorAll("*"))];
    const cloneEls = [clone, ...Array.from(clone.querySelectorAll("*"))];
    sourceEls.forEach((src, i) => {
      const cl = cloneEls[i] as HTMLElement;
      if (!cl) return;
      const cs = getComputedStyle(src);
      cl.style.cssText = Array.from(cs).map((p) => `${p}:${cs.getPropertyValue(p)};`).join("");
    });

    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const style = document.createElement("style");
    style.textContent = `
      *{box-sizing:border-box}
      .wt-back-btn::before{content:"";position:absolute;inset:5px;border-left:3px solid #202329;border-bottom:3px solid #202329;transform:rotate(45deg)}
      .wt-battery::after{content:"";position:absolute;right:-5px;width:2px;height:8px;border-radius:0 2px 2px 0;background:currentColor}
      .wt-mark:not(.has-img)::before{content:"";width:26px;height:15px;margin-top:-3px;border-left:5px solid #fff;border-bottom:5px solid #fff;transform:rotate(-45deg)}
      .wt-mark.has-img::before{display:none}
    `;
    clone.prepend(style);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, w, h);
      const a = document.createElement("a");
      a.download = `收款结果演示-${new Date().toISOString().slice(0,10)}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      setExportMsg("已导出");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }, []);

  const amt = formatAmount(amount);

  return (
    <div className="wt-work">
      {/* Left: Phone Preview (sticky) */}
      <div className="wt-left-sticky">
      <div className="wt-phone-shell">
        <div className="wt-phone" ref={previewRef}>
          {/* <div className="wt-watermarks">
            <span>仅作演示</span><span>仅作演示</span><span>仅作演示</span><span>仅作演示</span>
          </div> */}
          <div className="wt-phone-content-wrap">
            {/* Status Bar */}
            <div className="wt-status-bar">
              <span id="wt-phoneTime">{phoneTime}</span>
              <div className="wt-status-icons">
                <svg className="wt-wifi" viewBox="0 0 20 16" width="20" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M3.2 6.7 A9.6 9.6 0 0 1 16.8 6.7"/><path d="M5.5 9 A6.4 6.4 0 0 1 14.5 9"/><path d="M7.7 11.2 A3.2 3.2 0 0 1 12.7 11.2"/><circle cx="10" cy="13.5" r="1.7" fill="currentColor" stroke="none"/>
                </svg>
                <span className="wt-signal"><i/><i/><i/><i/></span>
                <span className="wt-battery" id="wt-batteryText">{battery}</span>
              </div>
            </div>

            {/* Back button */}
            <button className="wt-back-btn" aria-label="返回"/>

            {/* Content */}
            <div className="wt-result">
              <div className={"wt-mark" + (markImage ? " has-img" : "")} style={{ marginTop: iconTop !== 0 ? iconTop + "px" : "" }}>
                {markImage && <img src={markImage} alt="" className="wt-mark-img" />}
              </div>
              <div className="wt-title" id="wt-statusTitle">{title}</div>
              <div className="wt-amount">
                <span className="wt-currency" id="wt-currencyText">&yen;</span>
                <span id="wt-amountText">{amt}</span>
              </div>
              <div className="wt-links" id="wt-linksText">{links}</div>
              <div className="wt-divider"/>
              <div className="wt-detail-list">
                <div className="wt-detail-row">
                  <span className="wt-detail-label" id="wt-transferLabel">转账时间</span>
                  <span className="wt-detail-value" id="wt-transferText">{formatWechatTime(transfer)}</span>
                </div>
                <div className="wt-detail-row">
                  <span className="wt-detail-label" id="wt-receiveLabel">收款时间</span>
                  <span className="wt-detail-value" id="wt-receiveText">{formatWechatTime(receive)}</span>
                </div>
              </div>
            </div>

            {/* Footer + Demo badge */}
            <div className="wt-footer-link" id="wt-footerText">账单详情</div>
            {/* <div className="wt-demo-corner" id="wt-demoText">演示</div> */}
          </div>
        </div>
      </div>

      </div>
      {/* Right: Controls (scrollable) */}
      <div className="wt-controls">
        <div className="wt-controls-header">
          <h3 className="wt-controls-title">收款结果演示设置</h3>
          <p className="wt-controls-desc">修改右侧字段会实时更新左侧预览。预览含固定演示标识，不作为真实交易凭证。</p>
        </div>

        <div className="wt-form">
          <div className="wt-form-row-2">
            <label className="wt-field">
              <span className="wt-field-label">转账金额</span>
              <input className="wt-input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="wt-field">
              <span className="wt-field-label">转账时间</span>
              <input className="wt-input" type="datetime-local" step="1" value={transfer} onChange={(e) => setTransfer(e.target.value)} />
            </label>
          </div>
          <div className="wt-form-row-2">
            <label className="wt-field">
              <span className="wt-field-label">收款时间</span>
              <input className="wt-input" type="datetime-local" step="1" value={receive} onChange={(e) => setReceive(e.target.value)} />
            </label>
            <label className="wt-field">
              <span className="wt-field-label">结果文案</span>
              <input className="wt-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
          <div className="wt-form-row-2">
            <label className="wt-field">
              <span className="wt-field-label">顶部时间</span>
              <input className="wt-input" type="text" value={phoneTime} maxLength={5} onChange={(e) => setPhoneTime(e.target.value)} />
            </label>
            <label className="wt-field">
              <span className="wt-field-label">电量</span>
              <input className="wt-input" type="number" min={1} max={100} value={battery} onChange={(e) => setBattery(e.target.value)} />
            </label>
          </div>
          <label className="wt-field">
            <span className="wt-field-label">图标顶部距离</span>
            <input className="wt-input" type="number" min={-100} max={200} step={1} value={iconTop} onChange={(e) => setIconTop(Number(e.target.value))} />
          </label>
          <label className="wt-field">
            <span className="wt-field-label">操作链接文字</span>
            <input className="wt-input" type="text" value={links} onChange={(e) => setLinks(e.target.value)} />
          </label>

          <div className="wt-section-title">文字样式</div>
          <div className="wt-text-style-grid">
            {STYLE_KEYS.map(({ key, name }) => {
              const s = textStyles[key];
              if (!s) return null;
              return (
                <div key={key} className="wt-style-row">
                  <span className="wt-style-name" title={name}>{name}</span>
                  <input type="color" value={s.color}
                    className="wt-style-color"
                    onChange={(e) => updateStyle(key, { color: e.target.value })} />
                  <input type="checkbox" checked={s.bold}
                    className="wt-style-check" title="粗体"
                    onChange={(e) => updateStyle(key, { bold: e.target.checked })} />
                  <span className="wt-step-inline">
                    <span className="wt-step-inline-label">字</span>
                    <Stepper value={s.size} min={8} max={96} step={1}
                      onChange={(v) => updateStyle(key, { size: v })} />
                  </span>
                  <span className="wt-step-inline">
                    <span className="wt-step-inline-label">重</span>
                    <Stepper value={s.weight} min={100} max={900} step={50}
                      onChange={(v) => updateStyle(key, { weight: v })} />
                  </span>
                  <span className="wt-step-inline">
                    <span className="wt-step-inline-label">距</span>
                    <Stepper value={s.marginTop} min={0} max={200} step={1}
                      onChange={(v) => updateStyle(key, { marginTop: v })} />
                  </span>
                </div>
              );
            })}
          </div>

          <div className="wt-bottom-row">
            <label className="wt-field">
              <span className="wt-field-label">预览图标</span>
              <input className="wt-input" type="file" accept="image/*" onChange={handleImageUpload} />
            </label>
            <div className="wt-bottom-btns">
              {markImage && (
                <button className="wt-btn wt-btn-secondary" onClick={() => setMarkImage(null)}>清除图标</button>
              )}
              <button className="wt-btn wt-btn-primary" onClick={resetAll}>恢复默认</button>
              <button className="wt-btn wt-btn-export" onClick={handleExport}>导出图片</button>
            </div>
          </div>
          {exportMsg && <p className="wt-export-msg">{exportMsg}</p>}
        </div>
      </div>
    </div>
  );
}