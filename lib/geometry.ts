import { Vec2, BuildingPolygon, ScaffoldLayout, SpanSegment, WallTie } from './types';

/** 規格スパン（m）：1.2 / 1.5 / 1.8 */
const STANDARD_SPANS = [1.2, 1.5, 1.8];

/** 辺の長さリスト → 頂点リスト（直角交互進行） */
export function sidestoVertices(sides: number[]): Vec2[] {
  const verts: Vec2[] = [];
  let x = 0, y = 0, dir = 0;
  verts.push({ x, y });
  for (const s of sides) {
    if (dir === 0) x += s;
    else if (dir === 1) y += s;
    else if (dir === 2) x -= s;
    else y -= s;
    verts.push({ x, y });
    dir = (dir + 1) % 4;
  }
  // 閉じていれば最後の点を除く
  const last = verts[verts.length - 1];
  const first = verts[0];
  if (Math.abs(last.x - first.x) < 0.001 && Math.abs(last.y - first.y) < 0.001) {
    verts.pop();
  }
  return verts;
}

/** ベクター演算 */
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
const len = (v: Vec2) => Math.sqrt(v.x * v.x + v.y * v.y);
const norm = (v: Vec2): Vec2 => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
/** 左向き法線（ポリゴン外側方向） */
const leftNorm = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

/** ポリゴンオフセット（外側に d メートル拡張） */
export function offsetPolygon(verts: Vec2[], d: number): Vec2[] {
  const n = verts.length;
  const result: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n];
    const curr = verts[i];
    const next = verts[(i + 1) % n];

    const e1 = norm(sub(curr, prev));
    const e2 = norm(sub(next, curr));

    // 各辺の外向き法線
    const n1 = leftNorm(e1);
    const n2 = leftNorm(e2);

    // 二等分線方向
    const bisector = norm(add(n1, n2));
    // 二等分線に沿ったオフセット量（ミター）
    const dot = n1.x * bisector.x + n1.y * bisector.y;
    const miter = dot > 0.01 ? d / dot : d;
    const clampedMiter = Math.min(miter, d * 4); // 極端な尖りを制限

    result.push(add(curr, scale(bisector, clampedMiter)));
  }
  return result;
}

/**
 * 辺の長さに対して最適なスパン数を返す（1.2 / 1.5 / 1.8m のベストフィット）
 * → 各スパン候補で等分したときの実スパン長が最も規格値に近い組み合わせを選択
 */
function bestFitSpanCount(edgeLength: number): number {
  let bestN = Math.max(1, Math.round(edgeLength / 1.8));
  let bestPenalty = Infinity;

  for (const s of STANDARD_SPANS) {
    for (const n of [Math.floor(edgeLength / s), Math.ceil(edgeLength / s)]) {
      if (n < 1) continue;
      const actual = edgeLength / n;
      if (actual < 0.8 || actual > 2.1) continue; // 実用外は除外
      const penalty = Math.min(...STANDARD_SPANS.map(std => Math.abs(actual - std)));
      if (penalty < bestPenalty) { bestPenalty = penalty; bestN = n; }
    }
  }
  return bestN;
}

/** 辺のスパン割り点列を返す */
function divideEdge(from: Vec2, to: Vec2, edgeIndex: number): { segments: SpanSegment[]; points: Vec2[] } {
  const d = sub(to, from);
  const l = len(d);
  const n = bestFitSpanCount(l);
  const segments: SpanSegment[] = [];
  const points: Vec2[] = [];

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push(add(from, scale(d, t)));
  }
  for (let i = 0; i < n; i++) {
    segments.push({ from: points[i], to: points[i + 1], edgeIndex, spanIndex: i });
  }
  return { segments, points };
}

/** 足場レイアウトを算出 */
export function buildScaffoldLayout(bp: BuildingPolygon): ScaffoldLayout {
  const { vertices, floors, floorHeight, clearance, meshOpt } = bp;

  // 足場外周ポリゴン
  const offsetPoly = offsetPolygon(vertices, clearance);

  // 全スパン分割
  const allSegments: SpanSegment[] = [];
  const allPoints: Vec2[] = [];
  const n = offsetPoly.length;

  for (let i = 0; i < n; i++) {
    const from = offsetPoly[i];
    const to = offsetPoly[(i + 1) % n];
    const { segments, points } = divideEdge(from, to, i);
    allSegments.push(...segments);
    // 最後の点は次の辺の最初と重複するので除く
    allPoints.push(...points.slice(0, -1));
  }

  // 高さ方向
  const totalHeight = floors * floorHeight + 1.5;
  const vertSegs = Math.ceil(totalHeight / 1.8);

  // 壁つなぎ（水平：スパン2本おき、垂直：2段おき）
  const wallTies: WallTie[] = [];
  const buildingN = vertices.length;

  for (let fi = 0; fi < vertSegs; fi++) {
    if (fi % 2 !== 0) continue; // 2段おき
    allPoints.forEach((sp, pi) => {
      if (pi % 2 !== 0) return; // 2スパンおき
      // 最近傍の建物辺上の点を壁つなぎ先とする
      let minDist = Infinity;
      let wallPt: Vec2 = sp;
      for (let vi = 0; vi < buildingN; vi++) {
        const bv1 = vertices[vi];
        const bv2 = vertices[(vi + 1) % buildingN];
        const pt = nearestPointOnSegment(sp, bv1, bv2);
        const dist = len(sub(sp, pt));
        if (dist < minDist) { minDist = dist; wallPt = pt; }
      }
      wallTies.push({ scaffold: sp, wall: wallPt, floor: fi + 1 });
    });
  }

  // 拾い出し
  const spanCount = allSegments.length;
  const postCount = allPoints.length; // 支柱総数（外周）

  const wallArea = vertices.reduce((sum, v, i) => {
    const next = vertices[(i + 1) % buildingN];
    return sum + len(sub(next, v));
  }, 0) * (floors * floorHeight);

  const scaffoldFaceArea = allSegments.reduce((sum, s) => sum + len(sub(s.to, s.from)), 0) * totalHeight;

  const takeoff = {
    jackPost: postCount,
    midPost: postCount * (vertSegs - 1),
    board: spanCount * vertSegs,
    handrail: spanCount * vertSegs * 2,
    brace: Math.ceil(spanCount * vertSegs * 0.5),
    wallTieCount: wallTies.length,
    jackBase: postCount,
    mesh: meshOpt === 'あり' ? Math.ceil(scaffoldFaceArea * 1.1) : 0,
    anchor: Math.ceil(wallArea / 19.44) * 2,
  };

  return {
    building: bp,
    offsetPolygon: offsetPoly,
    spanSegments: allSegments,
    spanPoints: allPoints,
    wallTies,
    verticalSegments: vertSegs,
    totalHeight,
    takeoff,
  };
}

/** 線分上の最近傍点 */
function nearestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  if (l2 === 0) return a;
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / l2));
  return add(a, scale(ab, t));
}

/** バウンディングボックス */
export function boundingBox(pts: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number } {
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
