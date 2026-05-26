import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'];

const PROMPT = `あなたは建築図面（平面図・立面図・断面図）を解析して足場仮設計画に必要な情報を抽出する専門家です。

【重要な読み取りルール】

▼ floors（建物の総階数 ※最も間違えやすい）
- 「地上○階」「○階建」「○F建」という建物概要欄・凡例・タイトルブロックの記述を最優先で読む
- 立面図・断面図にFL（フロアライン）が何本あるか数える
- ❌NG: 「○階平面図」のタイトルは"その図面が何階の平面図か"であり、建物の総階数ではない
- ❌NG: 1枚の平面図しかないからといって1階建と判断しない
- 総階数が読み取れない場合は 0 を返す

▼ sides（建物外周の各辺長さ・m単位・時計回り）
- 1階平面図または基準階平面図の寸法線を読む
- 寸法単位がmmの場合は÷1000してm単位に変換
- 矩形なら4辺、L字なら6辺、コの字なら8辺
- 読み取れない場合は空配列 [] を返す

▼ floorHeight（標準階高・m単位）
- 断面図・矩計図のFL間隔を読む
- 記載がなければ：集合住宅・学校→2.8、戸建→2.5、不明→0

▼ confidence（各値の確信度 0.0〜1.0）
- 数値が明確に読めた → 0.85以上
- 計算・推測した → 0.5〜0.84
- 仮定値・不明 → 0.5未満

以下のJSONのみで回答。JSON以外のテキストは一切含めないこと。

{
  "floors": <整数 or 0>,
  "floorHeight": <小数 or 0>,
  "buildingType": <"集合住宅" | "学校" | "戸建住宅" | "その他">,
  "sides": [<m>, ...],
  "confidence": {
    "floors": <0.0-1.0>,
    "floorHeight": <0.0-1.0>,
    "sides": <0.0-1.0>
  },
  "notes": "<図面の種別・縮尺・特記事項>"
}`;

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
