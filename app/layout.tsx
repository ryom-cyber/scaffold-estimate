import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: '足場かんたん見積もり',
  description: 'くさび緊結式足場の数量と概算金額を5分で算出',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px 60px' }}>
          <header style={{
            background: 'linear-gradient(135deg, #1B4F8A, #2E86C1)',
            color: 'white',
            padding: '28px 32px',
            borderRadius: 12,
            marginBottom: 24,
            boxShadow: '0 4px 12px rgba(27,79,138,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div>
              <h1 style={{ fontSize: 26, marginBottom: 6, fontWeight: 700 }}>
                🏗️ 足場かんたん見積もり
                <span style={{
                  display: 'inline-block', padding: '3px 8px', background: '#E67E22',
                  fontSize: 11, borderRadius: 4, marginLeft: 8, verticalAlign: 'middle',
                }}>MVP</span>
              </h1>
              <p style={{ fontSize: 14, opacity: 0.9 }}>くさび緊結式足場の数量と概算金額を5分で算出</p>
            </div>
            <nav style={{ display: 'flex', gap: 8 }}>
              <Link href="/" style={{
                padding: '8px 16px', background: 'rgba(255,255,255,0.15)',
                borderRadius: 8, color: 'white', textDecoration: 'none',
                fontSize: 14, fontWeight: 600,
              }}>📊 見積もり</Link>
              <Link href="/master" style={{
                padding: '8px 16px', background: 'rgba(255,255,255,0.15)',
                borderRadius: 8, color: 'white', textDecoration: 'none',
                fontSize: 14, fontWeight: 600,
              }}>⚙️ 単価マスタ</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
