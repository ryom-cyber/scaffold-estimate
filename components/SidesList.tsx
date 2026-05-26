'use client';

interface Props {
  sides: number[];
  onChange: (sides: number[]) => void;
}

export default function SidesList({ sides, onChange }: Props) {
  const update = (i: number, val: string) => {
    const next = [...sides];
    next[i] = parseFloat(val) || 0;
    onChange(next);
  };
  const add = () => onChange([...sides, 5]);
  const remove = (i: number) => {
    if (sides.length <= 3) { alert('最低3辺は必要です'); return; }
    const next = [...sides];
    next.splice(i, 1);
    onChange(next);
  };

  return (
    <div>
      <div style={{ background: '#F8FAFB', border: '1px solid #E5E8E8', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        {sides.map((len, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 40px', gap: 8, alignItems: 'center', marginBottom: i < sides.length - 1 ? 8 : 0 }}>
            <label style={{ fontSize: 13, color: '#5D6D7E' }}>辺{i + 1}</label>
            <input
              className="form-input"
              type="number" min="0.1" step="0.1"
              value={len}
              onChange={e => update(i, e.target.value)}
              style={{ padding: '8px 10px', fontSize: 14 }}
            />
            <button className="btn-danger" onClick={() => remove(i)} title="削除">×</button>
          </div>
        ))}
      </div>
      <button className="btn btn-secondary btn-sm" onClick={add}>＋ 辺を追加</button>
      <p style={{ fontSize: 12, color: '#7F8C8D', marginTop: 8 }}>
        矩形なら4辺、L字なら6辺といったように追加してください
      </p>
    </div>
  );
}
