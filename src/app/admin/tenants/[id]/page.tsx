import { notFound } from "next/navigation";
import { CheckCircle2, Circle, MonitorSmartphone } from "lucide-react";
import { db } from "@/lib/db";
import { docTypeLabels } from "@/lib/labels";
import { Textarea } from "@/components/ui/textarea";
import { StaffManager } from "./staff-manager";
import {
  Kpi,
  PageTitle,
  Pill,
  Section,
  btnOutline,
  btnPrimary,
  btnRow,
  btnSubmit,
} from "../../ui";
import { won, ymd } from "../../metrics";
import { TRIAL_DAYS } from "@/lib/modules";
import {
  impersonate,
  saveTenantMemo,
  setModuleTrial,
  setTenantStatus,
  toggleTenantModule,
} from "../../actions";

export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const since30d = new Date();
  since30d.setDate(since30d.getDate() - 30);
  const [tenant, modules, recentDocs, docCount, docCount30d] =
    await Promise.all([
      db.tenant.findUnique({
        where: { id },
        include: {
          users: { orderBy: { createdAt: "asc" } },
          modules: true,
          _count: { select: { units: true } },
        },
      }),
      db.module.findMany({ orderBy: { sortOrder: "asc" } }),
      db.document.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.document.count({ where: { tenantId: id } }),
      db.document.count({
        where: { tenantId: id, createdAt: { gte: since30d } },
      }),
    ]);
  if (!tenant) notFound();

  const now = new Date();
  const subs = new Map(
    tenant.modules
      .filter((m) => m.status === "ACTIVE")
      .map((m) => [m.moduleId, m] as const),
  );
  const activeSet = subs;
  const trialDaysLeft = (moduleId: string) => {
    const end = subs.get(moduleId)?.trialEndsAt;
    if (!end || end <= now) return null;
    return Math.ceil((end.getTime() - now.getTime()) / 86400000);
  };
  // 체험 중인 모듈은 요금이 발생하지 않는다
  const fee = modules
    .filter((m) => subs.has(m.id) && trialDaysLeft(m.id) === null)
    .reduce((sum, m) => sum + m.price, 0);
  const trialCount = modules.filter((m) => trialDaysLeft(m.id) !== null).length;

  // 온보딩 상태 — 기존 데이터에서 파생 (별도 저장 없음)
  const onboarding = [
    { label: "직원 계정 등록", done: tenant.users.length > 0 },
    { label: "세대 마스터 업로드", done: tenant._count.units > 0 },
    {
      label: "결재선 설정",
      done: Array.isArray(tenant.approvalLine) && tenant.approvalLine.length > 0,
    },
    { label: "모듈 구독", done: activeSet.size > 0 },
    { label: "첫 문서 작성", done: docCount > 0 },
  ];
  const onboardingDone = onboarding.filter((o) => o.done).length;

  return (
    <>
      <PageTitle
        eyebrow="단지 상세"
        title={tenant.name}
        description={tenant.address ?? undefined}
      >
        <form action={setTenantStatus}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <input
            type="hidden"
            name="status"
            value={tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
          />
          <button type="submit" className={btnOutline}>
            {tenant.status === "ACTIVE" ? "이용 중지" : "이용 재개"}
          </button>
        </form>
        <form action={impersonate}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <button type="submit" className={btnPrimary}>
            <MonitorSmartphone className="size-4" /> 사용자 화면으로 전환
          </button>
        </form>
      </PageTitle>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="상태"
          value={tenant.status === "ACTIVE" ? "운영 중" : "중지"}
          delta={`가입 ${ymd(tenant.createdAt)}`}
          tone={tenant.status === "ACTIVE" ? "success" : "danger"}
        />
        <Kpi
          label="월 요금"
          value={won(fee)}
          delta={
            trialCount > 0
              ? `구독 ${activeSet.size}개 (체험 ${trialCount}개 제외)`
              : `구독 모듈 ${activeSet.size}개`
          }
          tone={trialCount > 0 ? "warn" : "muted"}
        />
        <Kpi
          label="등록 세대"
          value={tenant._count.units.toLocaleString()}
          delta={`세대수 ${tenant.households?.toLocaleString() ?? "-"}`}
        />
        <Kpi
          label="문서"
          value={docCount.toLocaleString()}
          delta={`최근 30일 ${docCount30d}건`}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Section title="기본 정보" bodyClassName="p-4">
          <dl className="space-y-2 text-sm">
            {[
              ["세대수", tenant.households?.toLocaleString() ?? "-"],
              ["동 구성", tenant.buildingInfo ?? "-"],
              ["주소", tenant.address ?? "-"],
              ["가입일", ymd(tenant.createdAt)],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-20 shrink-0 text-gray-500">{k}</dt>
                <dd className="min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <StaffManager
          tenantId={tenant.id}
          staff={tenant.users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            title: u.title,
            role: u.role,
          }))}
        />

        <Section
          title="온보딩 상태"
          meta={`${onboardingDone}/${onboarding.length}`}
          bodyClassName="space-y-2 p-4"
        >
          {onboarding.map((o) => (
            <div key={o.label} className="flex items-center gap-2 text-sm">
              {o.done ? (
                <CheckCircle2 className="size-4 text-green-600" />
              ) : (
                <Circle className="size-4 text-gray-300" />
              )}
              <span className={o.done ? "" : "text-gray-500"}>{o.label}</span>
            </div>
          ))}
        </Section>

        <Section title="최근 문서" meta={`총 ${docCount}건`}>
          {recentDocs.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">
              작성된 문서가 없습니다.
            </p>
          ) : (
            recentDocs.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 last:border-b-0"
              >
                <Pill tone="muted">{docTypeLabels[d.type] ?? d.type}</Pill>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {d.title}
                </span>
                <span className="shrink-0 font-mono text-xs text-gray-400">
                  {ymd(d.createdAt)}
                </span>
              </div>
            ))
          )}
        </Section>

        <form action={saveTenantMemo} className="xl:col-span-2">
          <Section title="관리자 메모" bodyClassName="p-4">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <Textarea
              name="memo"
              rows={3}
              placeholder="영업·CS 기록 등 운영자만 보는 메모입니다."
              defaultValue={tenant.memo ?? ""}
            />
            <div className="mt-3 flex justify-end">
              <button type="submit" className={btnSubmit}>
                메모 저장
              </button>
            </div>
          </Section>
        </form>

        <Section
          title="구독 모듈"
          meta="feature flag"
          className="xl:col-span-2"
        >
          {modules.map((m) => {
            const on = subs.has(m.id);
            const daysLeft = trialDaysLeft(m.id);
            return (
              <div
                key={m.id}
                className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="ml-2 font-mono text-xs text-gray-500">
                    월 {m.price.toLocaleString()}원
                  </span>
                </span>
                {daysLeft !== null ? (
                  <Pill tone="warn">체험 D-{daysLeft}</Pill>
                ) : on ? (
                  <Pill tone="success">유료</Pill>
                ) : null}

                {/* 미구독: 기간 골라 체험 시작 / 체험 중: 기간 재설정 + 유료 전환 */}
                {(!on || daysLeft !== null) && (
                  <form action={setModuleTrial} className="flex items-center gap-1.5">
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <input type="hidden" name="moduleId" value={m.id} />
                    <input type="hidden" name="trial" value="true" />
                    <select
                      name="days"
                      defaultValue={TRIAL_DAYS}
                      aria-label="체험 기간"
                      className="h-7 rounded-md border border-input bg-transparent px-1.5 font-mono text-xs outline-none"
                    >
                      {[7, 14, 30, 60, 90].map((d) => (
                        <option key={d} value={d}>
                          {d}일
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={btnRow}>
                      {daysLeft !== null ? "기간 재설정" : "체험 시작"}
                    </button>
                  </form>
                )}
                {daysLeft !== null && (
                  <form action={setModuleTrial}>
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <input type="hidden" name="moduleId" value={m.id} />
                    <input type="hidden" name="trial" value="false" />
                    <button type="submit" className={btnRow}>
                      유료 전환
                    </button>
                  </form>
                )}
                <form action={toggleTenantModule}>
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <input type="hidden" name="moduleId" value={m.id} />
                  <input type="hidden" name="subscribe" value={String(!on)} />
                  <button type="submit" className={btnRow}>
                    {on ? "비활성화" : "활성화"}
                  </button>
                </form>
              </div>
            );
          })}
        </Section>
      </div>
    </>
  );
}
