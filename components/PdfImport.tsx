'use client';

import { useRef, useState } from 'react';
import { ScaffoldInputs } from '@/lib/types';

interface ExtractedData {
  floors?: number | null;
  floorHeight?: number | null;
  buildingType?: string | null;
  sides?: number[] | null;
  notes?: string | null;
}

interface Props {
  onApply: (data: Partial<ScaffoldInputs>) => void;
}

export default function PdfImport({ onApply }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const process = async (file: File) => {
    if (!file) return;
    setStatus('loading');
    setExtracted(null);
    setErrorMsg('');

    try {
      // PDFをCanvasに描画 → base64画像に変換
      const arrayBuffer = await file.arrayBuffer();

      // pdfjs を動的インポート
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1); // 1ページ目（平面図）

      const scale = 2.0;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx as Parameters<typeof page.render>[0]['canvasContext'], viewport, canvas }).promise;

      const dataUrl = canvas.toDataURL('image/png');
      setPreviewUrl(dataUrl);
      const base64 = dataUrl.split(',')[1];

      // Gemini APIへ送信
      const res = await fetch('/api/analyze-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: 'image/png' }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '解析失敗');

      setExtracted(json);
      setStatus('done');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) process(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type === 'application/pdf') process(file);
    else alert('PDFファイルをドロップしてください');
  };

  const handleApply = () => {
    if (!extracted) return;
    const data: Partial<ScaffoldInputs> = {};
    if (extracted.floors) data.floors = extracted.floors;
    if (extracted.floorHeight) data.floorHeight = extracted.floorHeight;
    if (extracted.buildingType) data.buildingType = extracted.buildingType;
    if (extracted.sides?.length) data.sides = extracted.sides;
    onApply(data);
    setStatus('idle');
    setExtracted(null);
    setPreviewUrl('');
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {/* ドロップゾーン */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? '#2E86C1' : '#B2BEC3'}`,
          borderRadius: 8,
          padding: '14px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? '#E6F1FB' : '#F8FAFB',
          transition: 'all 0.2s',
          marginBottom: 8,
        }}
      >
        {status === 'loading' ? (
          <span style={{ fontSize: 13, color: '#5D6D7E' }}>
            🔍 Geminiで図面を解析中...
          </span>
        ) : (
          <span style={{ fontSize: 13, color: '#5D6D7E' }}>
            📄 図面PDFをここにドロップ または クリックして選択
          </span>
        )}
        <input ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* エラー */}
      {status === 'error' && (
        <div style={{ background: '#FADBD8', border: '1px solid #F1948A', borderRadius: 6, padding: '10px 12px', fontSize: 13, color: '#922B21', marginBottom: 8 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* 解析結果 */}
      {status === 'done' && extracted && (
        <div style={{ background: '#E8F8F5', border: '1px solid #A9DFBF', borderRadius: 8, padding: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1E8449', marginBottom: 10 }}>
            ✅ 図面解析完了
          </p>

          {/* プレビュー画像 */}
          {previewUrl && (
            <img src={previewUrl} alt="図面プレビュー" style={{ width: '100%', borderRadius: 4, marginBottom: 10, border: '1px solid #A9DFBF' }} />
          )}

          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 10 }}>
            <tbody>
              {extracted.floors && <tr><td style={{ color: '#5D6D7E', padding: '3px 0' }}>階数</td><td style={{ fontWeight: 700 }}>{extracted.floors}階</td></tr>}
              {extracted.floorHeight && <tr><td style={{ color: '#5D6D7E', padding: '3px 0' }}>階高</td><td style={{ fontWeight: 700 }}>{extracted.floorHeight}m</td></tr>}
              {extracted.buildingType && <tr><td style={{ color: '#5D6D7E', padding: '3px 0' }}>用途</td><td style={{ fontWeight: 700 }}>{extracted.buildingType}</td></tr>}
              {extracted.sides?.length && (
                <tr>
                  <td style={{ color: '#5D6D7E', padding: '3px 0', verticalAlign: 'top' }}>外周辺</td>
                  <td style={{ fontWeight: 700 }}>{extracted.sides.join('m, ')}m</td>
                </tr>
              )}
              {extracted.notes && (
                <tr>
                  <td style={{ color: '#5D6D7E', padding: '3px 0', verticalAlign: 'top' }}>備考</td>
                  <td style={{ fontSize: 11, color: '#5D6D7E' }}>{extracted.notes}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleApply}>
              ← フォームに反映する
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setStatus('idle'); setExtracted(null); setPreviewUrl(''); }}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
