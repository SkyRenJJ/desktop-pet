import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import "./PdfToolWorkArea.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

// --- helpers ---

type TabId = "merge" | "split" | "compress" | "to-image";

const TABS: { id: TabId; label: string }[] = [
  { id: "merge", label: "合并 PDF" },
  { id: "split", label: "拆分 PDF" },
  { id: "compress", label: "压缩 PDF" },
  { id: "to-image", label: "PDF 转图片" },
];

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.readAsDataURL(new Blob([bytes]));
  });
}

async function base64ToBytes(b64: string): Promise<Uint8Array> {
  const res = await fetch(`data:application/octet-stream;base64,${b64}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function readFile(path: string): Promise<Uint8Array> {
  const b64: string = await invoke("read_file", { path });
  return await base64ToBytes(b64);
}

async function writeFile(path: string, data: Uint8Array): Promise<void> {
  await invoke("save_file", { path, data: await bytesToBase64(data) });
}

function fileName(path: string): string {
  return path.replace(/^.*[\\/]/, "");
}

// --- component ---

function PdfToolWorkArea() {
  const [tab, setTab] = useState<TabId>("merge");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  // merge state
  const [mergePaths, setMergePaths] = useState<string[]>([]);
  const [mergeOutName, setMergeOutName] = useState("merged.pdf");

  // split state
  const [splitPath, setSplitPath] = useState("");
  const [splitRange, setSplitRange] = useState("");
  const [splitMode, setSplitMode] = useState<"range" | "every">("range");
  const [splitEveryN, setSplitEveryN] = useState(1);

  // compress state
  const [compressPath, setCompressPath] = useState("");
  const [compressQuality, setCompressQuality] = useState(2);

  // to-image state
  const [imgPath, setImgPath] = useState("");
  const [imgRange, setImgRange] = useState("");
  const [imgFormat, setImgFormat] = useState<"png" | "jpeg">("png");
  const [imgScale, setImgScale] = useState(2);

  const showStatus = useCallback((msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus((s) => (s === msg ? "" : s)), 4000);
  }, []);

  // --- merge ---

  const handleAddMergeFiles = async () => {
    const files = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (files) setMergePaths((prev) => [...prev, ...files]);
  };

  const handleRemoveMergeFile = (i: number) => {
    setMergePaths((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleMerge = async () => {
    if (mergePaths.length < 2) {
      showStatus("请至少添加 2 个 PDF 文件");
      return;
    }
    const outPath = await save({
      defaultPath: mergeOutName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!outPath) return;

    setBusy(true);
    try {
      const merged = await PDFDocument.create();
      for (const p of mergePaths) {
        const data = await readFile(p);
        const doc = await PDFDocument.load(data, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((pg) => merged.addPage(pg));
      }
      const outBytes = await merged.save();
      await writeFile(outPath, outBytes);
      showStatus(`已合并 ${mergePaths.length} 个文件`);
    } catch (e: any) {
      const msg = String(e);
      if (msg.includes("PDFDict")) {
        showStatus(`合并失败: 某个PDF包含不兼容的特性，建议先用其他工具重新保存该PDF后再试`);
      } else {
        showStatus(`合并失败: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  // --- split ---

  const handleSelectSplitFile = async () => {
    const file = await open({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (file) setSplitPath(file);
  };

  function parsePageRange(raw: string, total: number): number[] {
    const pages = new Set<number>();
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes("-")) {
        const [a, b] = trimmed.split("-").map(Number);
        if (isNaN(a) || isNaN(b)) continue;
        const start = Math.max(1, a);
        const end = Math.min(total, b);
        for (let i = start; i <= end; i++) pages.add(i);
      } else {
        const n = Number(trimmed);
        if (!isNaN(n) && n >= 1 && n <= total) pages.add(n);
      }
    }
    return [...pages].sort((a, b) => a - b);
  }

  const handleSplit = async () => {
    if (!splitPath) {
      showStatus("请先选择 PDF 文件");
      return;
    }

    setBusy(true);
    try {
      const total: number = await invoke("pdf_page_count", { path: splitPath });

      if (splitMode === "range") {
        const pages = parsePageRange(splitRange, total);
        if (pages.length === 0) {
          showStatus("请输入有效的页码范围，如 1-5, 7, 10-12");
          setBusy(false);
          return;
        }
        const outPath = await save({
          defaultPath: "split.pdf",
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (!outPath) { setBusy(false); return; }

        await invoke("pdf_extract_pages", { path: splitPath, pages, output: outPath });
        showStatus(`已提取 ${pages.length} 页`);
      } else {
        const n = splitEveryN;
        if (n < 1) { showStatus("每份页数至少为 1"); setBusy(false); return; }

        const firstPath = await save({
          defaultPath: `part_1.pdf`,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (!firstPath) { setBusy(false); return; }

        const outDir = firstPath.replace(/[/\\][^/\\]*$/, "");
        const baseName = firstPath.replace(/^.*[\\/]/, "").replace(/\.pdf$/i, "").replace(/_part\d+$/, "");

        for (let start = 1; start <= total; start += n) {
          const end = Math.min(start + n - 1, total);
          const chunkPages: number[] = [];
          for (let p = start; p <= end; p++) chunkPages.push(p);
          const partNum = Math.floor((start - 1) / n) + 1;
          await invoke("pdf_extract_pages", {
            path: splitPath,
            pages: chunkPages,
            output: `${outDir}/${baseName}_part${partNum}.pdf`,
          });
        }
        showStatus(`已拆分为 ${Math.ceil(total / n)} 个文件`);
      }
    } catch (e: any) {
      showStatus(`拆分失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // --- compress ---

  const handleSelectCompressFile = async () => {
    const file = await open({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (file) setCompressPath(file);
  };

  const handleCompress = async () => {
    if (!compressPath) {
      showStatus("请先选择 PDF 文件");
      return;
    }
    const outPath = await save({
      defaultPath: fileName(compressPath).replace(/\.pdf$/i, "_compressed.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!outPath) return;

    setBusy(true);
    try {
      const data = await readFile(compressPath);
      const doc = await PDFDocument.load(data, {
        ignoreEncryption: true,
      });
      // save with object streams enabled for better compression
      const outBytes = await doc.save({
        useObjectStreams: true,
        objectsPerTick: compressQuality < 2 ? 20 : compressQuality > 2 ? 100 : 50,
      });
      await writeFile(outPath, outBytes);
      const ratio =
        data.length > 0
          ? ((1 - outBytes.length / data.length) * 100).toFixed(1)
          : "0";
      showStatus(
        `压缩完成: ${(data.length / 1024).toFixed(0)} KB → ${(outBytes.length / 1024).toFixed(0)} KB (${ratio}%)`
      );
    } catch (e: any) {
      showStatus(`压缩失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // --- to-image ---

  const handleSelectImgFile = async () => {
    const file = await open({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (file) setImgPath(file);
  };

  const handleToImage = async () => {
    if (!imgPath) {
      showStatus("请先选择 PDF 文件");
      return;
    }
    setBusy(true);
    try {
      const data = await readFile(imgPath);
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const total = pdf.numPages;

      let pages: number[];
      if (imgRange.trim()) {
        pages = parsePageRange(imgRange, total);
        if (pages.length === 0) {
          showStatus("请输入有效的页码范围");
          setBusy(false);
          return;
        }
      } else {
        pages = Array.from({ length: total }, (_, i) => i + 1);
      }

      const baseName = fileName(imgPath).replace(/\.pdf$/i, "");
      const outDir = imgPath.replace(/[/\\][^/\\]*$/, "");
      const ext = imgFormat === "png" ? "png" : "jpg";
      const mime = imgFormat === "png" ? "image/png" : "image/jpeg";

      for (const pageNum of pages) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: imgScale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, viewport }).promise;

        const blob = await new Promise<Blob>((res) =>
          canvas.toBlob((b) => res(b!), mime, imgFormat === "jpeg" ? 0.9 : undefined)
        );
        const arr = new Uint8Array(await blob.arrayBuffer());
        const outPath = `${outDir}/${baseName}_page${pageNum}.${ext}`;
        await writeFile(outPath, arr);
      }
      showStatus(`已转换 ${pages.length} 页为 ${ext.toUpperCase()}`);
    } catch (e: any) {
      showStatus(`转换失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // --- move helpers ---

  const handleMoveUp = (i: number) => {
    if (i === 0) return;
    setMergePaths((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const handleMoveDown = (i: number) => {
    setMergePaths((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  // --- render ---

  return (
    <div className="pdf-tool-work">
      {/* tabs */}
      <div className="pdf-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`pdf-tab${tab === t.id ? " pdf-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* tab content */}
      <div className="pdf-tab-body">
        {/* --- merge --- */}
        {tab === "merge" && (
          <div className="pdf-panel">
            <div className="pdf-panel-header">选择要合并的 PDF 文件</div>

            <div className="pdf-file-list">
              {mergePaths.length === 0 && (
                <p className="pdf-empty">尚未添加文件</p>
              )}
              {mergePaths.map((p, i) => (
                <div key={i} className="pdf-file-row">
                  <span className="pdf-file-idx">{i + 1}</span>
                  <span className="pdf-file-name">{fileName(p)}</span>
                  <span className="pdf-file-path">{p}</span>
                  <button onClick={() => handleMoveUp(i)} disabled={i === 0} title="上移">↑</button>
                  <button onClick={() => handleMoveDown(i)} disabled={i === mergePaths.length - 1} title="下移">↓</button>
                  <button onClick={() => handleRemoveMergeFile(i)} title="移除">✕</button>
                </div>
              ))}
            </div>

            <button className="pdf-btn pdf-btn--outline" onClick={handleAddMergeFiles}>
              + 添加 PDF 文件
            </button>

            <div className="pdf-row">
              <label className="pdf-label">输出文件名</label>
              <input
                className="pdf-input pdf-input--flex"
                value={mergeOutName}
                onChange={(e) => setMergeOutName(e.target.value)}
              />
            </div>

            <button
              className="pdf-btn pdf-btn--primary"
              onClick={handleMerge}
              disabled={busy || mergePaths.length < 2}
            >
              {busy ? "处理中…" : "合并并保存"}
            </button>
          </div>
        )}

        {/* --- split --- */}
        {tab === "split" && (
          <div className="pdf-panel">
            <div className="pdf-panel-header">选择要拆分的 PDF 文件</div>

            <div className="pdf-row">
              <button className="pdf-btn pdf-btn--outline" onClick={handleSelectSplitFile}>
                选择 PDF 文件
              </button>
              {splitPath && <span className="pdf-selected-name">{fileName(splitPath)}</span>}
            </div>

            <div className="pdf-mode-tabs">
              <button
                className={`pdf-mode-tab${splitMode === "range" ? " pdf-mode-tab--active" : ""}`}
                onClick={() => setSplitMode("range")}
              >
                按页码范围
              </button>
              <button
                className={`pdf-mode-tab${splitMode === "every" ? " pdf-mode-tab--active" : ""}`}
                onClick={() => setSplitMode("every")}
              >
                每 N 页拆分
              </button>
            </div>

            {splitMode === "range" ? (
              <div className="pdf-row">
                <label className="pdf-label">页码范围</label>
                <input
                  className="pdf-input pdf-input--flex"
                  placeholder="如 1-5, 7, 10-12"
                  value={splitRange}
                  onChange={(e) => setSplitRange(e.target.value)}
                />
              </div>
            ) : (
              <div className="pdf-row">
                <label className="pdf-label">每份页数</label>
                <input
                  className="pdf-input"
                  type="number"
                  min={1}
                  style={{ width: 80 }}
                  value={splitEveryN}
                  onChange={(e) => setSplitEveryN(Number(e.target.value) || 1)}
                />
              </div>
            )}

            <button
              className="pdf-btn pdf-btn--primary"
              onClick={handleSplit}
              disabled={busy || !splitPath}
            >
              {busy ? "处理中…" : "拆分并保存"}
            </button>
          </div>
        )}

        {/* --- compress --- */}
        {tab === "compress" && (
          <div className="pdf-panel">
            <div className="pdf-panel-header">选择要压缩的 PDF 文件</div>

            <div className="pdf-row">
              <button className="pdf-btn pdf-btn--outline" onClick={handleSelectCompressFile}>
                选择 PDF 文件
              </button>
              {compressPath && (
                <span className="pdf-selected-name">{fileName(compressPath)}</span>
              )}
            </div>

            <div className="pdf-row">
              <label className="pdf-label">压缩级别</label>
              <div className="pdf-quality-group">
                {[
                  [1, "快速"],
                  [2, "标准"],
                  [3, "高强度"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    className={`pdf-quality-btn${compressQuality === v ? " pdf-quality-btn--active" : ""}`}
                    onClick={() => setCompressQuality(v as number)}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="pdf-btn pdf-btn--primary"
              onClick={handleCompress}
              disabled={busy || !compressPath}
            >
              {busy ? "处理中…" : "压缩并保存"}
            </button>
          </div>
        )}

        {/* --- to-image --- */}
        {tab === "to-image" && (
          <div className="pdf-panel">
            <div className="pdf-panel-header">选择要转换的 PDF 文件</div>

            <div className="pdf-row">
              <button className="pdf-btn pdf-btn--outline" onClick={handleSelectImgFile}>
                选择 PDF 文件
              </button>
              {imgPath && <span className="pdf-selected-name">{fileName(imgPath)}</span>}
            </div>

            <div className="pdf-row">
              <label className="pdf-label">页码范围</label>
              <input
                className="pdf-input pdf-input--flex"
                placeholder="留空转换全部，如 1-3, 5"
                value={imgRange}
                onChange={(e) => setImgRange(e.target.value)}
              />
            </div>

            <div className="pdf-row">
              <label className="pdf-label">图片格式</label>
              <div className="pdf-quality-group">
                {(["png", "jpeg"] as const).map((f) => (
                  <button
                    key={f}
                    className={`pdf-quality-btn${imgFormat === f ? " pdf-quality-btn--active" : ""}`}
                    onClick={() => setImgFormat(f)}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="pdf-row">
              <label className="pdf-label">缩放倍率</label>
              <div className="pdf-quality-group">
                {[1, 2, 3].map((s) => (
                  <button
                    key={s}
                    className={`pdf-quality-btn${imgScale === s ? " pdf-quality-btn--active" : ""}`}
                    onClick={() => setImgScale(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <button
              className="pdf-btn pdf-btn--primary"
              onClick={handleToImage}
              disabled={busy || !imgPath}
            >
              {busy ? "处理中…" : "转换并保存"}
            </button>
          </div>
        )}
      </div>

      {/* status */}
      {status && <div className="pdf-status">{status}</div>}
    </div>
  );
}

export default PdfToolWorkArea;
