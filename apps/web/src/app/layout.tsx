import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CodeForge AI',
    template: '%s | CodeForge AI',
  },
  description: 'AI-powered online coding judge platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-950 text-gray-50 antialiased">{children}</body>
    </html>
  );
}
