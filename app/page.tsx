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

// PDFから取れない設定（常に表示）
const SCAFFOLD_TYPES = ['くさび緊結式', '枠組み足場', '単管足場'];

interface ExtractedData {
  floors?: number | null;
  floorHeight?: number | null;
  buildingType?: string | null;
  sides?: number[] | null;
  notes?: string | null;
  _model?: string;
}

export default function Home() {
  // PDF解析結果
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [pdfError, setPdfError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // 補正用（足りない値だけ入力させる）
  const [sides, setSides] = useState<number[]>([10, 8, 10, 8]);
  const [projectName, setProjectName] = useState('');

  // 常に設定が必要な項目
  const [scaffoldType, setScaffoldType] = useState('くさび緊結式');
  const [clearance, setClearance] = useState(0.3);
  const [meshOpt, setMeshOpt] = useState('あり');

  // 結果
  const [result, setResult] = useState<CalcResult | null>(null);
  const [layout, setLayout] = useState<ScaffoldLayout | null>(null);
  const [tab, setTab] = useState<'result' | 'plan'>('result');
  const [projects, setProjects] = useState<CalcResult[]>([]);

  useEffect(() => { setProjects(listProjects()); }, []);

  // PDFをcanvasで描画 → base64 → Gemini解析
  const processPdf = async (file: File) => {
    setPdfStatus('loading');
    setPdfError('');
    setExtracted(null);
    setResult(null);
    setLayout(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      // 全ページを解析して最初に平面図っぽいページを使う（最大3ページ試行）
      let resultData: ExtractedData | null = null;
      const maxPages = Math.min(pdf.numPages, 5);

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

        // sidesが取れたページを優先
        if (json.sides && json.sides.length >= 3) {
          setPreviewUrl(dataUrl);
          resultData = json;
          break;
        }
        // 最後のページならそれで使う
        if (pageNum === maxPages) {
          setPreviewUrl(dataUrl);
          resultData = json;
        }
      }

      if (!resultData) throw new Error('図面情報を抽出できませんでした');

      setExtracted(resultData);
      if (resultData.sides?.length) setSides(resultData.sides);

      // sidesが揃っていれば即計算
      const readySides = resultData.sides?.length ? resultData.sides : sides;
      if (readySides.length >= 3 && readySides.every(s => s > 0)) {
        autoCalculate(resultData, readySides);
      }
      setPdfStatus('idle');
    } catch (e: unknown) {
      setPdfError(e instanceof Error ? e.message : String(e));
      setPdfStatus('error');
    }
  };

  const autoCalculate = (data: ExtractedData, sidesArr: number[]) => {
    const inputs: ScaffoldInputs = {
      projectName: projectName || '無題物件',
      buildingType: data.buildingType || '集合住宅',
      scaffoldType,
      floors: data.floors || 3,
      floorHeight: data.floorHeight || 2.8,
      clearance, meshOpt, sides: sidesArr,
    };
    const master = getMaster();
    setResult(calculate(inputs, master));
    const vertices = sidestoVertices(sidesArr);
    const bp: BuildingPolygon = {
      vertices,
      floors: inputs.floors, floorHeight: inputs.floorHeight,
      clearance, meshOpt, projectName: inputs.projectName,
      buildingType: inputs.buildingType,
    };
    setLayout(buildScaffoldLayout(bp));
  };

  const handleCalculate = () => {
    if (sides.some(s => s <= 0)) { alert('辺の長さを入力してください'); return; }
    autoCalculate(extracted || {}, sides);
  };

  const handleSave = () => {
    if (!result) return;
    saveProject(result);
    alert('保存しました！');
    setProjects(listProjects());
  };

  const handleLoad = (p: CalcResult) => {
    setExtracted({ floors: p.inputs.floors, floorHeight: p.inputs.floorHeight, buildingType: p.inputs.buildingType });
    setSides([...p.inputs.sides]);
    setScaffoldType(p.inputs.scaffoldType);
    setClearance(p.inputs.clearance);
    setMeshOpt(p.inputs.meshOpt);
    setProjectName(p.projectName);
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

  const needsSides = !extracted?.sides?.length;
  const hasResult = !!result;

  return (
    <>
      <style>{`
        .layout-grid { display: grid; grid-template-columns: 400px 1fr; gap: 24px; }
        @media (max-width: 900px) { .layout-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="layout-grid">

        {/* 左：PDFドロップ + 最小設定 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* PDFドロップゾーン */}
          <div className="card">
            <h2 className="card-title">📄 図面を読み込む</h2>

            <div
              onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf'; inp.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) processPdf(f); }; inp.click(); }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f?.type === 'application/pdf') processPdf(f); else alert('PDFを選択してください'); }}
              style={{
                border: `2px dashed ${dragOver ? '#2E86C1' : pdfStatus === 'error' ? '#E74C3C' : '#B2BEC3'}`,
                borderRadius: 8, padding: '20px 16px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#E6F1FB' : '#F8FAFB', transition: 'all 0.2s',
              }}
            >
              {pdfStatus === 'loading'
                ? <><div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div><div style={{ fontSize: 13, color: '#5D6D7E' }}>Geminiで図面を解析中...</div></>
                : <><div style={{ fontSize: 24, marginBottom: 6 }}>📐</div><div style={{ fontSize: 13, color: '#5D6D7E' }}>平面図PDFをドロップ</div><div style={{ fontSize: 11, color: '#95A5A6', marginTop: 4 }}>または クリックして選択</div></>
              }
            </div>

            {pdfStatus === 'error' && (
              <div style={{ background: '#FADBD8', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#922B21', marginTop: 8 }}>⚠️ {pdfError}</div>
            )}

            {/* 解析結果バッジ */}
            {extracted && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {extracted.floors && <span style={badge('#1B4F8A')}>🏢 {extracted.floors}階</span>}
                {extracted.floorHeight && <span style={badge('#27AE60')}>📏 階高{extracted.floorHeight}m</span>}
                {extracted.buildingType && <span style={badge('#8E44AD')}>{extracted.buildingType}</span>}
                {extracted.sides?.length
                  ? <span style={badge('#E67E22')}>外周{extracted.sides.length}辺 ✅</span>
                  : <span style={badge('#E74C3C')}>外周未取得 ⚠️</span>
                }
              </div>
            )}

            {extracted?.notes && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#7F8C8D', background: '#F8FAFB', borderRadius: 6, padding: '6px 10px' }}>
                💬 {extracted.notes}
              </div>
            )}

            {/* プレビュー（小さく） */}
            {previewUrl && (
              <img src={previewUrl} alt="図面" style={{ width: '100%', borderRadius: 4, marginTop: 8, border: '1px solid #E5E8E8', opacity: 0.85 }} />
            )}
          </div>

          {/* 辺の入力（取れなかった場合のみ） */}
          {needsSides && extracted && (
            <div className="card">
              <h2 className="card-title" style={{ fontSize: 15 }}>⚠️ 外周寸法を入力</h2>
              <p style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 12 }}>平面図ページから辺の長さを読み取れませんでした。手入力してください。</p>
              <SidesList sides={sides} onChange={setSides} />
            </div>
          )}

          {/* 設定（常に表示） */}
          <div className="card">
            <h2 className="card-title" style={{ fontSize: 15 }}>⚙️ 設定</h2>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#5D6D7E', display: 'block', marginBottom: 4 }}>物件名</label>
              <input className="form-input" type="text" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="〇〇マンション外壁改修" style={{ fontSize: 13 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#5D6D7E', display: 'block', marginBottom: 4 }}>足場種別</label>
                <select className="form-input" value={scaffoldType} onChange={e => setScaffoldType(e.target.value)} style={{ fontSize: 13 }}>
                  {SCAFFOLD_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#5D6D7E', display: 'block', marginBottom: 4 }}>養生シート</label>
                <select className="form-input" value={meshOpt} onChange={e => setMeshOpt(e.target.value)} style={{ fontSize: 13 }}>
                  <option>あり</option><option>なし</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#5D6D7E', display: 'block', marginBottom: 4 }}>離隔距離 (m)</label>
              <input className="form-input" type="number" min={0.1} max={1.0} step={0.05} value={clearance}
                onChange={e => setClearance(parseFloat(e.target.value) || 0.3)} style={{ fontSize: 13 }} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCalculate}>
                ▶ {hasResult ? '再計算' : '計算する'}
              </button>
              {hasResult && <button className="btn btn-secondary" onClick={handleSave}>💾</button>}
            </div>
          </div>

          {/* 保存済み */}
          {projects.length > 0 && (
            <div className="card">
              <h2 className="card-title" style={{ fontSize: 15 }}>💾 保存済み案件</h2>
              <SavedList projects={projects} onLoad={handleLoad} />
            </div>
          )}
        </div>

        {/* 右：結果 */}
        <div className="card">
          <div className="tabs">
            <button className={`tab-btn ${tab === 'result' ? 'active' : ''}`} onClick={() => setTab('result')}>📊 数量・拾い出し</button>
            <button className={`tab-btn ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>📐 仮設計画図</button>
          </div>

          {tab === 'result' && (
            result
              ? <ResultTable result={result} onExport={handleExport} layout={layout} />
              : <div style={{ textAlign: 'center', padding: '60px 20px', color: '#95A5A6' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📐</div>
                  <div style={{ fontSize: 14 }}>平面図PDFをドロップすると自動で計算します</div>
                </div>
          )}

          {tab === 'plan' && (
            layout
              ? <ScaffoldPlan layout={layout} />
              : <div style={{ textAlign: 'center', padding: '60px 20px', color: '#95A5A6', fontSize: 14 }}>
                  計算後に仮設計画図が表示されます
                </div>
          )}
        </div>
      </div>
    </>
  );
}

const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '3px 8px', background: color,
  color: 'white', fontSize: 11, borderRadius: 4, fontWeight: 600,
});
