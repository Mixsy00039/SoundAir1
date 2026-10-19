import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import '../src/index.css';

export const metadata: Metadata = {
  title: 'ระบบติดตามคุณภาพอากาศและเสียง',
  description: 'ระบบติดตามคุณภาพอากาศและเสียงสำหรับพื้นที่อำเภอแม่จัน เชื่อมต่อข้อมูลสดแบบเรียลไทม์'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased font-['IBM_Plex_Sans_Thai',sans-serif]">
        {children}
      </body>
    </html>
  );
}
