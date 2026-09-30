import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import RegistroServiceWorker from "@/components/RegistroServiceWorker";

export const metadata: Metadata = {
  title: "PowerPOS",
  description: "Punto de venta, tienda web y administración de tu empresa.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PowerPOS",
  },
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <RegistroServiceWorker />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
