import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'];

const PROMPT = `あなたは建築図面（平面図）を解析する専門家です。
この図面から足場仮設計画に必要な情報を正確に抽出してください。

以下のJSON形式のみで回答してください。JSON以外のテキストは一切含めないこと。

{
  "floors": <階数（整数）>,
  "floorHeight": <標準階高（m）>,
  "buildingType": <"集合住宅" | "学校" | "戸建住宅" | "その他">,
  "sides": [<辺1m>, <辺2m>, <辺3m>, ...],
  "scale": <図面縮尺（例: 100 なら 1/100）>,
  "notes": "<読み取った注意事項、障害物、開口部など>"
}

抽出ルール:
- sides は建物外周を時計回りに辿った辺の長さリスト（m単位）
- 矩形なら4辺、L字なら6辺、コの字なら8辺
- 寸法線の数値を最優先で読む。なければ縮尺から計算する
- 縮尺が不明なら図面内の人や車などから推定する
- 階高の記載がなければ一般的な値（集合住宅2.8m、戸建2.5m）を仮定する`;

async function tryGenerate(ai: GoogleGenAI, model: string, imageBase64: string, mimeType: string) {
  const result = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        { text: PROMPT },
        { inlineData: { mimeType: mimeType as string, data: imageBase64 } },
      ],
    }],
  });
  return (result.text ?? '').trim();
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません。' }, { status: 500 });
  }

  try {
    const { imageBase64, mimeType } = await req.json() as { imageBase64: string; mimeType: string };
    const ai = new GoogleGenAI({ apiKey });

    let text = '';
    let lastError = '';
    let usedModel = '';

    for (const model of MODELS) {
      try {
        text = await tryGenerate(ai, model, imageBase64, mimeType);
        usedModel = model;
        break;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = msg;
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('404') || msg.includes('not found')) continue;
        throw e;
      }
    }

    if (!text) return NextResponse.json({ error: `全モデルで失敗: ${lastError}` }, { status: 503 });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: '図面から情報を抽出できませんでした。' }, { status: 422 });

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ...parsed, _model: usedModel });

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
