'use client';

/**
 * ElevationView — くさび緊結式足場 立面図
 *
 * 描画ルール（実際の仮設計画図に準拠）:
 *  - 支柱（建地）  : 各スパン境界に縦実線
 *  - 布板・手すり  : 各段境界に横実線（上さん＋中桟の2本）
 *  - 筋交い        : 各セルに交互方向の斜め線（/ ＼ 市松模様）
 *  - 壁つなぎ      : 支柱から建物側へ伸びる水平線＋アンカー記号 ⊣
 *  - ジャッキベース: GL上の各支柱に ⊔ 型記号
 *  - 幅木（巾木）  : 各段の布板ラインに沿った小矩形
 *  - GL            : 太い実線
 *  - 天端          : オレンジ破線
 */

import { ScaffoldLayout, Vec2, SpanSegment } from '@/lib/types';

interface Props {
  layout: ScaffoldLayout;
}

// スケール
const PX_M   = 30;   // px / m（水平・垂直共通）
const LBL_W  = 50;   // 左マージン（高さラベル）
const LBL_H  = 36;   // 下マージン（スパン寸法）
const PAD_T  = 24;   // 上マージン（天端ラベル）
const PAD_R  = 38;   // 右マージン（段番号）

// 色
const C_POST   = '#2C3E50';  // 支柱・布板
const C_RAIL   = '#34495E';  // 手すり（中桟）
const C_BRACE  = '#95A5A6';  // 筋交い
const C_TIE    = '#7D3C98';  // 壁つなぎ
const C_JACK   = '#1B4F8A';  // ジャッキベース
const C_GL     = '#1B4F8A';  // 地盤線
const C_TOP    = '#E67E22';  // 天端

const ptKey = (p: Vec2) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

export default function ElevationView({ layout }: Props) {
  const { spanSegments, wallTies, verticalSegments, totalHeight, building } = layout;
  const stageH_m = totalHeight / verticalSegments; // m/段

  // ── エッジ別スパンをグループ化 ──
  const edgeMap = new Map<number, SpanSegment[]>();
  for (const seg of spanSegments) {
    const arr = edgeMap.get(seg.edgeIndex) ?? [];
    arr.push(seg);
    edgeMap.set(seg.edgeIndex, arr);
  }

  // ── spanFrom → {edgeIdx, spanIdx} ──
  const ptEdgeMap = new Map<string, { edgeIdx: number; spanIdx: number }>();
  for (const seg of spanSegments) {
    ptEdgeMap.set(ptKey(seg.from), { edgeIdx: seg.edgeIndex, spanIdx: seg.spanIndex });
  }

  // ── 壁つなぎをエッジ別に整理 ──
  const edgeTies = new Map<number, { spanIdx: number; floor: number }[]>();
  for (const wt of wallTies) {
    const info = ptEdgeMap.get(ptKey(wt.scaffold));
    if (!info) continue;
    const arr = edgeTies.get(info.edgeIdx) ?? [];
    arr.push({ spanIdx: info.spanIdx, floor: wt.floor });
    edgeTies.set(info.edgeIdx, arr);
  }

  // ── 面ラベル ──
  const faceLabel = (edgeIdx: number) => {
    const verts = building.vertices;
    const n = verts.length;
    const a = verts[edgeIdx % n];
    const b = verts[(edgeIdx + 1) % n];
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    if (angle >= -45 && angle < 45)   return `東面（面${edgeIdx + 1}）`;
    if (angle >= 45  && angle < 135)  return `南面（面${edgeIdx + 1}）`;
    if (angle >= 135 || angle < -135) return `西面（面${edgeIdx + 1}）`;
    return `北面（面${edgeIdx + 1}）`;
  };

  const edges = Array.from(edgeMap.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {edges.map(([edgeIdx, segs]) => {
        const sorted   = [...segs].sort((a, b) => a.spanIndex - b.spanIndex);
        const ties     = edgeTies.get(edgeIdx) ?? [];
        const spanLens = sorted.map(s => {
          const dx = s.to.x - s.from.x, dy = s.to.y - s.from.y;
          return Math.sqrt(dx * dx + dy * dy);
        });
        const totalLen = spanLens.reduce((a, b) => a + b, 0);

        // 各スパン左端 X（px）
        const spanXs: number[] = [];
        let cx = LBL_W;
        for (const l of spanLens) { spanXs.push(cx); cx += l * PX_M; }
        const gridW  = totalLen * PX_M;
        const gridH  = verticalSegments * stageH_m * PX_M;
        const svgW   = LBL_W + gridW + PAD_R;
        const svgH   = PAD_T + gridH + LBL_H;

        // Y座標変換（下が段1、上が最上段）
        const stageY  = (stageFromBottom: number) =>
          PAD_T + (verticalSegments - stageFromBottom) * stageH_m * PX_M;
        const glY     = PAD_T + gridH;     // GL
        const topY    = PAD_T;             // 天端

        // 壁つなぎセット
        const tieSet  = new Set(ties.map(t => `${t.spanIdx}:${t.floor}`));

        // ── 支柱X位置（左端 + 各スパン右端）
        const postXs: number[] = [LBL_W];
        let accX = LBL_W;
        for (const l of spanLens) { accX += l * PX_M; postXs.push(accX); }

        return (
          <div key={edgeIdx} className={`elevation-face-${edgeIdx}`}>
            {/* 面ラベル */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5D6D7E', marginBottom: 4 }}>
              {faceLabel(edgeIdx)}
              <span style={{ fontWeight: 400, marginLeft: 8, color: '#95A5A6' }}>
                {totalLen.toFixed(1)}m × {totalHeight.toFixed(1)}m
                {sorted.length}スパン × {verticalSegments}段
              </span>
            </div>

            <svg
              className={`elevation-svg-${edgeIdx}`}
              viewBox={`0 0 ${svgW} ${svgH}`}
              style={{ maxWidth: '100%', height: 'auto', display: 'block',
                       border: '1px solid #ddd', borderRadius: 4, background: '#FAFBFC' }}
            >
              {/* ══════════════════════════════════════
                  1. セル背景 + 筋交い
                  ══════════════════════════════════════ */}
              {Array.from({ length: verticalSegments }, (_, fi) => {
                const stageNum = fi + 1; // 下から1段目
                const cellY0   = stageY(stageNum);
                const cellH    = stageH_m * PX_M;

                return sorted.map((_, si) => {
                  const cellX0 = spanXs[si];
                  const cellW  = spanLens[si] * PX_M;

                  // 筋交い方向：市松模様
                  const slash = (si + fi) % 2 === 0; // true=/, false=\

                  return (
                    <g key={`${fi}-${si}`}>
                      {/* セル背景 */}
                      <rect x={cellX0} y={cellY0} width={cellW} height={cellH}
                        fill={fi % 2 === 0 ? '#EBF4FF' : '#F2F6FA'} />

                      {/* 筋交い（斜め線） */}
                      <line
                        x1={slash ? cellX0 + 2 : cellX0 + cellW - 2}
                        y1={cellY0 + cellH - 2}
                        x2={slash ? cellX0 + cellW - 2 : cellX0 + 2}
                        y2={cellY0 + 2}
                        stroke={C_BRACE} strokeWidth="0.9" opacity="0.75"
                      />
                    </g>
                  );
                });
              })}

              {/* ══════════════════════════════════════
                  2. 布板ライン（各段境界の横実線）
                     上さん（太）＋中桟（細）
                  ══════════════════════════════════════ */}
              {Array.from({ length: verticalSegments + 1 }, (_, k) => {
                const y = k === 0 ? glY : stageY(k);
                // 布板ライン（太め）
                return (
                  <g key={`board-${k}`}>
                    <line x1={LBL_W} y1={y} x2={LBL_W + gridW} y2={y}
                      stroke={C_POST} strokeWidth={k === 0 ? 0.5 : 1.5} />
                    {/* 中桟（布板ラインの1/3上に細線） */}
                    {k > 0 && (
                      <line
                        x1={LBL_W} y1={y + stageH_m * PX_M * 0.35}
                        x2={LBL_W + gridW} y2={y + stageH_m * PX_M * 0.35}
                        stroke={C_RAIL} strokeWidth="0.7" strokeDasharray="3,2"
                      />
                    )}
                  </g>
                );
              })}

              {/* ══════════════════════════════════════
                  3. 支柱ライン（各スパン境界の縦実線）
                  ══════════════════════════════════════ */}
              {postXs.map((px, i) => (
                <line key={`post-${i}`}
                  x1={px} y1={topY} x2={px} y2={glY}
                  stroke={C_POST} strokeWidth="1.8"
                />
              ))}

              {/* ══════════════════════════════════════
                  4. ジャッキベース（GL上の各支柱）
                  ══════════════════════════════════════ */}
              {postXs.map((px, i) => {
                const jw = 8, jh = 7;
                return (
                  <g key={`jack-${i}`}>
                    {/* ⊔ 型：上線 + 左脚 + 右脚 */}
                    <line x1={px - jw} y1={glY} x2={px + jw} y2={glY}
                      stroke={C_JACK} strokeWidth="2" />
                    <line x1={px - jw} y1={glY} x2={px - jw} y2={glY + jh}
                      stroke={C_JACK} strokeWidth="2" />
                    <line x1={px + jw} y1={glY} x2={px + jw} y2={glY + jh}
                      stroke={C_JACK} strokeWidth="2" />
                    <line x1={px - jw} y1={glY + jh} x2={px + jw} y2={glY + jh}
                      stroke={C_JACK} strokeWidth="1.5" />
                  </g>
                );
              })}

              {/* ══════════════════════════════════════
                  5. 壁つなぎ
                     支柱位置から建物方向（右→）に伸びる線
                     先端にアンカー記号 ⊣
                  ══════════════════════════════════════ */}
              {ties.map((t, i) => {
                const px   = postXs[t.spanIdx] ?? LBL_W;
                const ty_  = stageY(t.floor) + stageH_m * PX_M * 0.5;
                const len  = 14;
                const dir  = t.spanIdx < sorted.length / 2 ? 1 : -1; // 内側方向
                return (
                  <g key={`tie-${i}`}>
                    {/* 水平線 */}
                    <line x1={px} y1={ty_} x2={px + dir * len} y2={ty_}
                      stroke={C_TIE} strokeWidth="1.4" />
                    {/* アンカー記号（縦バー） */}
                    <line x1={px + dir * len} y1={ty_ - 5}
                          x2={px + dir * len} y2={ty_ + 5}
                      stroke={C_TIE} strokeWidth="2" />
                    {/* 支柱側の丸 */}
                    <circle cx={px} cy={ty_} r="2.5"
                      fill={C_TIE} />
                  </g>
                );
              })}

              {/* ══════════════════════════════════════
                  6. 天端ライン
                  ══════════════════════════════════════ */}
              <line x1={LBL_W} y1={topY} x2={LBL_W + gridW} y2={topY}
                stroke={C_TOP} strokeWidth="2" strokeDasharray="8,4" />
              <text x={LBL_W + 4} y={topY - 5} fontSize="9" fill={C_TOP} fontWeight="700">
                天端 {totalHeight.toFixed(1)}m
              </text>

              {/* ══════════════════════════════════════
                  7. GL ライン
                  ══════════════════════════════════════ */}
              <line x1={LBL_W - 12} y1={glY} x2={LBL_W + gridW + 4} y2={glY}
                stroke={C_GL} strokeWidth="2.5" />
              <text x={LBL_W - 14} y={glY + 4} textAnchor="end"
                fontSize="9" fill={C_GL} fontWeight="700">GL</text>

              {/* ══════════════════════════════════════
                  8. 高さラベル（左端・各段上端）
                  ══════════════════════════════════════ */}
              {Array.from({ length: verticalSegments + 1 }, (_, k) => {
                const y   = k === 0 ? glY : stageY(k);
                const hm  = (k * stageH_m).toFixed(1);
                return (
                  <text key={`hl-${k}`} x={LBL_W - 5} y={y + 4}
                    textAnchor="end" fontSize="8" fill="#5D6D7E">
                    {hm}m
                  </text>
                );
              })}

              {/* ══════════════════════════════════════
                  9. 段番号（右端）
                  ══════════════════════════════════════ */}
              {Array.from({ length: verticalSegments }, (_, fi) => {
                const stageNum = fi + 1;
                const cy = stageY(stageNum) + (stageH_m * PX_M) / 2;
                return (
                  <text key={`sn-${fi}`} x={LBL_W + gridW + 4} y={cy + 4}
                    fontSize="8" fill="#95A5A6">
                    {stageNum}段
                  </text>
                );
              })}

              {/* ══════════════════════════════════════
                  10. スパン寸法（下端）
                  ══════════════════════════════════════ */}
              {sorted.map((_, si) => {
                const x0   = spanXs[si];
                const sw   = spanLens[si] * PX_M;
                const cx2  = x0 + sw / 2;
                const dimY = glY + LBL_H * 0.55;
                const barY = glY + LBL_H * 0.28;
                return (
                  <g key={`dim-${si}`}>
                    <line x1={x0 + 1} y1={barY} x2={x0 + sw - 1} y2={barY}
                      stroke="#7F8C8D" strokeWidth="0.6" />
                    <line x1={x0 + 1} y1={barY - 3} x2={x0 + 1} y2={barY + 3}
                      stroke="#7F8C8D" strokeWidth="0.6" />
                    <line x1={x0 + sw - 1} y1={barY - 3} x2={x0 + sw - 1} y2={barY + 3}
                      stroke="#7F8C8D" strokeWidth="0.6" />
                    <text x={cx2} y={dimY} textAnchor="middle" fontSize="8" fill="#5D6D7E">
                      {spanLens[si].toFixed(2)}m
                    </text>
                  </g>
                );
              })}

              {/* ══════════════════════════════════════
                  11. 凡例
                  ══════════════════════════════════════ */}
              <g transform={`translate(${LBL_W}, ${svgH - 10})`} fontSize="8">
                <line x1={0} y1={-2} x2={10} y2={-2} stroke={C_POST} strokeWidth="1.5" />
                <text x={13} y={1} fill="#5D6D7E">布板・手すり</text>
                <line x1={50} y1={-5} x2={50} y2={3} stroke={C_POST} strokeWidth="1.8" />
                <text x={54} y={1} fill="#5D6D7E">支柱</text>
                <line x1={75} y1={2} x2={85} y2={-6} stroke={C_BRACE} strokeWidth="0.9" />
                <text x={88} y={1} fill="#5D6D7E">筋交い</text>
                <circle cx={115} cy={-2} r="2.5" fill={C_TIE} />
                <line x1={115} y1={-2} x2={122} y2={-2} stroke={C_TIE} strokeWidth="1.4" />
                <line x1={122} y1={-5} x2={122} y2={1} stroke={C_TIE} strokeWidth="2" />
                <text x={126} y={1} fill="#5D6D7E">壁つなぎ</text>
              </g>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
