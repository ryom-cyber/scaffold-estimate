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
