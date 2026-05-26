'use client';

import { CalcResult } from '@/lib/types';

interface Props {
  projects: CalcResult[];
  onLoad: (project: CalcResult) => void;
}

export default function SavedList({ projects, onLoad }: Props) {
  if (projects.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 8, fontWeight: 600 }}>
        💾 保存済み案件（最新{projects.length}件）
      </p>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {projects.map((p, i) => (
          <div key={i} className="saved-item">
            <div>
              <div style={{ fontWeight: 600, color: '#1B4F8A' }}>{p.projectName}</div>
              <div style={{ color: '#7F8C8D', fontSize: 11 }}>
                ¥{p.summary.totalAmount.toLocaleString()}
                {p.savedAt ? new Date(p.savedAt).toLocaleString('ja-JP') : ''}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onLoad(p)}>読込</button>
          </div>
        ))}
      </div>
    </div>
  );
}
