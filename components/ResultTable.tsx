'use client';

import { CalcResult, ScaffoldLayout } from '@/lib/types';
import { getMaster } from '@/lib/storage';

interface Props {
  result: CalcResult;
  onPdfExport: () => void;
  onExcelExport: () => void;
  layout?: ScaffoldLayout | null;
}

export default function ResultTable({ result, onPdfExport, onExcelExport, layout }: Props) {
  const { summary: s } = result;

  // 仮設図ベースの拾い出し
  const master = getMaster();
  const takeoffItems = layout
    ? ([
        ['支柱（ジャッキ付）', layout.takeoff.jackPost],
        ['支柱（中間1800）',   layout.takeoff.midPost],
        ['布板（踏板600幅）',  layout.takeoff.board],
        ['手すり（横架材）',   layout.takeoff.handrail],
        ['筋交い',             layout.takeoff.brace],
        ['壁つなぎ',           layout.takeoff.wallTieCount],
        ['ジャッキベース',     layout.takeoff.jackBase],
        ['メッシュシート',     layout.takeoff.mesh],
        ['アンカー',           layout.takeoff.anchor],
      ] as [string, number][]).filter(([, qty]) => qty > 0).map(([name, qty]) => {
        const m = master[name];
        return m ? { name, qty, unit: m.unit, unitPrice: m.unitPrice, amount: qty * m.unitPrice, weight: qty * m.weight } : null;
      }).filter(Boolean)
    : result.items;

  const totalAmount = takeoffItems.reduce((sum, it) => sum + (it?.amount ?? 0), 0);

  return (
    <>
      <div className="summary-box">
        {[
          ['建物外周', `${s.perimeter} m`],
          ['足場外周', `${s.scaffoldPerimeter} m`],
          ['足場総高さ', `${s.totalHeight} m（${s.segments}段）`],
          ['足場外面積', `${s.scaffoldFaceArea} m²`],
          ['推定総重量', `${s.totalWeight} kg`],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
            <span style={{ color: '#5D6D7E' }}>{label}</span>
            <span style={{ fontWeight: 700, color: '#1B4F8A' }}>{val}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(46,134,193,0.3)' }}>
          <span style={{ color: '#5D6D7E' }}>概算金額</span>
          <span style={{ fontWeight: 700, fontSize: 20, color: '#E67E22' }}>¥{totalAmount.toLocaleString()}</span>
        </div>
      </div>

      {layout && (
        <div style={{ background: '#E8F8F5', border: '1px solid #A9DFBF', borderRadius: 6, padding: '6px 12px', marginBottom: 10, fontSize: 12, color: '#1E8449' }}>
          ✅ 仮設計画図ベースの拾い出し（スパン{layout.spanSegments.length}・支柱{layout.spanPoints.length}本・壁つなぎ{layout.wallTies.length}箇所）
        </div>
      )}

      <table className="est-table">
        <thead>
          <tr>
            <th>部材名</th>
            <th className="num">数量</th>
            <th>単位</th>
            <th className="num">単価</th>
            <th className="num">金額</th>
          </tr>
        </thead>
        <tbody>
          {takeoffItems.map(it => it && (
            <tr key={it.name}>
              <td>{it.name}</td>
              <td className="num">{it.qty.toLocaleString()}</td>
              <td>{it.unit}</td>
              <td className="num">¥{it.unitPrice.toLocaleString()}</td>
              <td className="num">¥{it.amount.toLocaleString()}</td>
            </tr>
          ))}
          <tr className="subtotal">
            <td colSpan={4} style={{ textAlign: 'right' }}>合計</td>
            <td className="num">¥{totalAmount.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={onPdfExport}>📄 PDFで保存</button>
        <button className="btn btn-secondary" onClick={onExcelExport} title="Windows / Microsoft Office をお使いの方向け">
          📊 Excelダウンロード
        </button>
      </div>

      <p style={{ fontSize: 12, color: '#7F8C8D', marginTop: 12 }}>
        ※ 単価は参考値です。実際の発注時には最新の単価マスタを参照してください。<br />
        ※ PDFはブラウザの印刷ダイアログで「PDFとして保存」を選択してください。
      </p>
    </>
  );
}
