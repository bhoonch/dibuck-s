import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * 본문 한글 글꼴. 예전엔 globals.css의 폰트 스택에 이름만 적혀 있고 실제로는
 * 로드되지 않아 맑은 고딕으로 떨어졌다 — 맑은 고딕엔 Medium(500)·SemiBold(600)가
 * 없어서 코드가 지정한 4단계 굵기가 화면에선 2단계로 뭉개졌다.
 *
 * 가변 글꼴 한 벌(45~920)이라 굵기 전 구간이 파일 하나로 해결된다. 92개 서브셋으로
 * 쪼개는 방법도 있지만 매일 쓰는 도구라 첫 방문 한 번만 받고 이후엔 캐시된다.
 * adjustFontFallback은 끈다 — 기본값 Arial 기준 보정은 한글 폴백(맑은 고딕)과
 * 안 맞아 교체 순간 오히려 더 틀어진다.
 */
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "디벅 - 아파트 관리사무소 업무 도우미",
  description: "아파트 관리사무소를 위한 모듈 구독형 업무 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
