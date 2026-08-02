import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getModuleIcon } from "@/lib/module-icons";
import { Button } from "@/components/ui/button";

/** 공개 랜딩 + 요금표 — 가격·체험 기간은 모듈 레지스트리(운영자 설정)를 그대로 보여준다.
 * 국내 경쟁사 전원이 가격 비공개 — 공개 요금표 자체가 차별점 (경쟁사 분석 참조) */
export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect(session.tenantId ? "/home" : "/admin");

  const modules = await db.module.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-2 px-6 py-4">
        <Building2 className="size-6 text-primary" />
        <span className="text-lg font-bold tracking-tight">디벅</span>
        <span className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">로그인</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">무료로 시작하기</Link>
          </Button>
        </span>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 pb-12 pt-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          아파트 관리사무소의 행정·문서 업무,
          <br />
          필요한 모듈만 골라 구독하세요
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
          문서번호 자동 채번, 통합 문서함, 결재선까지 기본으로. ERP는 그대로
          두고, ERP가 안 해주는 업무만 단지 단위로 구독합니다.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">무료로 시작하기</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          가입 즉시 사용 · 카드 등록 없음 · 모듈마다 무료 체험
        </p>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-20">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">요금</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          단지 단위 요금입니다. 직원 수와 관계없이 같은 가격이에요.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => {
            const Icon = getModuleIcon(m.icon);
            return (
              <div key={m.id} className="flex flex-col rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Icon className="size-4" />
                  </span>
                  {m.trialDays > 0 && (
                    <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {m.trialDays}일 무료 체험
                    </span>
                  )}
                </div>
                <p className="text-base font-semibold">{m.name}</p>
                <p className="mt-1 flex-1 text-xs text-gray-500">{m.description}</p>
                <p className="mt-3 border-t border-gray-100 pt-3 font-mono text-sm font-semibold">
                  {m.price.toLocaleString()}원
                  <span className="ml-0.5 font-sans text-xs font-normal text-gray-500">
                    /월 · 단지 단위
                  </span>
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-8 space-y-1.5 text-sm text-muted-foreground">
          {[
            "멀티테넌트 기반 — 단지별 데이터 완전 분리",
            "구독 즉시 사용, 해지도 클릭 한 번 (남은 문서는 문서함에 보존)",
            "세대 마스터 엑셀 업로드, 공용 문서함·알림 센터 기본 제공",
          ].map((t) => (
            <p key={t} className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-green-600" />
              {t}
            </p>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-100">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6 py-6 text-xs text-muted-foreground">
          © 디벅
          <Link href="/terms" className="ml-auto hover:underline">
            이용약관
          </Link>
          {/* 개인정보처리방침은 관행대로 굵게 — 공개 의무가 있는 문서라 눈에 띄어야 한다 */}
          <Link href="/privacy" className="font-semibold hover:underline">
            개인정보처리방침
          </Link>
          <Link href="/login" className="hover:underline">
            로그인
          </Link>
        </div>
      </footer>
    </main>
  );
}
