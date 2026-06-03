'use client';

import { useState, useEffect } from 'react';
import ResultTable from '@/components/ResultTable';
import ScaffoldPlan from '@/components/ScaffoldPlan';
import SavedList from '@/components/SavedList';
import SidesList from '@/components/SidesList';
import { calculate } from '@/lib/scaffold';
import { sidestoVertices, buildScaffoldLayout } from '@/lib/geometry';
import { getMaster, saveProject, listProjects } from '@/lib/storage';
import { CalcResult, ScaffoldInputs, BuildingPolygon, ScaffoldLayout } from '@/lib/types';

const BUILDING_TYPES = ['集合住宅', '学校', '戸建住宅', 'その他'];
const SCAFFOLD_TYPES = ['くさび緊結式', '枠組み足場', '単管足場'];

interface PageResult {
  floors?: number | null;
  floorHeight?: number | null;
  buildingType?: string | null;
  sides?: number[] | null;
  notes?: string | null;
  confidence?: { floors?: number; floorHeight?: number; sides?: number };
  _model?: string;
}

// フィールドごとの確信度を管理
interface FieldMeta {
  fromPdf: boolean;
  confidence: number; // 0〜1
}
type FieldMetaMap = Record<'floors' | 'floorHeight' | 'buildingType' | 'sides', FieldMeta>;

const defaultMeta = (): FieldMetaMap => ({
  floors:       { fromPdf: false, confidence: 1 },
  floorHeight:  { fromPdf: false, confidence: 1 },
  buildingType: { fromPdf: false, confidence: 1 },
  sides:        { fromPdf: false, confidence: 1 },
});

export default function Home() {
  // フォーム値
  const [projectName, setProjectName]   = useState('');
  const [buildingType, setBuildingType] = useState('集合住宅');
  const [scaffoldType, setScaffoldType] = useState('くさび緊結式');
  const [floors, setFloors]             = useState(3);
  const [floorHeight, setFloorHeight]   = useState(2.8);
  const [clearance, setClearance]       = useState(0.3);
  const [meshOpt, setMeshOpt]           = useState('あり');
  const [sides, setSides]               = useState<number[]>([10, 8, 10, 8]);
  const [meta, setMeta]                 = useState<FieldMetaMap>(defaultMeta());

  // PDF
  const [pdfStatus, setPdfStatus]   = useState<'idle' | 'scanning' | 'error'>('idle');
  const [pdfError, setPdfError]     = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragOver, setDragOver]     = useState(false);
  const [pdfNotes, setPdfNotes]     = useState('');
  const [scanProgress, setScanProgress] = useState('');

  // 結果
  const [result, setResult]   = useState<CalcResult | null>(null);
  const [layout, setLayout]   = useState<ScaffoldLayout | null>(null);
  const [tab, setTab]         = useState<'result' | 'plan'>('result');
  const [projects, setProjects] = useState<CalcResult[]>([]);

  useEffect(() => { setProjects(listProjects()); }, []);

  // =============================================
  // 全ページ解析 → フィールドごとに最良値を合成
  // =============================================
  const processPdf = async (file: File) => {
    setPdfStatus('scanning');
    setPdfError('');
    setPdfNotes('');
    setScanProgress('');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const maxPages = Math.min(pdf.numPages, 7);
      const pageResults: (PageResult & { pageNum: number; previewUrl: string })[] = [];

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        setScanProgress(`${pageNum} / ${maxPages} ページ解析中...`);

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({
          canvasContext: ctx as Parameters<typeof page.render>[0]['canvasContext'],
          viewport,
          canvas,
        }).promise;

        const dataUrl   = canvas.toDataURL('image/png');
        const base64    = dataUrl.split(',')[1];

        try {
          const res  = await fetch('/api/analyze-drawing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mimeType: 'image/png', pageNum }),
          });
          const json = await res.json() as PageResult & { error?: string };
          if (res.ok) pageResults.push({ ...json, pageNum, previewUrl: dataUrl });
        } catch {
          // 1ページ失敗しても続行
        }
      }

      if (pageResults.length === 0) throw new Error('全ページの解析に失敗しました');

      // ---- フィールドごとにベスト値を選ぶ ----
      const merged = mergePageResults(pageResults);

      // フォームに反映
      const newMeta = defaultMeta();

      if (merged.floors && merged.floors > 0) {
        setFloors(merged.floors);
        newMeta.floors = { fromPdf: true, confidence: merged.confidence.floors };
      }
      if (merged.floorHeight && merged.floorHeight > 0) {
        setFloorHeight(merged.floorHeight);
        newMeta.floorHeight = { fromPdf: true, confidence: merged.confidence.floorHeight };
      }
      if (merged.buildingType && BUILDING_TYPES.includes(merged.buildingType)) {
        setBuildingType(merged.buildingType);
        newMeta.buildingType = { fromPdf: true, confidence: 0.9 };
      }
      if (merged.sides && merged.sides.length >= 3) {
        setSides(merged.sides);
        newMeta.sides = { fromPdf: true, confidence: merged.confidence.sides };
      }
      if (merged.notes) setPdfNotes(merged.notes);

      // プレビューは "最もsidesが取れたページ" を使う
      const bestPreviewPage = pageResults.find(p => p.sides && p.sides.length >= 3) ?? pageResults[0];
      setPreviewUrl(bestPreviewPage.previewUrl);

      setMeta(newMeta);
      setPdfStatus('idle');
      setScanProgress('');
    } catch (e: unknown) {
      setPdfError(e instanceof Error ? e.message : String(e));
      setPdfStatus('error');
      setScanProgress('');
    }
  };

  // =============================================
  // 全ページ結果の合成ロジック
  // =============================================
  const mergePageResults = (pages: PageResult[]) => {
    // floors: 最高確信度のページの値を採用
    //         ただし確信度が並ぶ場合は大きい値を優先（階数は小さく誤読しやすいため）
    let bestFloors = 0;
    let bestFloorsConf = 0;
    for (const p of pages) {
      const conf = p.confidence?.floors ?? 0.5;
      const val  = p.floors ?? 0;
      if (val > 0 && (conf > bestFloorsConf || (conf === bestFloorsConf && val > bestFloors))) {
        bestFloors     = val;
        bestFloorsConf = conf;
      }
    }

    // floorHeight: 最高確信度
    let bestFH = 0, bestFHConf = 0;
    for (const p of pages) {
      const conf = p.confidence?.floorHeight ?? 0.5;
      const val  = p.floorHeight ?? 0;
      if (val > 0 && conf > bestFHConf) { bestFH = val; bestFHConf = conf; }
    }

    // buildingType: 最頻値（多数決）
    const btCount: Record<string, number> = {};
    for (const p of pages) {
      if (p.buildingType) btCount[p.buildingType] = (btCount[p.buildingType] ?? 0) + 1;
    }
    const bestBT = Object.entries(btCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // sides: 辺数が最多かつ確信度が高いページを使う
    let bestSides: number[] | null = null;
    let bestSidesConf = 0;
    let bestSidesCount = 0;
    for (const p of pages) {
      const conf  = p.confidence?.sides ?? 0.5;
      const count = p.sides?.length ?? 0;
      if (count >= 3 && (count > bestSidesCount || (count === bestSidesCount && conf > bestSidesConf))) {
        bestSides      = p.sides!;
        bestSidesConf  = conf;
        bestSidesCount = count;
      }
    }

    // notes: 全ページのnotesを結合
    const notes = pages.map(p => p.notes).filter(Boolean).join(' / ') || null;

    return {
      floors:      bestFloors,
      floorHeight: bestFH,
      buildingType: bestBT,
      sides:       bestSides,
      notes,
      confidence: {
        floors:      bestFloorsConf,
        floorHeight: bestFHConf,
        sides:       bestSidesConf,
      },
    };
  };

  // =============================================
  // 計算
  // =============================================
  const handleCalculate = () => {
    if (sides.length < 3 || sides.some(s => s <= 0)) {
      alert('建物外周の辺の長さを入力してください（3辺以上）');
      return;
    }
    const inputs: ScaffoldInputs = {
      projectName: projectName || '無題物件',
      buildingType, scaffoldType,
      floors, floorHeight, clearance, meshOpt, sides,
    };
    const master = getMaster();
    setResult(calculate(inputs, master));
    const vertices = sidestoVertices(sides);
    const bp: BuildingPolygon = { vertices, floors, floorHeight, clearance, meshOpt, projectName: inputs.projectName, buildingType };
    setLayout(buildScaffoldLayout(bp));
  };

  const handleSave = () => {
    if (!result) return;
    saveProject(result);
    setProjects(listProjects());
    alert('保存しました！');
  };

  const handleLoad = (p: CalcResult) => {
    setProjectName(p.projectName);
    setBuildingType(p.inputs.buildingType);
    setScaffoldType(p.inputs.scaffoldType);
    setFloors(p.inputs.floors);
    setFloorHeight(p.inputs.floorHeight);
    setClearance(p.inputs.clearance);
    setMeshOpt(p.inputs.meshOpt);
    setSides([...p.inputs.sides]);
    setMeta(defaultMeta());
    const master = getMaster();
    setResult(calculate(p.inputs, master));
    const vertices = sidestoVertices(p.inputs.sides);
    setLayout(buildScaffoldLayout({ vertices, ...p.inputs }));
  };

  // PDF出力（ブラウザの印刷→PDF保存）
  const handlePdfExport = () => {
    if (!result) return;
    const master = getMaster();

    // 明細行を生成
    type Row = { name: string; qty: number; unit: string; unitPrice: number; amount: number };
    const rows: Row[] = [];
    if (layout) {
      const items: [string, number][] = [
        ['支柱（ジャッキ付）', layout.takeoff.jackPost], ['支柱（中間1800）', layout.takeoff.midPost],
        ['布板（踏板600幅）', layout.takeoff.board],     ['手すり（横架材）', layout.takeoff.handrail],
        ['筋交い', layout.takeoff.brace],                ['壁つなぎ', layout.takeoff.wallTieCount],
        ['ジャッキベース', layout.takeoff.jackBase],     ['メッシュシート', layout.takeoff.mesh],
        ['アンカー', layout.takeoff.anchor],
      ];
      items.filter(([, q]) => q > 0).forEach(([name, qty]) => {
        const m = master[name]; if (!m) return;
        rows.push({ name, qty, unit: m.unit, unitPrice: m.unitPrice, amount: qty * m.unitPrice });
      });
    } else {
      result.items.forEach(it => rows.push(it));
    }
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const s = result.summary;

    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${r.name}</td>
        <td class="r">${r.qty.toLocaleString()}</td>
        <td class="c">${r.unit}</td>
        <td class="r">¥${r.unitPrice.toLocaleString()}</td>
        <td class="r">¥${r.amount.toLocaleString()}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>足場数量見積書 - ${result.projectName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', sans-serif; font-size: 11pt; color: #222; padding: 15mm 15mm 10mm; }
  h1 { font-size: 18pt; text-align: center; color: #1B4F8A; border-bottom: 2.5pt solid #1B4F8A; padding-bottom: 6pt; margin-bottom: 14pt; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 20pt; margin-bottom: 14pt; font-size: 10pt; }
  .meta-item { display: flex; gap: 6pt; }
  .meta-label { color: #5D6D7E; width: 70pt; flex-shrink: 0; }
  .summary { background: #EBF5FB; border: 1pt solid #AED6F1; border-radius: 4pt; padding: 8pt 12pt; margin-bottom: 14pt; display: flex; justify-content: space-between; align-items: center; }
  .summary-label { color: #1A5276; font-size: 10pt; }
  .summary-amount { font-size: 18pt; font-weight: bold; color: #E67E22; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  thead tr { background: #1B4F8A; color: #fff; }
  th { padding: 6pt 8pt; text-align: left; font-weight: 600; }
  td { padding: 5pt 8pt; border-bottom: 0.5pt solid #ddd; }
  tr:nth-child(even) td { background: #F7FBFF; }
  .r { text-align: right; }
  .c { text-align: center; }
  .total-row td { border-top: 1.5pt solid #1B4F8A; font-weight: bold; background: #FEF9E7 !important; }
  .footer { margin-top: 12pt; font-size: 8.5pt; color: #7F8C8D; border-top: 0.5pt solid #ddd; padding-top: 6pt; display:flex; justify-content:space-between; }
  .plan-info { display:grid; grid-template-columns:repeat(3,1fr); gap:6pt; margin-bottom:14pt; }
  .plan-cell { background:#F2F4F6; border-radius:3pt; padding:5pt 8pt; }
  .plan-cell-label { font-size:8.5pt; color:#7F8C8D; }
  .plan-cell-val { font-size:11pt; font-weight:700; color:#1B4F8A; }
  @media print {
    body { padding: 10mm; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
<h1>足場数量見積書</h1>
<div class="meta">
  <div class="meta-item"><span class="meta-label">物件名</span><strong>${result.projectName}</strong></div>
  <div class="meta-item"><span class="meta-label">建物用途</span>${result.inputs.buildingType}</div>
  <div class="meta-item"><span class="meta-label">足場種別</span>${result.inputs.scaffoldType}</div>
  <div class="meta-item"><span class="meta-label">階数</span>${result.inputs.floors}階</div>
  <div class="meta-item"><span class="meta-label">標準階高</span>${result.inputs.floorHeight}m</div>
  <div class="meta-item"><span class="meta-label">離隔距離</span>${result.inputs.clearance}m</div>
  <div class="meta-item"><span class="meta-label">養生シート</span>${result.inputs.meshOpt}</div>
  <div class="meta-item"><span class="meta-label">作成日</span>${new Date().toLocaleDateString('ja-JP')}</div>
</div>
<div class="plan-info">
  <div class="plan-cell"><div class="plan-cell-label">建物外周</div><div class="plan-cell-val">${s.perimeter} m</div></div>
  <div class="plan-cell"><div class="plan-cell-label">足場外周</div><div class="plan-cell-val">${s.scaffoldPerimeter} m</div></div>
  <div class="plan-cell"><div class="plan-cell-label">足場総高さ</div><div class="plan-cell-val">${s.totalHeight} m（${s.segments}段）</div></div>
  <div class="plan-cell"><div class="plan-cell-label">足場外面積</div><div class="plan-cell-val">${s.scaffoldFaceArea} m²</div></div>
  <div class="plan-cell"><div class="plan-cell-label">推定総重量</div><div class="plan-cell-val">${s.totalWeight} kg</div></div>
</div>
<div class="summary">
  <span class="summary-label">概算金額（税抜）</span>
  <span class="summary-amount">¥${total.toLocaleString()}</span>
</div>
<table>
  <thead><tr><th class="c" style="width:32pt">No.</th><th>部材名</th><th class="r" style="width:50pt">数量</th><th class="c" style="width:32pt">単位</th><th class="r" style="width:60pt">単価</th><th class="r" style="width:70pt">金額</th></tr></thead>
  <tbody>
    ${rowsHtml}
    <tr class="total-row">
      <td colspan="5" class="r">合　計</td>
      <td class="r">¥${total.toLocaleString()}</td>
    </tr>
  </tbody>
</table>
<div class="footer">
  <span>※ 単価は参考値です。実際の発注時には最新の単価マスタを参照してください。</span>
  <span>${result.projectName}　${new Date().toLocaleDateString('ja-JP')}</span>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('ポップアップをブロックしています。ブラウザの設定で許可してください。'); return; }
    win.document.write(html);
    win.document.close();
  };

  // Excel出力（Windows / Office利用者向け）
  const handleExcelExport = async () => {
    if (!result) return;
    const XLSX = (await import('xlsx')).default;
    const wb   = XLSX.utils.book_new();
    const cover = [
      ['足場数量見積書'], [],
      ['物件名', result.projectName], ['建物用途', result.inputs.buildingType],
      ['足場種別', result.inputs.scaffoldType], ['階数', result.inputs.floors + '階'],
      ['標準階高', result.inputs.floorHeight + 'm'], ['離隔距離', result.inputs.clearance + 'm'],
      ['養生シート', result.inputs.meshOpt], [],
      ['概算金額（税抜）', '¥' + result.summary.totalAmount.toLocaleString()], [],
      ['作成日', new Date().toLocaleDateString('ja-JP')],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cover), '表紙');
    const master = getMaster();
    const rows: (string | number)[][] = [['No.', '部材名', '数量', '単位', '単価', '金額']];
    if (layout) {
      const items: [string, number][] = [
        ['支柱（ジャッキ付）', layout.takeoff.jackPost], ['支柱（中間1800）', layout.takeoff.midPost],
        ['布板（踏板600幅）', layout.takeoff.board],     ['手すり（横架材）', layout.takeoff.handrail],
        ['筋交い', layout.takeoff.brace],                ['壁つなぎ', layout.takeoff.wallTieCount],
        ['ジャッキベース', layout.takeoff.jackBase],     ['メッシュシート', layout.takeoff.mesh],
        ['アンカー', layout.takeoff.anchor],
      ];
      items.filter(([, q]) => q > 0).forEach(([name, qty], i) => {
        const m = master[name]; if (!m) return;
        rows.push([i + 1, name, qty, m.unit, m.unitPrice, qty * m.unitPrice]);
      });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '数量明細');
    XLSX.writeFile(wb, `足場見積_${result.projectName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // =============================================
  // 確信度バッジ
  // =============================================
  const ConfBadge = ({ field }: { field: keyof FieldMetaMap }) => {
    const m = meta[field];
    if (!m.fromPdf) return null;
    if (m.confidence >= 0.8) {
      return <span style={badge('#1E8449', '#E8F8F5')}>✅ AI取得</span>;
    }
    return <span style={badge('#935116', '#FEF9E7')}>⚠️ 要確認</span>;
  };

  const anyFromPdf = Object.values(meta).some(m => m.fromPdf);

  return (
    <>
      <style>{`
        .layout-grid { display:grid; grid-template-columns:420px 1fr; gap:24px; }
        @media (max-width:960px) { .layout-grid { grid-template-columns:1fr; } }
        .form-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
        .form-row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:10px; }
        .field-label { font-size:12px; font-weight:600; color:#5D6D7E; display:flex; align-items:center; gap:4px; margin-bottom:4px; }
      `}</style>

      <div className="layout-grid">

        {/* ===== 左カラム ===== */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* PDF読み込み */}
          <div className="card">
            <h2 className="card-title">
              📄 図面を読み込む
              <span style={{ fontSize:11, fontWeight:400, color:'#95A5A6', marginLeft:8 }}>
                （任意 — 手入力のみでも計算できます）
              </span>
            </h2>

            <div
              onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file'; inp.accept = 'application/pdf';
                inp.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) processPdf(f); };
                inp.click();
              }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f?.type === 'application/pdf') processPdf(f); else alert('PDFを選択してください');
              }}
              style={{
                border:`2px dashed ${dragOver ? '#2E86C1' : pdfStatus === 'error' ? '#E74C3C' : '#B2BEC3'}`,
                borderRadius:8, padding:'14px 16px', textAlign:'center', cursor:'pointer',
                background: dragOver ? '#E6F1FB' : '#F8FAFB', transition:'all 0.2s',
              }}
            >
              {pdfStatus === 'scanning'
                ? <>
                    <div style={{ fontSize:20, marginBottom:4 }}>🔍</div>
                    <div style={{ fontSize:12, color:'#5D6D7E' }}>全ページをAIで解析中...</div>
                    <div style={{ fontSize:11, color:'#2E86C1', marginTop:4 }}>{scanProgress}</div>
                  </>
                : <>
                    <div style={{ fontSize:20, marginBottom:4 }}>📐</div>
                    <div style={{ fontSize:12, color:'#5D6D7E' }}>平面図PDFをドロップ</div>
                    <div style={{ fontSize:11, color:'#95A5A6', marginTop:2 }}>または クリックして選択</div>
                  </>
              }
            </div>

            {pdfStatus === 'error' && (
              <div style={{ background:'#FADBD8', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#922B21', marginTop:8 }}>
                ⚠️ {pdfError}
              </div>
            )}

            {anyFromPdf && (
              <div style={{ marginTop:8, background:'#EBF5FB', border:'1px solid #AED6F1', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#1A5276' }}>
                🤖 下のフォームにAI読み取り結果を反映しました。<br />
                <strong>⚠️ 必ず内容を確認・修正してから「計算する」を押してください。</strong>
              </div>
            )}

            {pdfNotes && (
              <div style={{ marginTop:6, fontSize:11, color:'#7F8C8D', background:'#F8FAFB', borderRadius:6, padding:'6px 10px' }}>
                💬 {pdfNotes}
              </div>
            )}

            {previewUrl && (
              <img src={previewUrl} alt="図面" style={{ width:'100%', borderRadius:4, marginTop:8, border:'1px solid #E5E8E8', opacity:0.85 }} />
            )}
          </div>

          {/* ===== 入力フォーム ===== */}
          <div className="card">
            <h2 className="card-title">📝 物件情報（確認・修正）</h2>

            {/* 物件名 */}
            <div style={{ marginBottom:10 }}>
              <label className="field-label">物件名</label>
              <input className="form-input" type="text" value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="〇〇マンション外壁改修" style={{ fontSize:13 }} />
            </div>

            {/* 建物用途 ／ 足場種別 */}
            <div className="form-row-2">
              <div>
                <label className="field-label">
                  建物用途 <ConfBadge field="buildingType" />
                </label>
                <select className="form-input" value={buildingType}
                  onChange={e => { setBuildingType(e.target.value); setMeta(m => ({ ...m, buildingType: { fromPdf: false, confidence: 1 } })); }}
                  style={{ fontSize:13 }}>
                  {BUILDING_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">足場種別</label>
                <select className="form-input" value={scaffoldType} onChange={e => setScaffoldType(e.target.value)} style={{ fontSize:13 }}>
                  {SCAFFOLD_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* 階数 ／ 標準階高 ／ 離隔距離 */}
            <div className="form-row-3">
              <div>
                <label className="field-label">
                  階数 <ConfBadge field="floors" />
                </label>
                <input className="form-input" type="number" min={1} max={20} value={floors}
                  onChange={e => { setFloors(parseInt(e.target.value) || 1); setMeta(m => ({ ...m, floors: { fromPdf: false, confidence: 1 } })); }}
                  style={{ fontSize:13, border: meta.floors.fromPdf && meta.floors.confidence < 0.8 ? '2px solid #F39C12' : '' }} />
              </div>
              <div>
                <label className="field-label">
                  標準階高(m) <ConfBadge field="floorHeight" />
                </label>
                <input className="form-input" type="number" min={2.0} max={5.0} step={0.1} value={floorHeight}
                  onChange={e => { setFloorHeight(parseFloat(e.target.value) || 2.8); setMeta(m => ({ ...m, floorHeight: { fromPdf: false, confidence: 1 } })); }}
                  style={{ fontSize:13, border: meta.floorHeight.fromPdf && meta.floorHeight.confidence < 0.8 ? '2px solid #F39C12' : '' }} />
              </div>
              <div>
                <label className="field-label">離隔距離(m)</label>
                <input className="form-input" type="number" min={0.1} max={1.0} step={0.05} value={clearance}
                  onChange={e => setClearance(parseFloat(e.target.value) || 0.3)} style={{ fontSize:13 }} />
              </div>
            </div>

            {/* 養生シート */}
            <div style={{ marginBottom:14 }}>
              <label className="field-label">養生シート</label>
              <div style={{ display:'flex', gap:12 }}>
                {['あり', 'なし'].map(v => (
                  <label key={v} style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, cursor:'pointer' }}>
                    <input type="radio" name="mesh" value={v} checked={meshOpt === v} onChange={() => setMeshOpt(v)} />
                    {v}
                  </label>
                ))}
              </div>
            </div>

            {/* 建物外周 */}
            <div>
              <label className="field-label">
                建物外周（辺ごとの長さ） <ConfBadge field="sides" />
              </label>
              {meta.sides.fromPdf && meta.sides.confidence < 0.8 && (
                <div style={{ fontSize:11, color:'#935116', background:'#FEF9E7', border:'1px solid #F9E79F', borderRadius:4, padding:'4px 8px', marginBottom:6 }}>
                  ⚠️ 寸法の読み取り確信度が低めです。図面の数値と照合してください。
                </div>
              )}
              <SidesList sides={sides} onChange={v => { setSides(v); setMeta(m => ({ ...m, sides: { fromPdf: false, confidence: 1 } })); }} />
            </div>

            {/* 計算ボタン */}
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="btn btn-primary" style={{ flex:1, fontSize:15, padding:'10px 0' }} onClick={handleCalculate}>
                ▶ 計算する
              </button>
              {result && (
                <button className="btn btn-secondary" onClick={handleSave} title="保存">💾 保存</button>
              )}
            </div>
          </div>

          {/* 保存済み案件 */}
          {projects.length > 0 && (
            <div className="card">
              <h2 className="card-title" style={{ fontSize:15 }}>💾 保存済み案件</h2>
              <SavedList projects={projects} onLoad={handleLoad} />
            </div>
          )}
        </div>

        {/* ===== 右カラム ===== */}
        <div className="card">
          <div className="tabs">
            <button className={`tab-btn ${tab === 'result' ? 'active' : ''}`} onClick={() => setTab('result')}>📊 数量・拾い出し</button>
            <button className={`tab-btn ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>📐 仮設計画図</button>
          </div>

          {tab === 'result' && (
            result
              ? <ResultTable result={result} onPdfExport={handlePdfExport} onExcelExport={handleExcelExport} layout={layout} />
              : <div style={{ textAlign:'center', padding:'80px 20px', color:'#95A5A6' }}>
                  <div style={{ fontSize:52, marginBottom:12 }}>📊</div>
                  <div style={{ fontSize:15, marginBottom:8 }}>左のフォームに入力して「計算する」を押してください</div>
                  <div style={{ fontSize:13 }}>PDFをドロップするとAIが自動で入力します</div>
                </div>
          )}

          {tab === 'plan' && (
            layout
              ? <ScaffoldPlan layout={layout} />
              : <div style={{ textAlign:'center', padding:'80px 20px', color:'#95A5A6', fontSize:14 }}>
                  計算後に仮設計画図が表示されます
                </div>
          )}
        </div>
      </div>
    </>
  );
}

// バッジスタイル
const badge = (color: string, bg: string): React.CSSProperties => ({
  display: 'inline-block', padding: '1px 5px',
  background: bg, color, fontSize: 10, borderRadius: 4, fontWeight: 700,
  border: `1px solid ${color}33`,
});
