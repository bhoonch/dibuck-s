import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, ScrollText } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { noticeDueYmd, signProgress, type MeetingMeta } from "@/lib/minutes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AttentionCard } from "@/components/attention-card";

const MODULE_ID = "minutes";
const TYPE = "minutes";

/** 소집=draft(초안 없음)·초안=draft(초안 있음)·완성=final·폐기=void — [docId] 화면과 같은 4단계 어휘 */
function statusLabel(status: string, hasMinutes: boolean) {
  if (status === "void") return "폐기";
  if (status === "final") return "완성";
  return hasMinutes ? "초안" : "소집 중";
}
function statusStyle(status: string, hasMinutes: boolean) {
  if (status === "void") return "bg-gray-100 text-gray-400";
  if (status === "final") return "bg-green-50 text-green-700";
  return hasMinutes ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-600";
}

export default async function MinutesHomePage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, MODULE_ID))) redirect("/subscriptions");

  const now = new Date();
  const today = ymdKst(now);
  const todayStart = new Date(`${today}T00:00:00+09:00`);
  const dday = (d: Date) =>
    Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86400000));

  const [next, overdueCount, recentDocs] = await Promise.all([
    // 다음 회의 — 소집 또는 초안 단계(status draft) 중 dueDate가 가장 가까운 것. 크론 없이 열 때 계산
    db.document.findFirst({
      where: { tenantId, moduleId: MODULE_ID, type: TYPE, status: "draft", dueDate: { gte: todayStart } },
      orderBy: { dueDate: "asc" },
      select: { id: true, meta: true, dueDate: true },
    }),
    // 미이행 의결 — 이행중이면서 기한이 지난 것만 센다("완료"·"없음"은 기한 무관)
    db.resolution.count({
      where: { tenantId, followupStatus: "이행중", dueDate: { lt: todayStart } },
    }),
    // 서명 카운트는 목록 전체 include로 당기지 않는다 — steps만 좁게 select
    db.document.findMany({
      where: { tenantId, moduleId: MODULE_ID, type: TYPE },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        docNo: true,
        status: true,
        meta: true,
        approvalSteps: { select: { status: true } },
      },
    }),
  ]);

  const nextMeta = next?.meta as MeetingMeta | undefined;
  const nextHasMinutes = !!nextMeta?.minutes;
  const noticeDueYmdVal = nextMeta ? noticeDueYmd(nextMeta.meetingAt, nextMeta.noticeDays) : null;
  const noticeOverdue = !nextHasMinutes && !!noticeDueYmdVal && noticeDueYmdVal < today;

  const empty = recentDocs.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="입주자대표회의 회의록"
        description="소집 통지부터 서명까지 한 화면에서 관리합니다. 완료되지 않은 의결은 다음 회의 안건으로 자동 제안됩니다."
      >
        <Button asChild variant="outline" size="lg">
          <Link href="/modules/minutes/resolutions">
            <ScrollText className="size-4" /> 의결사항 대장
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/modules/minutes/new">
            <FilePlus2 className="size-4" /> 새 회의
          </Link>
        </Button>
      </PageHeader>

      {empty && (
        <Card className="p-6">
          <h2 className="text-sm font-semibold">시작하기</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            [새 회의]로 일시·장소를 정하고 소집하면 시작됩니다.
            <br />
            회의가 끝나면 회의록을 쓰고, 완성하면 참석자에게 서명을 요청할 수 있습니다.
          </p>
        </Card>
      )}

      {overdueCount > 0 && (
        <AttentionCard title={`기한이 지난 미이행 의결이 ${overdueCount}건 있습니다`}>
          <Link
            href="/modules/minutes/resolutions?f=이행중"
            className="font-medium underline underline-offset-2"
          >
            의결사항 대장에서 확인
          </Link>
        </AttentionCard>
      )}

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">다음 회의</h2>
        {next && nextMeta ? (
          <>
            <Link
              href={`/modules/minutes/${next.id}`}
              className="text-lg font-semibold hover:underline"
            >
              제{nextMeta.meetingNo}차 입주자대표회의
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">
              {nextMeta.meetingAt} · {dday(next.dueDate!) === 0 ? "오늘" : `D-${dday(next.dueDate!)}`}
            </p>
            {!nextHasMinutes &&
              (noticeOverdue ? (
                <p className="mt-2 text-sm font-semibold text-red-600">
                  소집 통지 시한({noticeDueYmdVal})이 지났습니다.
                  <br />
                  관리규약을 확인하세요.
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  소집 통지 시한 {noticeDueYmdVal}까지
                </p>
              ))}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            예정된 회의가 없습니다. [새 회의]로 소집을 시작하세요.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold">회의록 목록</h2>
        {recentDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 만든 회의가 없습니다.
          </p>
        ) : (
          <ul className="divide-y">
            {recentDocs.map((d) => {
              const meta = d.meta as MeetingMeta;
              const hasMinutes = !!meta.minutes;
              const sign = d.status === "final" ? signProgress(d.approvalSteps) : null;
              return (
                <li key={d.id}>
                  <Link
                    href={`/modules/minutes/${d.id}`}
                    className="flex flex-wrap items-center gap-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      제{meta.meetingNo}차
                    </span>
                    <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                      {d.docNo ?? "-"}
                    </span>
                    <span className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">
                      {meta.meetingAt}
                    </span>
                    <span
                      className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${statusStyle(d.status, hasMinutes)}`}
                    >
                      {statusLabel(d.status, hasMinutes)}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                      {sign ? `서명 ${sign.signed}/${sign.total}` : "-"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
