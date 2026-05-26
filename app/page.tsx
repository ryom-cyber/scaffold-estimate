'use client';

import { useState, useEffect, useCallback } from 'react';
import SidesList from '@/components/SidesList';
import ResultTable from '@/components/ResultTable';
import ScaffoldPlan from '@/components/ScaffoldPlan';
import SavedList from '@/components/SavedList';
import PdfImport from '@/components/PdfImport';
import { calculate } from '@/lib/scaffold';
import { sidestoVertices, buildScaffoldLayout } from '@/lib/geometry';
import { getMaster, saveProject, listProjects } from '@/lib/storage';
import { CalcResult, ScaffoldInputs, BuildingPolygon, ScaffoldLayout } from '@/lib/types';

const BUILDING_TYPES = ['集合住宅', '学校', '戸建住宅', 'その他'];
const SCAFFOLD_TYPES = ['くさび緊結式', '枠組み足場', '単管足場'];

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#34495E',
};

export default function Home() {
  const [projectName, setProjectName] = useState('');
  const [buildingType, setBuildingType] = useState('集合住宅');
  const [scaffoldType, setScaffoldType] = useState('くさび緊結式');
  const [floors, setFloors] = useState(3);
  const [floorHeight, setFloorHeight] = useState(2.8);
  const [clearance, setClearance] = useState(0.3);
  const [meshOpt, setMeshOpt] = useState('あり');
  const [sides, setSides] = useState([10, 8, 10, 8]);

  const [result, setResult] = useState<CalcResult | null>(null);
  const [layout, setLayout] = useState<ScaffoldLayout | null>(null);
  const [tab, setTab] = useState<'result' | 'plan'>('result');
  const [projects, setProjects] = useState<CalcResult[]>([]);

  useEffect(() => { setProjects(listProjects()); }, []);

  const handleCalculate = useCallback(() => {
    if (sides.some(s => s <= 0)) { alert('辺の長さを正しく入力してください'); return; }

    const inputs: ScaffoldInputs = {
      projectName: projectName || '無題物件',
      buildingType, scaffoldType, floors, floorHeight, clearance, meshOpt, sides,
    };

    // 概算計算（既存）
    const master = getMaster();
    const calcResult = calculate(inputs, master);
    setResult(calcResult);

    // 仮設計画図レイアウト
    const vertices = sidestoVertices(sides);
    const bp: BuildingPolygon = {
      vertices,
      floors, floorHeight, clearance, meshOpt,
      projectName: projectName || '無題物件',
      buildingType,
    };
    const scaffoldLayout = buildScaffoldLayout(bp);
    setLayout(scaffoldLayout);
  }, [projectName, buildingType, scaffoldType, floors, floorHeight, clearance, meshOpt, sides]);

  const handleSave = () => {
    if (!result) { alert('先に計算してください'); return; }
    saveProject(result);
    alert('保存しました！');
    setProjects(listProjects());
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
    const master = getMaster();
    setResult(calculate(p.inputs, master));
    const vertices = sidestoVertices(p.inputs.sides);
    setLayout(buildScaffoldLayout({ vertices, ...p.inputs }));
  };

  const handleReset = () => {
    setProjectName(''); setFloors(3); setFloorHeight(2.8); setClearance(0.3);
    setSides([10, 8, 10, 8]); setResult(null); setLayout(null);
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
      ['建物外周', result.summary.perimeter + 'm'], ['足場外周', result.summary.scaffoldPerimeter + 'm'],
      ['足場総高さ', result.summary.totalHeight + 'm（' + result.summary.segments + '段）'],
      ['足場外面積', result.summary.scaffoldFaceArea + 'm²'], ['推定総重量', result.summary.totalWeight + 'kg'], [],
      ['概算金額（税抜）', '¥' + result.summary.totalAmount.toLocaleString()], [],
      ['作成日', new Date().toLocaleDateString('ja-JP')],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cover), '表紙');

    // 仮設図ベースの拾い出し（レイアウトがあれば）
    const takeoffRows: (string | number)[][] = [['No.', '部材名', '数量', '単位', '単価', '金額', '重量(kg)']];
    if (layout) {
      const master = getMaster();
      const items = [
        ['支柱（ジャッキ付）', layout.takeoff.jackPost],
        ['支柱（中間1800）',   layout.takeoff.midPost],
        ['布板（踏板600幅）',  layout.takeoff.board],
        ['手すり（横架材）',   layout.takeoff.handrail],
        ['筋交い',             layout.takeoff.brace],
        ['壁つなぎ',           layout.takeoff.wallTieCount],
        ['ジャッキベース',     layout.takeoff.jackBase],
        ['メッシュシート',     layout.takeoff.mesh],
        ['アンカー',           layout.takeoff.anchor],
      ] as [string, number][];
      let total = 0;
      items.forEach(([name, qty], i) => {
        if (qty === 0) return;
        const m = master[name];
        if (!m) return;
        const amount = qty * m.unitPrice;
        total += amount;
        takeoffRows.push([i + 1, name, qty, m.unit, m.unitPrice, amount, +(qty * m.weight).toFixed(1)]);
      });
      takeoffRows.push([], ['', '合計（仮設図ベース）', '', '', '', total, '']);
    } else {
      result.items.forEach((it, i) => {
        takeoffRows.push([i + 1, it.name, it.qty, it.unit, it.unitPrice, it.amount, +it.weight.toFixed(1)]);
      });
      takeoffRows.push([], ['', '合計', '', '', '', result.summary.totalAmount, result.summary.totalWeight]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(takeoffRows), '数量明細（拾い出し）');
    XLSX.writeFile(wb, `足場見積_${result.projectName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const Empty = ({ msg }: { msg: string }) => (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#95A5A6', fontSize: 14 }}>{msg}</div>
  );

  return (
    <>
      <style>{`
        .layout-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px; }
        @media (max-width: 900px) { .layout-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="layout-grid">
        {/* 左：入力フォーム */}
        <div className="card">
          <h2 className="card-title">📋 建物情報の入力</h2>

          <PdfImport onApply={(data) => {
            if (data.floors) setFloors(data.floors);
            if (data.floorHeight) setFloorHeight(data.floorHeight);
            if (data.buildingType) setBuildingType(data.buildingType);
            if (data.sides?.length) setSides(data.sides);
          }} />

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>物件名</label>
            <input className="form-input" type="text" value={projectName}
              onChange={e => setProjectName(e.target.value)} placeholder="例：〇〇マンション外壁改修" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>建物用途</label>
              <select className="form-input" value={buildingType} onChange={e => setBuildingType(e.target.value)}>
                {BUILDING_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>足場種別</label>
              <select className="form-input" value={scaffoldType} onChange={e => setScaffoldType(e.target.value)}>
                {SCAFFOLD_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>階数</label>
              <input className="form-input" type="number" min={1} max={20} value={floors}
                onChange={e => setFloors(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label style={labelStyle}>標準階高 (m)</label>
              <input className="form-input" type="number" min={2.0} max={5.0} step={0.1} value={floorHeight}
                onChange={e => setFloorHeight(parseFloat(e.target.value) || 2.8)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>離隔距離 (m)</label>
              <input className="form-input" type="number" min={0.1} max={1.0} step={0.05} value={clearance}
                onChange={e => setClearance(parseFloat(e.target.value) || 0.3)} />
              <p style={{ fontSize: 12, color: '#7F8C8D', marginTop: 4 }}>外壁から足場外面まで</p>
            </div>
            <div>
              <label style={labelStyle}>養生シート</label>
              <select className="form-input" value={meshOpt} onChange={e => setMeshOpt(e.target.value)}>
                <option>あり</option>
                <option>なし</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>建物の外周（辺ごと）</label>
            <SidesList sides={sides} onChange={setSides} />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleCalculate}>▶ 計算する</button>
            <button className="btn btn-secondary" onClick={handleSave}>💾 保存</button>
            <button className="btn btn-secondary" onClick={handleReset}>リセット</button>
          </div>

          <SavedList projects={projects} onLoad={handleLoad} />
        </div>

        {/* 右：結果タブ */}
        <div className="card">
          <div className="tabs">
            <button className={`tab-btn ${tab === 'result' ? 'active' : ''}`} onClick={() => setTab('result')}>
              📊 数量・拾い出し
            </button>
            <button className={`tab-btn ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>
              📐 仮設計画図
            </button>
          </div>

          {tab === 'result' && (
            result
              ? <ResultTable result={result} onExport={handleExport} layout={layout} />
              : <Empty msg="左のフォームに入力して「計算する」を押してください" />
          )}

          {tab === 'plan' && (
            layout
              ? <ScaffoldPlan layout={layout} />
              : <Empty msg="計算後に仮設計画図が表示されます" />
          )}
        </div>
      </div>
    </>
  );
}
