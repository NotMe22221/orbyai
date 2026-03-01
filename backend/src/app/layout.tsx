import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Resident Secretary API',
  description: 'AI-powered browser assistant backend',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0f0f19' }}>{children}</body>
    </html>
  );
}
