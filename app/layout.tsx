import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import "./globals.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  // Deployment origin is an operator-controlled value, never a visitor Host header.
  const configured = process.env.SITE_URL || env.SITE_URL;
  let origin: URL | undefined;
  if (configured) {
    try {
      const candidate = new URL(configured);
      if (
        ["http:", "https:"].includes(candidate.protocol) &&
        !candidate.username &&
        !candidate.password
      )
        origin = new URL(candidate.origin);
    } catch {
      /* A missing or invalid origin must not emit a misleading preview URL. */
    }
  }
  const images = origin
    ? [
        {
          url: new URL("/og.png", origin).toString(),
          width: 1730,
          height: 909,
          alt: "군체 저항도 — 모두가 같은 선택을 할 때, 당신은?",
        },
      ]
    : undefined;
  return {
    metadataBase: origin,
    title: {
      default: "군체 저항도 — 당신의 선택은?",
      template: "%s | 군체 저항도",
    },
    description:
      "10개의 생존 상황, 하나의 독립적인 판단. 다른 참가자들의 선택과 비교하고 나만의 군체 저항도를 확인하세요.",
    openGraph: {
      title: "군체 저항도 — 당신의 선택은?",
      description:
        "모두가 같은 선택을 할 때, 당신은? 10개의 생존 상황으로 알아보는 군체 저항도.",
      locale: "ko_KR",
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: "군체 저항도",
      description: "10개의 생존 상황. 당신의 판단을 믿어보세요.",
      images,
    },
    icons: { icon: "/favicon.svg" },
    robots: { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
