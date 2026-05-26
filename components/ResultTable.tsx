'use client';

import { CalcResult } from '@/lib/types';

interface Props {
  result: CalcResult;
  onExport: () => void;
}

export default function ResultTable({ result, onExport }: Props) {
  const { summary: s, items } = result;
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
          <span style={{ fontWeight: 700, fontSize: 20, color: '#E67E22' }}>¥{s.totalAmount.toLocaleString()}</span>
        </div>
      </div>

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
          {items.map(it => (
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
            <td className="num">¥{s.totalAmount.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={onExport}>📥 Excelダウンロード</button>
      </div>

      <p style={{ fontSize: 12, color: '#7F8C8D', marginTop: 12 }}>
        ※ 単価は参考値です。実際の発注時には最新の単価マスタを参照してください。
      </p>
    </>
  );
}
