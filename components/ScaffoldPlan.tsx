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

  // 仮設計画図PDFダウンロード（ブラウザ印刷→PDF保存）
  const handlePlanPDF = () => {
    const svgEl = document.querySelector('.scaffold-plan-svg') as SVGElement | null;
    const svgStr = svgEl ? new XMLSerializer().serializeToString(svgEl) : '';
    const infoRows: [string, string][] = [
      ['外周スパン数', `${spanSegments.length}スパン`],
      ['高さ方向段数', `${verticalSegments}段`],
      ['足場総高さ', `${totalHeight.toFixed(1)}m`],
      ['壁つなぎ箇所', `${wallTies.length}箇所`],
      ['支柱本数（外周）', `${spanPoints.length}本`],
      ['メッシュシート', `${takeoff.mesh}m²`],
    ];
    const infoHtml = infoRows.map(([l, v]) =>
      `<div class="ic"><div class="il">${l}</div><div class="iv">${v}</div></div>`
    ).join('');
    const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<title>仮設計画図 - ${projectName || '無題'}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Hiragino Sans','Yu Gothic UI','Meiryo',sans-serif; padding:10mm; }
h1 { font-size:13pt; color:#1B4F8A; border-bottom:2pt solid #1B4F8A; padding-bottom:5pt; margin-bottom:10pt; }
.svg-wrap { width:100%; border:1pt solid #ddd; border-radius:4pt; overflow:hidden; margin-bottom:10pt; }
.svg-wrap svg { width:100%; height:auto; display:block; }
.ig { display:grid; grid-template-columns:repeat(3,1fr); gap:5pt; margin-bottom:10pt; }
.ic { background:#F2F4F6; border-radius:3pt; padding:5pt 8pt; }
.il { font-size:8pt; color:#7F8C8D; }
.iv { font-size:11pt; font-weight:700; color:#1B4F8A; }
.footer { font-size:8pt; color:#7F8C8D; border-top:0.5pt solid #ddd; padding-top:5pt; display:flex; justify-content:space-between; }
@media print { body { padding:6mm; } @page { size:A3 landscape; margin:0; } }
</style></head><body>
<h1>仮設計画図（平面）— ${projectName || '無題'}　${floors}F　H=${totalHeight.toFixed(1)}m　${verticalSegments}段</h1>
<div class="svg-wrap">${svgStr}</div>
<div class="ig">${infoHtml}</div>
<div class="footer">
  <span>離隔距離 ${clearance}m　スパン割：1.2/1.5/1.8m ベストフィット</span>
  <span>作成日: ${new Date().toLocaleDateString('ja-JP')}</span>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) { alert('ポップアップをブロックしています。ブラウザの設定で許可してください。'); return; }
    win.document.write(html);
    win.document.close();
  };

  return (
    <div>
      {/* 仮設計画図SVG */}
      <div style={{ background: '#FAFBFC', border: '1px solid #E5E8E8', borderRadius: 8, padding: 12, marginBottom: 12, overflowX: 'auto' }}>
        <svg className="scaffold-plan-svg" viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: '100%', height: 'auto', display: 'block' }}>
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

      {/* 出力ボタン */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handlePlanPDF}>
          📄 仮設計画図をPDFで保存
        </button>
        <button className="btn btn-secondary" onClick={handleDXF}>
          📐 DXFダウンロード（CAD用）
        </button>
      </div>

      <p style={{ fontSize: 11, color: '#7F8C8D', marginTop: 8 }}>
        ※ PDFはブラウザの印刷ダイアログで「PDFとして保存」を選択してください（Mac標準機能）。<br />
        ※ DXFはAutoCAD・JW-CAD等で開けます。
      </p>
    </div>
  );
}
