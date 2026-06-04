'use client';

import { ScaffoldLayout, Vec2, SpanSegment } from '@/lib/types';

interface Props {
  layout: ScaffoldLayout;
}

// 1段あたりの描画高さ (px)
const STAGE_H = 30;
// 1スパンあたりの描画幅 (px) — 実際のスパン長に比例
const PX_PER_M = 24;
// 左余白（高さラベル用）
const LABEL_W = 42;
// 下余白（スパン寸法ラベル用）
const LABEL_H = 28;
// 上余白（天端ライン用）
const PAD_TOP = 14;
// 右余白
const PAD_R = 10;

// Vec2 を "x,y" キーに変換
const ptKey = (p: Vec2) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

export default function ElevationView({ layout }: Props) {
  const { spanSegments, wallTies, verticalSegments, totalHeight, building } = layout;
  const stageHeight = totalHeight / verticalSegments; // m per stage

  // ──────────────────────────────────────────
  // 1. エッジ別にスパンをグループ化
  // ──────────────────────────────────────────
  const edgeMap = new Map<number, SpanSegment[]>();
  for (const seg of spanSegments) {
    const arr = edgeMap.get(seg.edgeIndex) ?? [];
    arr.push(seg);
    edgeMap.set(seg.edgeIndex, arr);
  }

  // ──────────────────────────────────────────
  // 2. spanFrom → {edgeIdx, spanIdx} マップ
  //    (壁つなぎのスパン位置を特定するため)
  // ──────────────────────────────────────────
  const ptEdgeMap = new Map<string, { edgeIdx: number; spanIdx: number }>();
  for (const seg of spanSegments) {
    ptEdgeMap.set(ptKey(seg.from), { edgeIdx: seg.edgeIndex, spanIdx: seg.spanIndex });
  }

  // ──────────────────────────────────────────
  // 3. 壁つなぎをエッジ別にグループ化
  //    key: edgeIdx  value: {spanIdx, floor}[]
  // ──────────────────────────────────────────
  const edgeTies = new Map<number, { spanIdx: number; floor: number }[]>();
  for (const wt of wallTies) {
    const key = ptKey(wt.scaffold);
    const info = ptEdgeMap.get(key);
    if (!info) continue;
    const arr = edgeTies.get(info.edgeIdx) ?? [];
    arr.push({ spanIdx: info.spanIdx, floor: wt.floor });
    edgeTies.set(info.edgeIdx, arr);
  }

  // ──────────────────────────────────────────
  // 4. 面ラベル（辺の向きから方位を推定）
  // ──────────────────────────────────────────
  const faceLabel = (edgeIdx: number): string => {
    const verts = building.vertices;
    const n = verts.length;
    const from = verts[edgeIdx % n];
    const to = verts[(edgeIdx + 1) % n];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle >= -45 && angle < 45) return `東面（面${edgeIdx + 1}）`;
    if (angle >= 45 && angle < 135) return `南面（面${edgeIdx + 1}）`;
    if (angle >= 135 || angle < -135) return `西面（面${edgeIdx + 1}）`;
    return `北面（面${edgeIdx + 1}）`;
  };

  const edges = Array.from(edgeMap.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {edges.map(([edgeIdx, segs]) => {
        const sortedSegs = [...segs].sort((a, b) => a.spanIndex - b.spanIndex);
        const ties = edgeTies.get(edgeIdx) ?? [];

        // 各スパンの長さ (m)
        const spanLens = sortedSegs.map(s => {
          const dx = s.to.x - s.from.x;
          const dy = s.to.y - s.from.y;
          return Math.sqrt(dx * dx + dy * dy);
        });
        const totalLen = spanLens.reduce((a, b) => a + b, 0);
        const numSpans = sortedSegs.length;

        // 各スパンの X 開始位置（px）
        const spanX: number[] = [];
        let cumX = LABEL_W;
        for (const l of spanLens) {
          spanX.push(cumX);
          cumX += l * PX_PER_M;
        }
        const gridW = totalLen * PX_PER_M;
        const svgW = LABEL_W + gridW + PAD_R;
        const svgH = PAD_TOP + verticalSegments * STAGE_H + LABEL_H;

        return (
          <div key={edgeIdx} className={`elevation-face-${edgeIdx}`}>
            {/* 面ラベル */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5D6D7E', marginBottom: 4 }}>
              {faceLabel(edgeIdx)}
              <span style={{ fontWeight: 400, marginLeft: 8, color: '#95A5A6' }}>
                {totalLen.toFixed(1)}m × {totalHeight.toFixed(1)}m　{numSpans}スパン × {verticalSegments}段
              </span>
            </div>

            <svg
              className={`elevation-svg-${edgeIdx}`}
              viewBox={`0 0 ${svgW} ${svgH}`}
              style={{ maxWidth: '100%', height: 'auto', display: 'block', border: '1px solid #E5E8E8', borderRadius: 4 }}
            >
              {/* ===== セルグリッド ===== */}
              {Array.from({ length: verticalSegments }, (_, fi) => {
                const stageNum = verticalSegments - fi; // 上から1段目が最上段
                const cellY = PAD_TOP + fi * STAGE_H;
                const stageTopH = totalHeight - fi * stageHeight;  // m

                return (
                  <g key={fi}>
                    {sortedSegs.map((_, si) => {
                      const cellX = spanX[si];
                      const cellW = spanLens[si] * PX_PER_M;
                      const hasTie = ties.some(t => t.spanIdx === si && t.floor === stageNum);
                      const isEven = fi % 2 === 0;

                      return (
                        <g key={si}>
                          {/* セル背景 */}
                          <rect
                            x={cellX} y={cellY}
                            width={cellW} height={STAGE_H}
                            fill={isEven ? '#F0F5FF' : '#F8FAFB'}
                            stroke="#C8D6E5" strokeWidth="0.6"
                          />
                          {/* 壁つなぎ × マーク */}
                          {hasTie && (
                            <g>
                              <line
                                x1={cellX + cellW / 2 - 5} y1={cellY + STAGE_H / 2 - 5}
                                x2={cellX + cellW / 2 + 5} y2={cellY + STAGE_H / 2 + 5}
                                stroke="#9B59B6" strokeWidth="1.8"
                              />
                              <line
                                x1={cellX + cellW / 2 + 5} y1={cellY + STAGE_H / 2 - 5}
                                x2={cellX + cellW / 2 - 5} y2={cellY + STAGE_H / 2 + 5}
                                stroke="#9B59B6" strokeWidth="1.8"
                              />
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {/* 高さラベル（各段の上端） */}
                    <text
                      x={LABEL_W - 5} y={cellY + 8}
                      textAnchor="end" fontSize="8" fill="#5D6D7E"
                    >
                      {stageTopH.toFixed(1)}m
                    </text>

                    {/* 段番号（右端） */}
                    <text
                      x={LABEL_W + gridW + PAD_R - 2} y={cellY + STAGE_H / 2 + 4}
                      textAnchor="end" fontSize="7" fill="#95A5A6"
                    >
                      {stageNum}段
                    </text>
                  </g>
                );
              })}

              {/* ===== 天端ライン（橙破線） ===== */}
              <line
                x1={LABEL_W} y1={PAD_TOP}
                x2={LABEL_W + gridW} y2={PAD_TOP}
                stroke="#E67E22" strokeWidth="1.5" strokeDasharray="6,3"
              />
              <text x={LABEL_W + 4} y={PAD_TOP - 3} fontSize="8" fill="#E67E22" fontWeight="700">
                天端 {totalHeight.toFixed(1)}m
              </text>

              {/* ===== GL（地盤面） ===== */}
              <line
                x1={LABEL_W - 8} y1={PAD_TOP + verticalSegments * STAGE_H}
                x2={LABEL_W + gridW + PAD_R} y2={PAD_TOP + verticalSegments * STAGE_H}
                stroke="#1B4F8A" strokeWidth="2"
              />
              <text
                x={LABEL_W - 10} y={PAD_TOP + verticalSegments * STAGE_H + 2}
                textAnchor="end" fontSize="8" fill="#1B4F8A" fontWeight="700"
              >
                GL
              </text>

              {/* ===== スパン寸法（下） ===== */}
              {sortedSegs.map((_, si) => {
                const cx = spanX[si] + (spanLens[si] * PX_PER_M) / 2;
                const y = PAD_TOP + verticalSegments * STAGE_H + 16;
                // 寸法線
                const x1 = spanX[si] + 1;
                const x2 = spanX[si] + spanLens[si] * PX_PER_M - 1;
                const lineY = PAD_TOP + verticalSegments * STAGE_H + 8;
                return (
                  <g key={si}>
                    <line x1={x1} y1={lineY} x2={x2} y2={lineY} stroke="#5D6D7E" strokeWidth="0.6" />
                    <line x1={x1} y1={lineY - 3} x2={x1} y2={lineY + 3} stroke="#5D6D7E" strokeWidth="0.6" />
                    <line x1={x2} y1={lineY - 3} x2={x2} y2={lineY + 3} stroke="#5D6D7E" strokeWidth="0.6" />
                    <text x={cx} y={y} textAnchor="middle" fontSize="8" fill="#5D6D7E">
                      {spanLens[si].toFixed(2)}m
                    </text>
                  </g>
                );
              })}

              {/* ===== 凡例 ===== */}
              <g transform={`translate(${LABEL_W}, ${svgH - 10})`} fontSize="8" fill="#9B59B6">
                <line x1={0} y1={0} x2={6} y2={6} stroke="#9B59B6" strokeWidth="1.2" />
                <line x1={6} y1={0} x2={0} y2={6} stroke="#9B59B6" strokeWidth="1.2" />
                <text x={10} y={6} fill="#5D6D7E">壁つなぎ</text>
              </g>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
