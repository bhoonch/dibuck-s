import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Users } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import {
  complianceOf,
  halfLabel,
  type AttendeeSnap,
  type CourseType,
  courseTypeOf,
} from "@/lib/safety-training";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { AttentionCard } from "@/components/attention-card";
import { TrainingTable } from "./training-table";

type LogMeta = {
  courseType?: CourseType;
  date?: string;
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
      select: { office: true },
    }),
  ]);

  // 이행 현황은 열 때마다 계산한다 — 크론·저장값 없이 항상 정확하다
  const c = complianceOf(
    new Date(),
    docs
      .filter((d) => d.status === "final")
      .map((d) => {
        const m = (d.meta ?? {}) as LogMeta;
        return {
          courseType: m.courseType ?? "regular",
          date: m.date ?? ymdKst(d.createdAt),
          attendees: m.attendees ?? [],
        };
      }),
    roster,
  );
  const missing = [
    c.regularOffice === false && "정기교육(사무직)",
    c.regularField === false && "정기교육(그 외 근로자)",
    !c.supervisor && "관리감독자 교육",
  ].filter(Boolean) as string[];
  const mark = (v: boolean | null) =>
    v === null ? "해당 없음" : v ? "완료" : "미실시";

  return (
    <div className="space-y-6">
      <PageHeader
        title="안전보건 교육일지"
        description="종류·주제를 고르고 참석자를 체크하면 교육 내용까지 채워진 법정 교육일지가 완성됩니다. 인쇄해 참석자 서명을 받아 보관하세요."
      >
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
            title={`${halfLabel(c.half)} 마감까지 ${c.daysLeft}일 — 아직 실시하지 않은 교육이 있습니다`}
          >
            {missing.join(" · ")}
            {missing.includes("관리감독자 교육") && " (관리감독자는 연 1회 기준)"} —
            미실시 시 과태료 대상이 될 수 있습니다. [새 교육일지]로 실시 기록을
            남겨 주세요.
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
            value={c.supervisor ? "완료" : "미실시"}
            note={`${c.half.year}년 · 연간 16시간 이상`}
          />
          <SummaryStat
            label="반기 마감"
            value={`D-${c.daysLeft}`}
            note={c.half.half === 1 ? "6월 30일까지" : "12월 31일까지"}
          />
        </dl>
      </SummaryBox>

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
