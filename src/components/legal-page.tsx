import Link from "next/link";
import { Building2 } from "lucide-react";

/**
 * 약관·개인정보처리방침 같은 문서 화면의 공통 껍데기.
 * AuthShell은 카드 폭(max-w-sm)이라 문서에 못 쓴다 — 읽는 문서는 본문 폭이 필요하다.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** 시행(최종 수정)일 표기 — 문안을 실질 변경하면 반드시 갱신할 것 */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2 text-primary">
          <Building2 className="size-6" />
          <span className="text-lg font-bold tracking-tight">디벅</span>
        </Link>
      </header>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{updated}</p>
      <div className="mt-8 space-y-8 text-sm leading-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:ml-5 [&_li]:list-disc [&_p]:text-foreground/90 [&_ul]:mt-2 [&_ul]:space-y-1">
        {children}
      </div>
      <footer className="mt-12 border-t border-gray-100 pt-6 text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          ← 디벅 홈으로
        </Link>
      </footer>
    </main>
  );
}
