'use client';

import { useState, useEffect } from 'react';
import { getMaster, saveMaster, resetMaster } from '@/lib/storage';
import { PartsMaster } from '@/lib/types';
import { DEFAULT_PARTS_MASTER } from '@/lib/scaffold';

export default function MasterPage() {
  const [master, setMaster] = useState<PartsMaster>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMaster(getMaster());
  }, []);

  const update = (name: string, field: 'unit' | 'unitPrice' | 'weight', val: string) => {
    setMaster(prev => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: field === 'unit' ? val : (parseFloat(val) || 0),
      },
    }));
    setSaved(false);
  };

  const handleSave = () => {
    saveMaster(master);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (!confirm('デフォルト単価に戻しますか？')) return;
    resetMaster();
    setMaster({ ...DEFAULT_PARTS_MASTER });
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 12,
    fontWeight: 600, background: '#1B4F8A', color: 'white',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 12px', borderBottom: '1px solid #E5E8E8', fontSize: 13,
  };

  return (
    <div className="card" style={{ maxWidth: 800 }}>
      <h2 className="card-title">⚙️ 単価マスタ編集</h2>

      <p style={{ fontSize: 13, color: '#5D6D7E', marginBottom: 18 }}>
        各部材の単価・重量を編集できます。変更は「保存」ボタンを押すまで反映されません。
        保存後、見積もりページで再計算すると新しい単価が適用されます。
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>部材名</th>
              <th style={{ ...thStyle, width: 80 }}>単位</th>
              <th style={{ ...thStyle, width: 110, textAlign: 'right' }}>単価（円）</th>
              <th style={{ ...thStyle, width: 110, textAlign: 'right' }}>重量（kg）</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(master).map(([name, entry]) => (
              <tr key={name} style={{ background: 'white' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFB')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#1B4F8A' }}>{name}</td>
                <td style={tdStyle}>
                  <input
                    className="form-input"
                    style={{ padding: '6px 8px', fontSize: 13 }}
                    value={entry.unit}
                    onChange={e => update(name, 'unit', e.target.value)}
                  />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input
                    className="form-input"
                    style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                    type="number" min={0} step={1}
                    value={entry.unitPrice}
                    onChange={e => update(name, 'unitPrice', e.target.value)}
                  />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input
                    className="form-input"
                    style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                    type="number" min={0} step={0.01}
                    value={entry.weight}
                    onChange={e => update(name, 'weight', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? '✓ 保存しました' : '💾 保存する'}
        </button>
        <button className="btn btn-secondary" onClick={handleReset}>
          リセット（デフォルトに戻す）
        </button>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: '#FFF9F0', border: '1px solid #FAD7A0', borderRadius: 8 }}>
        <p style={{ fontSize: 12, color: '#784212' }}>
          ⚠️ 単価変更後は見積もりページで「計算する」を再実行してください。
          保存済み案件を「読込」した場合も再計算が必要です。
        </p>
      </div>
    </div>
  );
}
