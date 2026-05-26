import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません。' }, { status: 500 });
  }

  try {
    const { imageBase64, mimeType } = await req.json() as { imageBase64: string; mimeType: string };

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `あなたは建築図面（平面図・立面図）を解析する専門家です。
この建築図面から足場計画に必要な情報を抽出してください。

以下のJSON形式で回答してください。値が読み取れない場合はnullを返してください。

{
  "floors": <階数（整数）>,
  "floorHeight": <標準階高（m、小数可）>,
  "buildingType": <建物用途: "集合住宅" | "学校" | "戸建住宅" | "その他">,
  "sides": [<辺1の長さm>, <辺2の長さm>, ...],
  "notes": "<図面から読み取ったその他の注意事項（開口部の大きさ、障害物など）>"
}

重要:
- sidesは建物外周を構成する辺の長さのリスト（m単位）。矩形なら4辺、L字形なら6辺など
- 寸法が図面に記載されていれば優先して読み取る
- 記載がない場合は図面のスケールから推定する
- JSON以外のテキストは一切含めないこと`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType as string, data: imageBase64 } },
          ],
        },
      ],
    });

    const text = (result.text ?? '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: '図面から情報を抽出できませんでした。' }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
