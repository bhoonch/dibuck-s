import Link from "next/link";
import { redirect } from "next/navigation";
import { FileCheck2, FilePlus2, Users } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import {
  LEGAL_HOURS,
  complianceOf,
  formatHours,
  halfLabel,
  newHireOverdue,
  newHireProgress,
  personProgress,
  supervisorProgress,
  type NewHireProgress,
  type PersonProgress,
  type AttendeeSnap,
  type CourseType,
  type LogSummary,
  courseTypeOf,
} from "@/lib/safety-training";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { AttentionCard } from "@/components/attention-card";
import { GuideLink } from "@/components/guide-link";
import { TrainingTable } from "./training-table";

type LogMeta = {
  courseType?: CourseType;
  date?: string;
  hours?: unknown;
  attendees?: AttendeeSnap[];
};

export default async function SafetyTrainingHomePage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "safety-training"))) redirect("/subscriptions");

  const [docs, roster] = await Promise.all([
    db.document.findMany({
      where: { tenantId, type: "safety_training" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        docNo: true,
        title: true,
        status: true,
        meta: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),
    db.trainingStaff.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        office: true,
        hiredAt: true,
        supervisor: true,
        extTrainings: true,
      },
    }),
  ]);

  // 이행 현황은 열 때마다 계산한다 — 크론·저장값 없이 항상 정확하다
  const now = new Date();
  const finalLogs: LogSummary[] = docs
    .filter((d) => d.status === "final")
    .map((d) => {
      const m = (d.meta ?? {}) as LogMeta;
      return {
        courseType: m.courseType ?? "regular",
        date: m.date ?? ymdKst(d.createdAt),
        hours: m.hours,
        attendees: m.attendees ?? [],
      };
    });
  const c = complianceOf(now, finalLogs, roster);
  // 인원별 — 미이수자를 먼저, 그 안에서는 남은 시간이 많은 사람부터
  const progress = personProgress(now, finalLogs, roster).sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      b.required - b.hours - (a.required - a.hours),
  );
  const unfinished = progress.filter((p) => !p.done);
  const finished = progress.filter((p) => p.done);
  // 채용 시 교육은 개인별 1회성 — 입사일을 넣은 사람만 대상이다(넣지 않으면 조용하다)
  const newHire = new Map(
    newHireProgress(now, finalLogs, roster).map((p) => [p.id, p]),
  );
  const newHireDue = newHireOverdue([...newHire.values()]);
  // 관리감독자(소장)는 반기 집계 대상이 아니다 — 연 16시간(외부 이수 포함)으로 따로 본다
  const svs = supervisorProgress(c.half.year, finalLogs, roster);
  const missing = [
    c.regularOffice === false && "정기교육(사무직)",
    c.regularField === false && "정기교육(그 외 근로자)",
    !c.supervisor && "관리감독자 교육",
    newHireDue.length > 0 &&
      `채용 시 교육(${newHireDue.map((p) => p.name).join(", ")})`,
  ].filter(Boolean) as string[];
  // 판정이 "직군 전원 이수"라 라벨도 실시 여부가 아니라 이수 여부다
  const mark = (v: boolean | null) =>
    v === null ? "해당 없음" : v ? "전원 이수" : "미이수 있음";

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 안전교육일지"
        description="종류·주제를 고르고 참석자를 체크하면 교육 내용까지 채워진 법정 교육일지가 완성됩니다. 인쇄해 참석자 서명을 받아 보관하세요."
      >
        <GuideLink section="safety-training" />
        <Button asChild variant="outline" size="lg">
          <Link href="/modules/safety-training/report">
            <FileCheck2 className="size-4" /> 연간 보고서
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/modules/safety-training/staff">
            <Users className="size-4" /> 직원 명부
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/modules/safety-training/new">
            <FilePlus2 className="size-4" /> 새 교육일지
          </Link>
        </Button>
      </PageHeader>

      {roster.length === 0 ? (
        <AttentionCard title="먼저 직원 명부를 등록해 주세요">
          교육 대상 직원(기전·경비·미화 포함)을 한 번 등록해 두면, 이후에는
          체크만으로 참석자 명단이 채워집니다 — [직원 명부]에서 등록할 수 있습니다.
        </AttentionCard>
      ) : (
        missing.length > 0 && (
          <AttentionCard
            title={`${halfLabel(c.half)} 마감까지 ${c.daysLeft}일 — 법정 시간을 못 채운 교육이 있습니다`}
          >
            {/* 한 문장에 이어 붙이면 교육명·명단·안내가 뭉개진다 — 줄로 가른다 */}
            <span className="block">
              {missing.join(" · ")}
              {missing.includes("관리감독자 교육") && " (관리감독자는 연 16시간 기준)"}
            </span>
            <span className="block">
              {unfinished.length > 0 &&
                `미이수 ${unfinished.length}명: ${unfinished
                  .slice(0, 6)
                  .map((p) => p.name)
                  .join(", ")}${unfinished.length > 6 ? ` 외 ${unfinished.length - 6}명` : ""} — `}
              미실시 시 과태료 대상이 될 수 있습니다. [새 교육일지]로 실시 기록을
              남겨 주세요.
            </span>
          </AttentionCard>
        )
      )}

      <SummaryBox>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            label="정기교육 · 사무직"
            value={mark(c.regularOffice)}
            note={`${halfLabel(c.half)} · 매반기 6시간 이상`}
          />
          <SummaryStat
            label="정기교육 · 그 외"
            value={mark(c.regularField)}
            note={`${halfLabel(c.half)} · 매반기 12시간 이상`}
          />
          <SummaryStat
            label="관리감독자 교육"
            value={
              svs.length === 0
                ? c.supervisor
                  ? "완료"
                  : "미실시"
                : svs.length === 1
                  ? `${formatHours(svs[0].hours) || "0시간"} / 16시간`
                  : `${svs.filter((p) => p.done).length}/${svs.length}명 이수`
            }
            note={
              svs.length > 0
                ? `${c.half.year}년 · 외부 이수 포함`
                : `${c.half.year}년 · 연간 16시간 이상`
            }
          />
          <SummaryStat
            label="반기 마감"
            value={`D-${c.daysLeft}`}
            note={c.half.half === 1 ? "6월 30일까지" : "12월 31일까지"}
          />
        </dl>
      </SummaryBox>

      {roster.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-1 text-sm font-semibold">
            인원별 이수 현황{" "}
            <span className="font-normal text-muted-foreground">
              ({halfLabel(c.half)} 정기교육 · 전체 {progress.length}명 중 미이수{" "}
              {unfinished.length}명)
            </span>
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            완성된 정기교육 일지의 교육시간을 사람별로 더한 값입니다. 채용 시 교육
            ({LEGAL_HOURS.newHire})은 입사일을 넣은 직원에게만 별도로 표시되며, 정기교육
            시간에 합산하지 않습니다. 관리감독자는 연 16시간 기준이라 이 표에서 빠집니다.
          </p>

          {/* 손댈 일이 있는 건 미이수자뿐이라 그쪽만 펼쳐 둔다 — 명부가 40명이면
              전원을 그리는 순간 카드 하나가 1,400px가 되어 아래 일지 목록(증빙을
              꺼내 인쇄하는 통로)이 두 화면 밑으로 밀린다. */}
          {unfinished.length === 0 ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              {halfLabel(c.half)} 정기교육 전원 이수 ({progress.length}명)
            </p>
          ) : (
            <ul className="divide-y">
              {unfinished.slice(0, VISIBLE_ROWS).map((p) => (
                <ProgressRow key={p.id} p={p} newHire={newHire.get(p.id)} />
              ))}
            </ul>
          )}

          {unfinished.length > VISIBLE_ROWS && (
            <RowsDetails
              label={`미이수 나머지 ${unfinished.length - VISIBLE_ROWS}명 보기`}
              rows={unfinished.slice(VISIBLE_ROWS)}
              newHire={newHire}
            />
          )}
          {finished.length > 0 && (
            <RowsDetails
              label={`이수 완료 ${finished.length}명 보기`}
              rows={finished}
              newHire={newHire}
            />
          )}
        </Card>
      )}

      <TrainingTable
        rows={docs.map((d) => {
          const m = (d.meta ?? {}) as LogMeta;
          return {
            id: d.id,
            docNo: d.docNo ?? "",
            title: d.title,
            courseLabel: courseTypeOf(m.courseType ?? "")?.label ?? "-",
            date: m.date ?? ymdKst(d.createdAt),
            attendeeCount: m.attendees?.length ?? 0,
            status: d.status,
            author: d.createdBy?.name ?? "",
          };
        })}
      />
    </div>
  );
}

/** 미이수자를 몇 명까지 펼쳐 둘지 — 나머지는 접는다 */
const VISIBLE_ROWS = 8;

function ProgressRow({
  p,
  newHire,
}: {
  p: PersonProgress;
  newHire?: NewHireProgress;
}) {
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="w-20 shrink-0 font-medium">{p.name}</span>
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{p.position}</span>
      {/* 진행 막대 — 숫자만으로는 "얼마나 남았나"가 한눈에 안 온다 */}
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
        <span
          className={`block h-full rounded-full ${p.done ? "bg-emerald-500" : "bg-amber-500"}`}
          style={{ width: `${Math.min(100, Math.round((p.hours / p.required) * 100))}%` }}
        />
      </span>
      <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums">
        {formatHours(p.hours) || "0시간"} / {p.required}시간
      </span>
      <span
        className={`w-14 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${
          p.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        {p.done ? "이수" : "미이수"}
      </span>
      {/* 채용 시 교육은 입사일을 넣은 사람에게만 붙는 별도 요건 */}
      <span className="w-28 shrink-0 text-right text-xs">
        {newHire && !newHire.done ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
            채용 시 {newHire.hours}/{newHire.required}h
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** 접어 두는 행 묶음 — details는 네이티브라 상태·JS가 필요 없다 */
function RowsDetails({
  label,
  rows,
  newHire,
}: {
  label: string;
  rows: PersonProgress[];
  newHire: Map<string, NewHireProgress>;
}) {
  return (
    <details className="mt-2 border-t pt-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <ul className="divide-y">
        {rows.map((p) => (
          <ProgressRow key={p.id} p={p} newHire={newHire.get(p.id)} />
        ))}
      </ul>
    </details>
  );
}
