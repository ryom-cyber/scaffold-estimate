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

interface ExtractedData {
  floors?: number | null;
  floorHeight?: number | null;
  buildingType?: string | null;
  sides?: number[] | null;
  notes?: string | null;
  _model?: string;
}

// PDF解析でどのフィールドが自動入力されたかを管理
interface PdfFilled {
  floors: boolean;
  floorHeight: boolean;
  buildingType: boolean;
  sides: boolean;
}

export default function Home() {
  // フォーム値（常に表示・常に編集可）
  const [projectName, setProjectName] = useState('');
  const [buildingType, setBuildingType] = useState('集合住宅');
  const [scaffoldType, setScaffoldType] = useState('くさび緊結式');
  const [floors, setFloors] = useState(3);
  const [floorHeight, setFloorHeight] = useState(2.8);
  const [clearance, setClearance] = useState(0.3);
  const [meshOpt, setMeshOpt] = useState('あり');
  const [sides, setSides] = useState<number[]>([10, 8, 10, 8]);

  // PDF
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [pdfError, setPdfError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [pdfNotes, setPdfNotes] = useState('');
  const [pdfFilled, setPdfFilled] = useState<PdfFilled>({ floors: false, floorHeight: false, buildingType: false, sides: false });

  // 結果
  const [result, setResult] = useState<CalcResult | null>(null);
  const [layout, setLayout] = useState<ScaffoldLayout | null>(null);
  const [tab, setTab] = useState<'result' | 'plan'>('result');
  const [projects, setProjects] = useState<CalcResult[]>([]);

  useEffect(() => { setProjects(listProjects()); }, []);

  // --- PDF処理 ---
  const processPdf = async (file: File) => {
    setPdfStatus('loading');
    setPdfError('');
    setPdfFilled({ floors: false, floorHeight: false, buildingType: false, sides: false });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const maxPages = Math.min(pdf.numPages, 5);
      let extracted: ExtractedData | null = null;
      let bestPreview = '';

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx as Parameters<typeof page.render>[0]['canvasContext'], viewport, canvas }).promise;

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];

        const res = await fetch('/api/analyze-drawing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: 'image/png', pageNum }),
        });
        const json = await res.json() as ExtractedData & { error?: string };
        if (!res.ok) throw new Error(json.error || '解析失敗');

        if (!bestPreview) bestPreview = dataUrl;

        // sidesが3辺以上取れたページを優先
        if (json.sides && json.sides.length >= 3) {
          extracted = json;
          bestPreview = dataUrl;
          break;
        }
        if (pageNum === maxPages && !extracted) {
          extracted = json;
        }
      }

      if (!extracted) throw new Error('図面情報を抽出できませんでした');

      setPreviewUrl(bestPreview);

      // フォームに反映（取れた項目だけ）＆バッジ管理
      const filled: PdfFilled = { floors: false, floorHeight: false, buildingType: false, sides: false };
      if (extracted.floors && extracted.floors > 0) { setFloors(extracted.floors); filled.floors = true; }
      if (extracted.floorHeight && extracted.floorHeight > 0) { setFloorHeight(extracted.floorHeight); filled.floorHeight = true; }
      if (extracted.buildingType && BUILDING_TYPES.includes(extracted.buildingType)) { setBuildingType(extracted.buildingType); filled.buildingType = true; }
      if (extracted.sides && extracted.sides.length >= 3) { setSides(extracted.sides); filled.sides = true; }
      if (extracted.notes) setPdfNotes(extracted.notes);

      setPdfFilled(filled);
      setPdfStatus('idle');
    } catch (e: unknown) {
      setPdfError(e instanceof Error ? e.message : String(e));
      setPdfStatus('error');
    }
  };

  // --- 計算 ---
  const handleCalculate = () => {
    if (sides.length < 3 || sides.some(s => s <= 0)) {
      alert('建物外周の辺の長さを入力してください（3辺以上）');
      return;
    }
    const inputs: ScaffoldInputs = {
      projectName: projectName || '無題物件',
      buildingType, scaffoldType,
      floors, floorHeight, clearance, meshOpt,
      sides,
    };
    const master = getMaster();
    const calcResult = calculate(inputs, master);
    setResult(calcResult);
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
    setPdfFilled({ floors: false, floorHeight: false, buildingType: false, sides: false });
    const master = getMaster();
    setResult(calculate(p.inputs, master));
    const vertices = sidestoVertices(p.inputs.sides);
    setLayout(buildScaffoldLayout({ vertices, ...p.inputs }));
  };

  const handleExport = async () => {
    if (!result) return;
    const XLSX = (await import('xlsx')).default;
    const wb = XLSX.utils.book_new();
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
        ['布板（踏板600幅）', layout.takeoff.board], ['手すり（横架材）', layout.takeoff.handrail],
        ['筋交い', layout.takeoff.brace], ['壁つなぎ', layout.takeoff.wallTieCount],
        ['ジャッキベース', layout.takeoff.jackBase], ['メッシュシート', layout.takeoff.mesh],
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

  const anyPdfFilled = Object.values(pdfFilled).some(Boolean);

  return (
    <>
      <style>{`
        .layout-grid { display: grid; grid-template-columns: 420px 1fr; gap: 24px; }
        @media (max-width: 960px) { .layout-grid { grid-template-columns: 1fr; } }
        .pdf-badge { display:inline-flex; align-items:center; gap:3px; background:#E8F8F5; border:1px solid #A9DFBF; border-radius:4px; padding:1px 6px; font-size:10px; color:#1E8449; font-weight:700; margin-left:6px; }
        .form-row { display:grid; gap:8px; margin-bottom:10px; }
        .form-row-2 { grid-template-columns:1fr 1fr; }
        .form-row-3 { grid-template-columns:1fr 1fr 1fr; }
        .field-label { font-size:12px; font-weight:600; color:#5D6D7E; display:block; margin-bottom:4px; }
      `}</style>

      <div className="layout-grid">

        {/* ===== 左カラム ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* PDF読み込み（任意） */}
          <div className="card">
            <h2 className="card-title">
              📄 図面を読み込む
              <span style={{ fontSize: 11, fontWeight: 400, color: '#95A5A6', marginLeft: 8 }}>（任意 — 手入力のみでも計算できます）</span>
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
                border: `2px dashed ${dragOver ? '#2E86C1' : pdfStatus === 'error' ? '#E74C3C' : '#B2BEC3'}`,
                borderRadius: 8, padding: '14px 16px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#E6F1FB' : '#F8FAFB', transition: 'all 0.2s',
              }}
            >
              {pdfStatus === 'loading'
                ? <><div style={{ fontSize: 20, marginBottom: 4 }}>🔍</div><div style={{ fontSize: 12, color: '#5D6D7E' }}>Geminiで図面を解析中...</div></>
                : <><div style={{ fontSize: 20, marginBottom: 4 }}>📐</div>
                    <div style={{ fontSize: 12, color: '#5D6D7E' }}>平面図PDFをドロップ</div>
                    <div style={{ fontSize: 11, color: '#95A5A6', marginTop: 2 }}>または クリックして選択</div>
                  </>
              }
            </div>

            {pdfStatus === 'error' && (
              <div style={{ background: '#FADBD8', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#922B21', marginTop: 8 }}>⚠️ {pdfError}</div>
            )}

            {anyPdfFilled && (
              <div style={{ marginTop: 8, background: '#E8F8F5', border: '1px solid #A9DFBF', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#1E8449' }}>
                ✅ 下のフォームに自動入力しました。内容を確認・修正して「計算する」をクリックしてください。
              </div>
            )}

            {pdfNotes && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#7F8C8D', background: '#F8FAFB', borderRadius: 6, padding: '6px 10px' }}>
                💬 {pdfNotes}
              </div>
            )}

            {previewUrl && (
              <img src={previewUrl} alt="図面" style={{ width: '100%', borderRadius: 4, marginTop: 8, border: '1px solid #E5E8E8', opacity: 0.85 }} />
            )}
          </div>

          {/* ===== 入力フォーム ===== */}
          <div className="card">
            <h2 className="card-title">📝 物件情報</h2>

            {/* 物件名 */}
            <div style={{ marginBottom: 10 }}>
              <label className="field-label">物件名</label>
              <input className="form-input" type="text" value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="〇〇マンション外壁改修" style={{ fontSize: 13 }} />
            </div>

            {/* 建物用途 ／ 足場種別 */}
            <div className="form-row form-row-2">
              <div>
                <label className="field-label">
                  建物用途
                  {pdfFilled.buildingType && <span className="pdf-badge">PDF</span>}
                </label>
                <select className="form-input" value={buildingType} onChange={e => setBuildingType(e.target.value)} style={{ fontSize: 13 }}>
                  {BUILDING_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">足場種別</label>
                <select className="form-input" value={scaffoldType} onChange={e => setScaffoldType(e.target.value)} style={{ fontSize: 13 }}>
                  {SCAFFOLD_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* 階数 ／ 標準階高 ／ 離隔距離 */}
            <div className="form-row form-row-3">
              <div>
                <label className="field-label">
                  階数
                  {pdfFilled.floors && <span className="pdf-badge">PDF</span>}
                </label>
                <input className="form-input" type="number" min={1} max={20} value={floors}
                  onChange={e => setFloors(parseInt(e.target.value) || 1)} style={{ fontSize: 13 }} />
              </div>
              <div>
                <label className="field-label">
                  標準階高 (m)
                  {pdfFilled.floorHeight && <span className="pdf-badge">PDF</span>}
                </label>
                <input className="form-input" type="number" min={2.0} max={5.0} step={0.1} value={floorHeight}
                  onChange={e => setFloorHeight(parseFloat(e.target.value) || 2.8)} style={{ fontSize: 13 }} />
              </div>
              <div>
                <label className="field-label">離隔距離 (m)</label>
                <input className="form-input" type="number" min={0.1} max={1.0} step={0.05} value={clearance}
                  onChange={e => setClearance(parseFloat(e.target.value) || 0.3)} style={{ fontSize: 13 }} />
              </div>
            </div>

            {/* 養生シート */}
            <div style={{ marginBottom: 14 }}>
              <label className="field-label">養生シート</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {['あり', 'なし'].map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="mesh" value={v} checked={meshOpt === v} onChange={() => setMeshOpt(v)} />
                    {v}
                  </label>
                ))}
              </div>
            </div>

            {/* 建物外周（辺リスト） */}
            <div>
              <label className="field-label">
                建物外周（辺ごとの長さ）
                {pdfFilled.sides && <span className="pdf-badge">PDF</span>}
              </label>
              <SidesList sides={sides} onChange={setSides} />
            </div>

            {/* 計算ボタン */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: 15, padding: '10px 0' }} onClick={handleCalculate}>
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
              <h2 className="card-title" style={{ fontSize: 15 }}>💾 保存済み案件</h2>
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
              ? <ResultTable result={result} onExport={handleExport} layout={layout} />
              : <div style={{ textAlign: 'center', padding: '80px 20px', color: '#95A5A6' }}>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 15, marginBottom: 6 }}>左のフォームに入力して「計算する」を押してください</div>
                  <div style={{ fontSize: 13 }}>PDFをドロップすると自動で入力されます</div>
                </div>
          )}

          {tab === 'plan' && (
            layout
              ? <ScaffoldPlan layout={layout} />
              : <div style={{ textAlign: 'center', padding: '80px 20px', color: '#95A5A6', fontSize: 14 }}>
                  計算後に仮設計画図が表示されます
                </div>
          )}
        </div>
      </div>
    </>
  );
}
