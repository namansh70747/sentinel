import type { ReactNode } from "react";
import { Shell } from "../components/shell";
import "./globals.css";

export const metadata = {
  title: "Sentinel",
  description: "Agentic SRE control plane",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
