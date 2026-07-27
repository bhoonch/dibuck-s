import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getModulesForTenant } from "@/lib/modules";
import { getModuleIcon } from "@/lib/module-icons";
import { docStatusLabels, docStatusStyles, docTypeLabels } from "@/lib/labels";
import { ymdKst, dayKst } from "@/lib/utils";
import { OnboardingChecklist } from "@/components/onboarding-checklist";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type TaskItem = {
  id: string;
  title: string;
  meta: string;
  tag: string;
  dot: string;
  tagStyle: string;
  cta: string;
  href: string;
  sortKey: number;
};

export default async function HomePage() {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 86400000);
  const dday = (d: Date) =>
    Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86400000));

  // 목록은 상위 10건만, 숫자는 count로 따로 센다 —
  // take한 배열의 length를 KPI·처리율에 쓰면 37건이 10건으로 보이고 처리율이 부풀려진다
  const where = {
    approval: { tenantId, type: "approval", status: "pending" },
    contract: { tenantId, type: "contract", dueDate: { gte: now, lte: days(30) } },
    complaint: { tenantId, type: "complaint", status: "open" },
    inspection: { tenantId, type: "inspection", dueDate: { gte: now, lte: days(7) } },
  };

  const [
    approvals,
    contracts,
    complaints,
    inspections,
    counts,
    complaintsDone,
    approvalsDone,
    modules,
    recentDocs,
    tenant,
    unitCount,
    staffCount,
  ] = await Promise.all([
      db.document.findMany({
        where: where.approval,
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
      db.document.findMany({
        where: where.contract,
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      db.document.findMany({
        where: where.complaint,
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
      db.document.findMany({
        where: where.inspection,
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      Promise.all([
        db.document.count({ where: where.approval }),
        db.document.count({ where: where.contract }),
        db.document.count({ where: where.complaint }),
        db.document.count({ where: where.inspection }),
      ]).then(([approval, contract, complaint, inspection]) => ({
        approval,
        contract,
        complaint,
        inspection,
      })),
      db.document.count({ where: { tenantId, type: "complaint", status: "done" } }),
      db.document.count({ where: { tenantId, type: "approval", status: "final" } }),
      getModulesForTenant(tenantId),
      db.document.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, title: true, type: true, status: true, createdAt: true },
      }),
      // 시작 가이드 판정용 — 전부 실데이터로 본다
      db.tenant.findUnique({
        where: { id: tenantId },
        select: { households: true, address: true },
      }),
      db.unit.count({ where: { tenantId } }),
      db.user.count({ where: { tenantId } }),
    ]);

  const tasks: TaskItem[] = [
    ...approvals.map((d) => ({
      id: d.id,
      title: d.title,
      meta: `${ymdKst(d.createdAt)} 요청`,
      tag: "결재",
      dot: "bg-blue-600",
      tagStyle: "bg-blue-50 text-blue-800",
      cta: "결재",
      href: "/documents?type=approval",
      sortKey: d.createdAt.getTime(),
    })),
    ...contracts.map((d) => ({
      id: d.id,
      title: d.title,
      meta: `만료 ${ymdKst(d.dueDate!)}`,
      tag: `D-${dday(d.dueDate!)}`,
      dot: "bg-amber-600",
      tagStyle: "bg-amber-50 text-amber-700",
      cta: "갱신",
      href: "/documents?type=contract",
      sortKey: d.dueDate!.getTime(),
    })),
    ...complaints.map((d) => ({
      id: d.id,
      title: d.title,
      meta: `${ymdKst(d.createdAt)} 접수`,
      tag: "민원",
      dot: "bg-red-600",
      tagStyle: "bg-red-50 text-red-700",
      cta: "확인",
      href: "/documents?type=complaint",
      sortKey: d.createdAt.getTime(),
    })),
    ...inspections.map((d) => ({
      id: d.id,
      title: d.title,
      meta: `점검 ${ymdKst(d.dueDate!)}`,
      tag: `D-${dday(d.dueDate!)}`,
      dot: "bg-sky-600",
      tagStyle: "bg-sky-50 text-sky-600",
      cta: "준비",
      href: "/documents?type=inspection",
      sortKey: d.dueDate!.getTime(),
    })),
  ]
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, 8);

  const total =
    counts.approval + counts.contract + counts.complaint + counts.inspection;
  const tiles = [
    { label: "결재 대기", count: counts.approval, dot: "bg-blue-600", href: "/documents?type=approval" },
    { label: "계약 만료 D-30", count: counts.contract, dot: "bg-amber-600", href: "/documents?type=contract" },
    { label: "미처리 민원", count: counts.complaint, dot: "bg-red-600", href: "/documents?type=complaint" },
    { label: "점검 예정", count: counts.inspection, dot: "bg-sky-600", href: "/documents?type=inspection" },
  ];

  const rate = (num: number, den: number) =>
    den === 0 ? 0 : Math.round((num / den) * 1000) / 10;
  const progress = [
    { label: "민원 처리율", value: rate(complaintsDone, complaintsDone + counts.complaint), color: "bg-blue-600" },
    { label: "결재 처리율", value: rate(approvalsDone, approvalsDone + counts.approval), color: "bg-green-600" },
    { label: "계약 갱신 여유", value: counts.contract === 0 ? 100 : 0, color: "bg-amber-600" },
  ];

  const subscribed = modules.filter((m) => m.subscribed);
  const dateLine = `${ymdKst(now)} (${WEEKDAYS[dayKst(now)]})`;

  // 시작 가이드 — 소장만. 직원에게는 자기가 못 하는 일이 할 일로 보이면 안 된다
  const onboarding =
    session.role === "DIRECTOR"
      ? [
          {
            label: "단지 정보 입력",
            desc: "주소·세대수를 채워 주세요",
            href: "/settings",
            done: !!tenant?.households && !!tenant?.address,
          },
          {
            label: "세대 등록",
            desc: "엑셀로 한 번에 올릴 수 있어요",
            href: "/settings/units",
            done: unitCount > 0,
          },
          {
            label: "직원 등록",
            desc: "함께 쓸 직원 계정을 만드세요",
            href: "/settings/staff",
            done: staffCount >= 2,
          },
          {
            label: "모듈 구독",
            desc: "필요한 모듈부터 무료로 체험하세요",
            href: "/settings/subscriptions",
            done: subscribed.length > 0,
          },
        ]
      : [];

  return (
    <>
      {onboarding.length > 0 && <OnboardingChecklist steps={onboarding} />}
      <div className="mb-5">
        <p className="mb-1 font-mono text-xs text-gray-500">{dateLine}</p>
        <h2 className="text-2xl font-semibold tracking-tight">
          {total > 0
            ? `오늘 처리할 업무 ${total}건이 있습니다.`
            : `안녕하세요, ${session.name}님. 오늘 처리할 업무가 없습니다.`}
        </h2>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <span className={`size-1.5 rounded-full ${t.dot}`} />
              {t.label}
            </div>
            <div className="mb-1.5 mt-2 flex items-baseline gap-1">
              <span className="font-mono text-3xl font-semibold leading-none tracking-tight">
                {t.count}
              </span>
              <span className="text-sm text-gray-500">건</span>
            </div>
            <div className="text-xs text-gray-500">문서함에서 확인</div>
          </Link>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border bg-card">
          <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-3">
            <h3 className="text-lg font-semibold tracking-tight">오늘의 할 일</h3>
            <span className="font-mono text-xs text-gray-500">전체 {total}건</span>
            <Link
              href="/documents"
              className="ml-auto text-sm font-semibold text-blue-700 hover:underline"
            >
              전체 보기
            </Link>
          </div>
          {tasks.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              처리할 업무가 없습니다. 수고하셨어요!
            </p>
          ) : (
            <div>
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5 last:border-b-0 hover:bg-background"
                >
                  <span className={`size-2 shrink-0 rounded-full ${t.dot}`} />
                  <span className="block min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {t.title}
                    </span>
                    <span className="block font-mono text-xs text-gray-500">
                      {t.meta}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${t.tagStyle}`}
                  >
                    {t.tag}
                  </span>
                  <Link
                    href={t.href}
                    className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border border-gray-300 bg-card px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    {t.cta}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-4">
          <section className="rounded-lg border bg-card">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="text-lg font-semibold tracking-tight">
                이번 달 처리 현황
              </h3>
            </div>
            <div className="grid gap-3.5 p-4">
              {progress.map((p) => (
                <div key={p.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm text-gray-700">{p.label}</span>
                    <span className="font-mono text-sm font-medium">
                      {p.value}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${p.color}`}
                      style={{ width: `${p.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-card">
            <div className="flex items-center border-b border-gray-100 px-4 py-3">
              <h3 className="text-lg font-semibold tracking-tight">최근 문서</h3>
              <Link
                href="/documents"
                className="ml-auto text-sm font-semibold text-blue-700 hover:underline"
              >
                문서함
              </Link>
            </div>
            <div>
              {recentDocs.map((d) => (
                <Link
                  key={d.id}
                  href={`/documents?q=${encodeURIComponent(d.title)}`}
                  className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 last:border-b-0 hover:bg-background"
                >
                  <span className="block min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {d.title}
                    </span>
                    <span className="block font-mono text-xs text-gray-400">
                      {docTypeLabels[d.type] ?? d.type} ·{" "}
                      {ymdKst(d.createdAt)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${docStatusStyles[d.status] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {docStatusLabels[d.status] ?? d.status}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="mb-3 mt-6 flex items-center">
        <h3 className="text-lg font-semibold tracking-tight">모듈 바로가기</h3>
        <Link
          href="/modules"
          className="ml-auto text-sm font-semibold text-blue-700 hover:underline"
        >
          모듈 전체 보기
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subscribed.map((m) => {
          const Icon = getModuleIcon(m.icon);
          return (
            <Link
              key={m.id}
              href={m.route}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3.5 transition-all hover:border-gray-300 hover:shadow-sm"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <Icon className="size-4" />
              </span>
              <span className="block min-w-0">
                <span className="block text-sm font-semibold">{m.name}</span>
                <span className="block truncate text-xs text-gray-500">
                  {m.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
