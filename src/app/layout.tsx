import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "F3 Estimation Tool",
  description: "Folio3's internal tool for estimating software project features.",
  robots: { index: false, follow: false },
};

// Root layout: fonts and colors only. The signed-in shell lives in (app)/layout.tsx;
// public pages (sign-in, not found) use <PublicHeader />.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
