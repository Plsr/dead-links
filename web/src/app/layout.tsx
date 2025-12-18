import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dead Links",
  description: "Dead links checker service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
