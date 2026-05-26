import { CalcResult, PartsMaster, ScaffoldInputs } from './types';

export const DEFAULT_PARTS_MASTER: PartsMaster = {
  '支柱（ジャッキ付）': { unit: '本', unitPrice: 380, weight: 5.2 },
  '支柱（中間1800）':   { unit: '本', unitPrice: 320, weight: 4.5 },
  '布板（踏板600幅）':  { unit: '枚', unitPrice: 280, weight: 8.5 },
  '手すり（横架材）':   { unit: '本', unitPrice: 180, weight: 3.2 },
  '筋交い':             { unit: '本', unitPrice: 220, weight: 3.8 },
  '壁つなぎ':           { unit: '個', unitPrice: 150, weight: 1.5 },
  'ジャッキベース':     { unit: '個', unitPrice: 250, weight: 2.8 },
  'メッシュシート':     { unit: 'm²', unitPrice: 95,  weight: 0.18 },
  'アンカー':           { unit: '本', unitPrice: 80,  weight: 0.3 },
};

export function calculate(inputs: ScaffoldInputs, master: PartsMaster): CalcResult {
  const { sides, floors, floorHeight, clearance, meshOpt, projectName } = inputs;

  const perimeter = sides.reduce((sum, s) => sum + s, 0);
  const scaffoldPerimeter = perimeter + clearance * 2 * sides.length;
  const totalHeight = floors * floorHeight + 1.5;
  const segments = Math.ceil(totalHeight / 1.8);
  const span = 1.8;
  const spanCount = Math.ceil(scaffoldPerimeter / span);

  const wallArea = perimeter * (floors * floorHeight);
  const scaffoldFaceArea = scaffoldPerimeter * totalHeight;

  const quantities: Record<string, number> = {
    '支柱（ジャッキ付）': spanCount + sides.length,
    '支柱（中間1800）':   (spanCount + sides.length) * (segments - 1),
    '布板（踏板600幅）':  spanCount * segments,
    '手すり（横架材）':   spanCount * segments * 2,
    '筋交い':             Math.ceil(spanCount * segments * 0.5),
    '壁つなぎ':           Math.ceil(wallArea / 19.44),
    'ジャッキベース':     spanCount + sides.length,
    'メッシュシート':     meshOpt === 'あり' ? Math.ceil(scaffoldFaceArea * 1.1) : 0,
    'アンカー':           Math.ceil(wallArea / 19.44) * 2,
  };

  let totalAmount = 0;
  let totalWeight = 0;
  const items = [];

  for (const [name, qty] of Object.entries(quantities)) {
    if (qty === 0) continue;
    const m = master[name];
    if (!m) continue;
    const amount = qty * m.unitPrice;
    const weight = qty * m.weight;
    items.push({ name, qty, unit: m.unit, unitPrice: m.unitPrice, amount, weight });
    totalAmount += amount;
    totalWeight += weight;
  }

  return {
    projectName,
    summary: {
      perimeter: perimeter.toFixed(1),
      scaffoldPerimeter: scaffoldPerimeter.toFixed(1),
      totalHeight: totalHeight.toFixed(1),
      segments,
      spanCount,
      scaffoldFaceArea: scaffoldFaceArea.toFixed(1),
      totalAmount,
      totalWeight: totalWeight.toFixed(1),
    },
    items,
    inputs,
  };
}
