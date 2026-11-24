import type { ReactNode } from "react";
import { Shell } from "../components/shell";
import "./globals.css";

export const metadata = {
  title: "Sentinel",
  description: "Agentic SRE control plane",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const authConfigured = Boolean(process.env.DATABASE_URL && process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET && process.env.SENTINEL_PUBLIC_URL);
  return (
    <html lang="en">
      <body>
        <Shell authConfigured={authConfigured}>{children}</Shell>
      </body>
    </html>
  );
}
