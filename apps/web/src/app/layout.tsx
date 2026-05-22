import type { Metadata } from 'next';

import { Toaster } from 'sonner';

import { AuthProvider } from '@/contexts/AuthContext';

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
      <body className="bg-gray-950 text-gray-50 antialiased">
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
