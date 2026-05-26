'use client';

import { ScaffoldLayout, Vec2 } from '@/lib/types';
import { boundingBox } from '@/lib/geometry';
import { generateDXF } from '@/lib/dxf';

interface Props {
  layout: ScaffoldLayout;
}

const PADDING = 80;
const MAX_W = 700;
const MAX_H = 520;

export default function ScaffoldPlan({ layout }: Props) {
  const { building, offsetPolygon, spanPoints, wallTies, spanSegments, totalHeight, verticalSegments, takeoff } = layout;
  const { vertices, floors, floorHeight, clearance, projectName } = building;

  // スケール計算
  const allPts = [...vertices, ...offsetPolygon];
  const bb = boundingBox(allPts);
  const scale = Math.min(MAX_W / Math.max(bb.w, 0.1), MAX_H / Math.max(bb.h, 0.1));
  const svgW = bb.w * scale + PADDING * 2;
  const svgH = bb.h * scale + PADDING * 2;

  const tx = (p: Vec2) => (p.x - bb.minX) * scale + PADDING;
  const ty = (p: Vec2) => (p.y - bb.minY) * scale + PADDING;
  const toXY = (p: Vec2) => `${tx(p).toFixed(1)},${ty(p).toFixed(1)}`;

  const bPolyStr = vertices.map((v, i) => `${i === 0 ? 'M' : 'L'}${toXY(v)}`).join(' ') + 'Z';
  const sPolyStr = offsetPolygon.map((v, i) => `${i === 0 ? 'M' : 'L'}${toXY(v)}`).join(' ') + 'Z';

  // 辺ラベル
  const edgeLabels = vertices.map((v, i) => {
    const next = vertices[(i + 1) % vertices.length];
    const mx = (v.x + next.x) / 2;
    const my = (v.y + next.y) / 2;
    const l = Math.sqrt((next.x - v.x) ** 2 + (next.y - v.y) ** 2);
    return { x: tx({ x: mx, y: my }), y: ty({ x: mx, y: my }) - 8, label: `${l.toFixed(1)}m` };
  });

  // DXFダウンロード
  const handleDXF = () => {
    const dxf = generateDXF(layout);
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `仮設計画図_${projectName || '無題'}_${new Date().toISOString().slice(0, 10)}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* 仮設計画図SVG */}
      <div style={{ background: '#FAFBFC', border: '1px solid #E5E8E8', borderRadius: 8, padding: 12, marginBottom: 12, overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#5D6D7E" />
            </marker>
          </defs>

          {/* 足場外周（オレンジ破線・薄塗り） */}
          <path d={sPolyStr} fill="rgba(230,126,34,0.06)" stroke="#E67E22" strokeWidth="1.5" strokeDasharray="6,3" />

          {/* 壁つなぎ（薄い線） */}
          {wallTies.map((wt, i) => (
            <line key={i}
              x1={tx(wt.scaffold)} y1={ty(wt.scaffold)}
              x2={tx(wt.wall)} y2={ty(wt.wall)}
              stroke="#9B59B6" strokeWidth="0.8" opacity="0.5"
            />
          ))}

          {/* 建物外形（青塗り） */}
          <path d={bPolyStr} fill="#D6EAF8" stroke="#1B4F8A" strokeWidth="2" />

          {/* スパン割り境界線（足場外周上の支柱位置） */}
          {spanPoints.map((pt, i) => (
            <circle key={i} cx={tx(pt)} cy={ty(pt)} r="3.5" fill="#E67E22" stroke="white" strokeWidth="1" />
          ))}

          {/* 壁つなぎマーク（×） */}
          {wallTies.slice(0, 50).map((wt, i) => {
            const x = tx(wt.scaffold), y = ty(wt.scaffold);
            return (
              <g key={i}>
                <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} stroke="#9B59B6" strokeWidth="1.2" />
                <line x1={x + 4} y1={y - 4} x2={x - 4} y2={y + 4} stroke="#9B59B6" strokeWidth="1.2" />
              </g>
            );
          })}

          {/* 辺寸法ラベル */}
          {edgeLabels.map(({ x, y, label }, i) => (
            <text key={i} x={x} y={y} textAnchor="middle" fontSize="11" fill="#1B4F8A" fontWeight="600"
              style={{ paintOrder: 'stroke' as const }} stroke="white" strokeWidth="3">
              {label}
            </text>
          ))}

          {/* 凡例 */}
          <g transform={`translate(${PADDING / 2}, ${svgH - 52})`} fontSize="9" fill="#5D6D7E">
            <rect x="0" y="0" width="10" height="10" fill="#D6EAF8" stroke="#1B4F8A" strokeWidth="1.5" />
            <text x="13" y="9">建物外形</text>
            <circle cx="5" cy="22" r="3.5" fill="#E67E22" />
            <text x="13" y="26">支柱位置（{spanPoints.length}本）</text>
            <line x1="0" y1="38" x2="10" y2="38" stroke="#E67E22" strokeWidth="1.5" strokeDasharray="4,2" />
            <text x="13" y="42">足場外周（離隔{clearance}m）</text>
            <text x="0" y="55">× 壁つなぎ（{wallTies.length}箇所）</text>
          </g>

          {/* タイトル */}
          <text x={svgW / 2} y="18" textAnchor="middle" fontSize="13" fill="#1B4F8A" fontWeight="700">
            仮設計画図（平面）
          </text>
          <text x={svgW - PADDING / 2} y="18" textAnchor="end" fontSize="9" fill="#7F8C8D">
            {projectName}　{floors}F　H={totalHeight.toFixed(1)}m　{verticalSegments}段
          </text>
        </svg>
      </div>

      {/* スパン情報サマリー */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          ['外周スパン数', `${spanSegments.length}スパン`],
          ['高さ方向段数', `${verticalSegments}段`],
          ['足場総高さ', `${totalHeight.toFixed(1)}m`],
          ['壁つなぎ箇所', `${wallTies.length}箇所`],
          ['支柱本数（外周）', `${spanPoints.length}本`],
          ['メッシュシート', `${takeoff.mesh}m²`],
        ].map(([label, val]) => (
          <div key={label} style={{ background: '#F2F4F6', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 11, color: '#7F8C8D' }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1B4F8A' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* DXF出力ボタン */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleDXF}>
          📐 DXFダウンロード（CAD用）
        </button>
      </div>

      <p style={{ fontSize: 11, color: '#7F8C8D', marginTop: 8 }}>
        ※ DXFはAutoCAD・JW-CAD・Vectorworks等で開けます。レイヤー：建物外形 / 足場外周 / 支柱 / 壁つなぎ / 寸法
      </p>
    </div>
  );
}
