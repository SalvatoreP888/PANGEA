import type { Metadata, Viewport } from 'next';
import { GTProvider } from 'gt-next';
import './globals.css';
export const metadata: Metadata = { title: 'PANGEA — A living world', description: 'An isometric world of autonomous people, growing settlements and connected civilizations.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#171e20' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><GTProvider>{children}</GTProvider></body></html>; }
