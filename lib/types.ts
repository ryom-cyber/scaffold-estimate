export interface PartEntry {
  unit: string;
  unitPrice: number;
  weight: number;
}

export type PartsMaster = Record<string, PartEntry>;

export interface ScaffoldInputs {
  projectName: string;
  buildingType: string;
  scaffoldType: string;
  floors: number;
  floorHeight: number;
  clearance: number;
  meshOpt: string;
  sides: number[];
}

export interface CalcItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  weight: number;
}

export interface CalcSummary {
  perimeter: string;
  scaffoldPerimeter: string;
  totalHeight: string;
  segments: number;
  spanCount: number;
  scaffoldFaceArea: string;
  totalAmount: number;
  totalWeight: string;
}

export interface CalcResult {
  projectName: string;
  summary: CalcSummary;
  items: CalcItem[];
  inputs: ScaffoldInputs;
  savedAt?: string;
}

// ===== 仮設計画図用型 =====

/** 2D頂点 */
export interface Vec2 { x: number; y: number }

/** 建物ポリゴン（実寸m） */
export interface BuildingPolygon {
  vertices: Vec2[];   // 閉じた多角形（最後の点 ≠ 最初の点）
  floors: number;
  floorHeight: number;
  clearance: number;
  meshOpt: string;
  projectName: string;
  buildingType: string;
}

/** スパン区画（足場1スパン） */
export interface SpanSegment {
  from: Vec2;
  to: Vec2;
  edgeIndex: number;   // どの辺のスパンか
  spanIndex: number;   // その辺の何番目か
}

/** 壁つなぎ位置 */
export interface WallTie {
  scaffold: Vec2;  // 足場側
  wall: Vec2;      // 建物壁側
  floor: number;   // 何段目（1始まり）
}

/** 足場レイアウト全体 */
export interface ScaffoldLayout {
  building: BuildingPolygon;
  offsetPolygon: Vec2[];        // 足場外周ポリゴン
  spanSegments: SpanSegment[];  // 各スパン
  spanPoints: Vec2[];           // 支柱位置（スパン境界点）
  wallTies: WallTie[];
  verticalSegments: number;     // 高さ方向段数
  totalHeight: number;
  // 拾い出し数量
  takeoff: {
    jackPost: number;         // 支柱ジャッキ付き
    midPost: number;          // 中間支柱
    board: number;            // 布板
    handrail: number;         // 手すり
    brace: number;            // 筋交い
    wallTieCount: number;     // 壁つなぎ
    jackBase: number;         // ジャッキベース
    mesh: number;             // メッシュシート m²
    anchor: number;           // アンカー
  };
}
