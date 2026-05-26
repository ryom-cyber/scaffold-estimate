import { ScaffoldLayout, Vec2 } from './types';

const sub = (a: Vec2, b: Vec2) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: { x: number; y: number }) => Math.sqrt(v.x * v.x + v.y * v.y);

/** DXF文字列を生成 */
export function generateDXF(layout: ScaffoldLayout): string {
  const { building, offsetPolygon, spanPoints, wallTies, spanSegments } = layout;
  const { vertices, projectName, floors, floorHeight, clearance } = building;

  const lines: string[] = [];

  // ===== HEADER =====
  lines.push('0\nSECTION\n2\nHEADER');
  lines.push('9\n$ACADVER\n1\nAC1015');
  lines.push('9\n$INSUNITS\n70\n4'); // 4=mm → 実寸はm単位で描くので後でスケール
  lines.push('0\nENDSEC');

  // ===== TABLES (レイヤー定義) =====
  lines.push('0\nSECTION\n2\nTABLES');
  lines.push('0\nTABLE\n2\nLTYPE\n70\n1');
  lines.push('0\nLTYPE\n2\nDASHED\n70\n0\n3\n__  __  __\n72\n65\n73\n4\n40\n2.0\n49\n0.5\n49\n-0.25\n49\n0.5\n49\n-0.25');
  lines.push('0\nENDTAB');

  lines.push('0\nTABLE\n2\nLAYER\n70\n6');
  const layerDefs = [
    ['建物外形', '5'],    // blue
    ['足場外周', '1'],    // red
    ['支柱',     '3'],    // green
    ['壁つなぎ', '6'],    // magenta
    ['寸法',     '7'],    // white
    ['タイトル', '7'],
  ];
  for (const [name, color] of layerDefs) {
    lines.push(`0\nLAYER\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS`);
  }
  lines.push('0\nENDTAB');
  lines.push('0\nENDSEC');

  // ===== ENTITIES =====
  lines.push('0\nSECTION\n2\nENTITIES');

  // 建物外形
  const bvn = vertices.length;
  for (let i = 0; i < bvn; i++) {
    const from = vertices[i];
    const to = vertices[(i + 1) % bvn];
    lines.push(line(from, to, '建物外形'));
  }

  // 足場外周（破線）
  const on = offsetPolygon.length;
  for (let i = 0; i < on; i++) {
    const from = offsetPolygon[i];
    const to = offsetPolygon[(i + 1) % on];
    lines.push(dashedLine(from, to, '足場外周'));
  }

  // スパン割り（スパン境界の垂直線を小さく表示）
  for (const pt of spanPoints) {
    lines.push(circle(pt, 0.05, '支柱'));
  }

  // 壁つなぎ
  for (const wt of wallTies) {
    lines.push(line(wt.scaffold, wt.wall, '壁つなぎ'));
  }

  // 寸法（各辺）
  for (let i = 0; i < bvn; i++) {
    const from = vertices[i];
    const to = vertices[(i + 1) % bvn];
    const l = len(sub(to, from));
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    lines.push(text(`${l.toFixed(1)}m`, { x: mx, y: my + 0.3 }, 0.4, '寸法'));
  }

  // タイトルブロック（左下）
  const bb = boundingBox([...vertices, ...offsetPolygon]);
  const tx = bb.minX;
  const ty = bb.minY - 3;
  lines.push(text(projectName || '無題物件', { x: tx, y: ty }, 0.6, 'タイトル'));
  lines.push(text(`${floors}階建　階高${floorHeight}m　離隔${clearance}m`, { x: tx, y: ty - 0.8 }, 0.4, 'タイトル'));
  lines.push(text(`作成日: ${new Date().toLocaleDateString('ja-JP')}`, { x: tx, y: ty - 1.4 }, 0.35, 'タイトル'));
  lines.push(text(`スパン数: ${spanSegments.length}　高さ: ${layout.totalHeight.toFixed(1)}m`, { x: tx, y: ty - 1.9 }, 0.35, 'タイトル'));

  lines.push('0\nENDSEC');
  lines.push('0\nEOF');

  return lines.join('\n');
}

function line(from: Vec2, to: Vec2, layer: string): string {
  return `0\nLINE\n8\n${layer}\n10\n${from.x.toFixed(4)}\n20\n${from.y.toFixed(4)}\n30\n0\n11\n${to.x.toFixed(4)}\n21\n${to.y.toFixed(4)}\n31\n0`;
}

function dashedLine(from: Vec2, to: Vec2, layer: string): string {
  return `0\nLINE\n8\n${layer}\n6\nDASHED\n10\n${from.x.toFixed(4)}\n20\n${from.y.toFixed(4)}\n30\n0\n11\n${to.x.toFixed(4)}\n21\n${to.y.toFixed(4)}\n31\n0`;
}

function circle(center: Vec2, r: number, layer: string): string {
  return `0\nCIRCLE\n8\n${layer}\n10\n${center.x.toFixed(4)}\n20\n${center.y.toFixed(4)}\n30\n0\n40\n${r.toFixed(4)}`;
}

function text(content: string, pos: Vec2, height: number, layer: string): string {
  return `0\nTEXT\n8\n${layer}\n10\n${pos.x.toFixed(4)}\n20\n${pos.y.toFixed(4)}\n30\n0\n40\n${height}\n1\n${content}`;
}

function boundingBox(pts: Vec2[]) {
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
