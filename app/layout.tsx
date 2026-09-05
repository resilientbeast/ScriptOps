import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { hasClerkConfiguration } from "@/lib/auth/access-policy";

import "./globals.css";

export const metadata: Metadata = {
  title: "ScriptOps — Production Control",
  description:
    "Human-supervised pre-production planning where one approved change stays connected across the whole plan.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const content = hasClerkConfiguration() ? (
    <ClerkProvider>{children}</ClerkProvider>
  ) : (
    children
  );

  return (
    <html lang="en">
      <body>{content}</body>
    </html>
  );
}
