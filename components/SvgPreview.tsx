'use client';

const SPAN = 1.8; // くさび緊結式の基本スパン

interface Props {
  sides: number[];
  clearance: number;
  floors?: number;
  floorHeight?: number;
}

// 辺の長さリストから頂点座標を生成（直角交互に進む）
function buildPoints(sides: number[]): [number, number][] {
  const pts: [number, number][] = [];
  let x = 0, y = 0, dir = 0;
  pts.push([x, y]);
  for (let i = 0; i < sides.length; i++) {
    if (dir === 0) x += sides[i];
    else if (dir === 1) y += sides[i];
    else if (dir === 2) x -= sides[i];
    else y -= sides[i];
    pts.push([x, y]);
    dir = (dir + 1) % 4;
  }
  return pts;
}

// 辺に沿ってスパン割りポイントを生成
function spanPoints(p1: [number, number], p2: [number, number], span: number): [number, number][] {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  const count = Math.ceil(len / span);
  const pts: [number, number][] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    pts.push([p1[0] + dx * t, p1[1] + dy * t]);
  }
  return pts;
}

export default function SvgPreview({ sides, clearance, floors = 3, floorHeight = 2.8 }: Props) {
  const buildingPoints = buildPoints(sides);

  const xs = buildingPoints.map(p => p[0]);
  const ys = buildingPoints.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY;

  const padding = 70;
  const scale = Math.min(420 / Math.max(w, 1), 320 / Math.max(h, 1));
  const svgW = w * scale + padding * 2;
  const svgH = h * scale + padding * 2;

  const toSvg = ([px, py]: [number, number]): [number, number] => [
    (px - minX) * scale + padding,
    (py - minY) * scale + padding,
  ];

  const buildingPath = buildingPoints.map((pt, i) => {
    const [cx, cy] = toSvg(pt);
    return `${i === 0 ? 'M' : 'L'} ${cx} ${cy}`;
  }).join(' ') + ' Z';

  // 足場外側オフセット（簡易：中心からの方向に拡張）
  const cenX = (minX + maxX) / 2;
  const cenY = (minY + maxY) / 2;
  const offset = clearance * scale * 2.5;
  const scaffoldPath = buildingPoints.map((pt, i) => {
    const [cx, cy] = toSvg(pt);
    const dx = pt[0] - cenX, dy = pt[1] - cenY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return `${i === 0 ? 'M' : 'L'} ${cx + (dx / len) * offset} ${cy + (dy / len) * offset}`;
  }).join(' ') + ' Z';

  // スパン割りポイント（各辺）
  const allSpanPts: { pt: [number, number]; sideMid: boolean }[] = [];
  const segs = buildingPoints.slice(0, -1);
  segs.forEach((p1, i) => {
    const p2 = buildingPoints[i + 1];
    const pts = spanPoints(p1, p2, SPAN);
    pts.forEach((pt, j) => {
      allSpanPts.push({ pt, sideMid: j > 0 && j < pts.length - 1 });
    });
  });

  // 壁つなぎ位置（スパン2本おき・鉛直2段おき）
  const totalHeight = floors * floorHeight + 1.5;
  const vSegments = Math.ceil(totalHeight / 1.8);
  const wallTieRows = Math.ceil(vSegments / 2);

  // 寸法ラベル
  const dimLabels = sides.map((len, i) => {
    const p1 = buildingPoints[i];
    const p2 = buildingPoints[i + 1];
    const [mx, my] = toSvg([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]);
    return { x: mx, y: my, label: `${len}m` };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} xmlns="http://www.w3.org/2000/svg" style={{ maxWidth: '100%', height: 'auto' }}>
        {/* 足場ライン */}
        <path d={scaffoldPath} fill="rgba(230,126,34,0.08)" stroke="#E67E22" strokeWidth="2" strokeDasharray="6,3" />

        {/* スパン割りポイント（足場外側の柱位置） */}
        {allSpanPts.filter(s => s.sideMid).map(({ pt }, i) => {
          const p = pt;
          const dx = p[0] - cenX, dy = p[1] - cenY;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const [sx, sy] = toSvg([p[0] + (dx / len) * clearance * 0.7, p[1] + (dy / len) * clearance * 0.7]);
          return <circle key={i} cx={sx} cy={sy} r="3" fill="#E67E22" opacity="0.7" />;
        })}

        {/* 建物外形 */}
        <path d={buildingPath} fill="#D6EAF8" stroke="#1B4F8A" strokeWidth="2" />

        {/* 寸法ラベル */}
        {dimLabels.map(({ x, y, label }, i) => (
          <text key={i} x={x} y={y} textAnchor="middle" fontSize="11" fill="#1B4F8A" fontWeight="600"
            style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3 }}>
            {label}
          </text>
        ))}

        {/* 凡例 */}
        <text x={padding} y={svgH - 32} fontSize="10" fill="#7F8C8D">■ 建物外形</text>
        <text x={padding + 60} y={svgH - 32} fontSize="10" fill="#E67E22">┄ 足場ライン（離隔 {clearance}m）</text>
        <text x={padding} y={svgH - 18} fontSize="10" fill="#7F8C8D">
          ● スパン割り（{SPAN}m）　壁つなぎ {wallTieRows}段 × {Math.ceil(segs.length)}列
        </text>
      </svg>

      {/* 立面情報 */}
      <div style={{ marginTop: 8, padding: '8px 12px', background: '#F2F4F6', borderRadius: 6, fontSize: 12, color: '#5D6D7E' }}>
        足場高さ: <strong>{totalHeight.toFixed(1)}m</strong>
        スパン段数: <strong>{vSegments}段</strong>
        スパン: <strong>{SPAN}m × {Math.ceil(sides.reduce((s, v) => s + v, 0) / SPAN)}スパン</strong>（外周）
      </div>
    </div>
  );
}
