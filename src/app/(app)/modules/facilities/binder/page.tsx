import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { cycleLabel, type Cycle } from "@/lib/inspection/catalog";
import { daysUntil, nextDue } from "@/lib/inspection/schedule";
import { courseTypeOf } from "@/lib/safety-training";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PrintStyle } from "@/components/gian-paper";
import { PrintButton } from "./print-button";

type Cell = {
  /** 완료 기록 — 문서 링크 */
  doc?: { id: string; href: string };
  /** 이번 도래분이 이 달인데 기록이 없다 — 빨강 */
  missed?: boolean;
};

/**
 * 감사 서류철 — 연도별 항목 × 월 매트릭스. "지자체 감사 나와도 3분 만에 뽑는
 * 서류철"이 이 화면이다. 교육일지 행도 함께 표시 — 로드맵 "5위+8위 병합"의 완성.
 *
 * ponytail: 빨강(미이행 도래분)은 **현재 계산된 도래일이 지난 경우**만 찍는다 —
 * 과거에 걸렀는지는 기록이 없으면 앱이 알 수 없다(앵커가 기록을 따라 굴러가므로
 * 재구성 불가). 이행 기록이 쌓일수록 서류철이 정확해진다.
 */
export default async function BinderPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "facilities"))) redirect("/subscriptions");

  const now = new Date();
  const thisYear = Number(ymdKst(now).slice(0, 4));
  const { year: yearParam } = await searchParams;
  const year = /^\d{4}$/.test(yearParam ?? "") ? Number(yearParam) : thisYear;

  const [items, records, trainingDocs, tenant] = await Promise.all([
    db.inspectionItem.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
    }),
    db.document.findMany({
      where: { tenantId, type: "inspection", status: "final" },
      select: { id: true, meta: true, createdAt: true },
    }),
    db.document.findMany({
      where: { tenantId, type: "safety_training", status: "final" },
      select: { id: true, meta: true, createdAt: true },
    }),
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
  ]);

  // 항목별 × 월별 셀 — 기록(meta.doneAt)이 원본, 항목 매칭은 meta.itemId
  const grid = new Map<string, Cell[]>(items.map((it) => [it.id, Array.from({ length: 12 }, () => ({}) as Cell)]));
  for (const r of records) {
    const m = (r.meta ?? {}) as { itemId?: string; doneAt?: string };
    const doneAt = m.doneAt ?? ymdKst(r.createdAt);
    if (!m.itemId || !doneAt.startsWith(`${year}-`)) continue;
    const cells = grid.get(m.itemId);
    if (!cells) continue;
    const month = Number(doneAt.slice(5, 7)) - 1;
    // 같은 달에 여러 건이면 첫 건 링크 — 나머지는 대장 목록에서 본다
    cells[month].doc ??= { id: r.id, href: `/modules/facilities/${r.id}` };
  }
  // 미이행 도래분 — 현재 도래일이 지났고 그 달이 선택 연도에 있으면 빨강
  for (const it of items) {
    const due = nextDue(it);
    if (!due || daysUntil(due, now) >= 0 || !due.startsWith(`${year}-`)) continue;
    const cell = grid.get(it.id)![Number(due.slice(5, 7)) - 1];
    if (!cell.doc) cell.missed = true;
  }

  // 교육일지 행 — 교육 종류별로 묶는다 (정기/채용 시/관리감독자)
  const trainingRows = new Map<string, Cell[]>();
  for (const d of trainingDocs) {
    const m = (d.meta ?? {}) as { courseType?: string; date?: string };
    const date = m.date ?? ymdKst(d.createdAt);
    if (!date.startsWith(`${year}-`)) continue;
    const label = courseTypeOf(m.courseType ?? "regular")?.label ?? "정기교육";
    const cells =
      trainingRows.get(label) ??
      trainingRows
        .set(label, Array.from({ length: 12 }, () => ({}) as Cell))
        .get(label)!;
    cells[Number(date.slice(5, 7)) - 1].doc ??= {
      id: d.id,
      href: `/modules/safety-training/${d.id}`,
    };
  }

  const th =
    "border border-gray-300 bg-gray-50 px-2 py-1.5 text-center text-xs font-semibold print:bg-transparent";
  const td = "border border-gray-300 px-1 py-1.5 text-center text-xs";

  return (
    <>
      <PrintStyle target="binder-sheet" margin="12mm" />
      <div className="space-y-6">
        <Link
          href="/modules/facilities"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" /> 현황판
        </Link>
        <div className="print:hidden">
          <PageHeader
            title="감사 서류철"
            description="연도별 항목 × 월 매트릭스입니다. 완료 칸은 점검일지로 연결되고, 기한이 지난 도래분은 빨갛게 표시됩니다."
          >
            <PrintButton />
          </PageHeader>
        </div>

        {/* 연도 이동 — 링크 두 개면 끝난다(상태·JS 불필요) */}
        <div className="flex items-center gap-2 print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link href={`/modules/facilities/binder?year=${year - 1}`}>
              <ChevronLeft className="size-4" /> {year - 1}년
            </Link>
          </Button>
          <span className="text-sm font-semibold">{year}년</span>
          {year < thisYear && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/modules/facilities/binder?year=${year + 1}`}>
                {year + 1}년 <ChevronRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>

        <div id="binder-sheet" className="overflow-x-auto rounded-lg border bg-card p-4 print:overflow-visible print:rounded-none print:border-0 print:p-0">
          <h2 className="mb-3 text-center text-base font-bold">
            {tenant.name} 법정점검·교육 이행 대장 ({year}년)
          </h2>
          <table className="w-full min-w-[720px] border-collapse print:min-w-0">
            <thead>
              <tr>
                <th className={`${th} w-56 text-left`}>항목</th>
                <th className={`${th} w-20`}>주기</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className={th}>
                    {i + 1}월
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td className={`${td} text-left font-medium`}>
                    {/* 항목명 = 연간 일괄 출력 입구. 화면에서는 링크, 인쇄물에는 평문 */}
                    <Link
                      href={`/modules/facilities/binder/${it.id}?year=${year}`}
                      className="hover:text-blue-700 hover:underline print:no-underline"
                    >
                      {it.name}
                    </Link>
                  </td>
                  <td className={td}>
                    {cycleLabel({ type: it.cycleType, n: it.cycleN ?? undefined } as Cycle)}
                  </td>
                  {grid.get(it.id)!.map((cell, i) => (
                    <td
                      key={i}
                      className={`${td} ${cell.missed ? "bg-red-50 font-bold text-red-600 print:bg-transparent" : ""}`}
                    >
                      {cell.doc ? (
                        <Link href={cell.doc.href} className="block font-bold text-emerald-700 hover:underline">
                          ✓
                        </Link>
                      ) : cell.missed ? (
                        "미이행"
                      ) : (
                        ""
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {trainingRows.size > 0 && (
                <tr>
                  <td colSpan={14} className={`${td} bg-gray-50 text-left text-xs font-semibold text-muted-foreground print:bg-transparent`}>
                    안전보건교육 (교육일지 모듈)
                  </td>
                </tr>
              )}
              {[...trainingRows].map(([label, cells]) => (
                <tr key={label}>
                  <td className={`${td} text-left font-medium`}>{label} 일지</td>
                  <td className={td}>—</td>
                  {cells.map((cell, i) => (
                    <td key={i} className={td}>
                      {cell.doc ? (
                        <Link href={cell.doc.href} className="block font-bold text-emerald-700 hover:underline">
                          ✓
                        </Link>
                      ) : (
                        ""
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {items.length === 0 && trainingRows.size === 0 && (
                <tr>
                  <td colSpan={14} className={`${td} py-8 text-muted-foreground`}>
                    표시할 항목이 없습니다 — [설정 마법사]로 점검 항목을 켜 주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            ✓ = 완료 기록(클릭하면 일지) · 미이행 = 기한이 지난 도래분.
            <span className="print:hidden">
              {" "}
              <b>항목 이름을 누르면 그 항목의 연간 일지를 한 번에 인쇄</b>할 수
              있습니다 — 감사·지도점검의 &ldquo;실시대장 제출&rdquo; 대응용.
            </span>{" "}
            과거에 기록 없이 지나간 회차는 표시되지 않습니다 — 기록이 쌓일수록
            서류철이 정확해집니다.
          </p>
        </div>
      </div>
    </>
  );
}
