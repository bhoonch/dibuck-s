import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { approverRoleLabel, type ExternalApprover } from "@/lib/gian/rules";
import {
  DEFAULT_NOTICE_DAYS,
  proposeAgenda,
  type Attendee,
  type MeetingMeta,
} from "@/lib/minutes";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { MeetingForm } from "./meeting-form";

export default async function NewMeetingPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "minutes"))) redirect("/subscriptions");

  const [tenant, unresolved, lastMeeting] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { externalApprovers: true },
    }),
    db.resolution.findMany({
      where: { tenantId, followupStatus: "이행중" },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, meetingDocId: true, dueDate: true, note: true },
    }),
    // 규약 정원·작성자·배석자는 회의마다 스냅샷이지만 매번 다시 적을 값은 아니다 —
    // 직전 회의 값을 초기값으로 끌어온다(첫 회의만 손으로 적는다).
    db.document.findFirst({
      where: { tenantId, moduleId: "minutes", type: "minutes" },
      orderBy: { createdAt: "desc" },
      select: { meta: true },
    }),
  ]);
  const prev = lastMeeting?.meta as MeetingMeta | undefined;

  // 명부(externalApprovers) 전원을 참석 대상 스냅샷 초기값으로 — 기본 전원 체크
  const registry = (tenant.externalApprovers ?? []) as ExternalApprover[];
  const attendees: Attendee[] = registry
    .filter((e) => e.name?.trim())
    .map((e) => ({
      role: e.role,
      label: approverRoleLabel(e),
      name: e.name,
      present: true,
      ...(e.dong ? { dong: e.dong } : {}),
    }));

  // 미완료 의결의 회의 문서번호 — proposeAgenda의 안내 문구에 붙는다
  const meetingDocIds = [...new Set(unresolved.map((r) => r.meetingDocId))];
  const meetingDocs = meetingDocIds.length
    ? await db.document.findMany({
        where: { id: { in: meetingDocIds } },
        select: { id: true, docNo: true },
      })
    : [];
  const docNoById = new Map(meetingDocs.map((d) => [d.id, d.docNo]));
  const agenda = proposeAgenda(
    unresolved.map((r) => ({
      id: r.id,
      title: r.title,
      meetingDocNo: docNoById.get(r.meetingDocId) ?? null,
    })),
    0,
  );
  // 이행보고 안건의 맥락 — 기한·비고를 안건 입력칸 밑에 보여준다("무엇을 언제까지").
  // meta에는 넣지 않는다 — 회의록에 남는 값이 아니라 소집 화면의 참고 정보다.
  const resolutionHints = Object.fromEntries(
    unresolved
      .map((r) => [
        r.id,
        [r.dueDate && `기한 ${ymdKst(r.dueDate)}`, r.note].filter(Boolean).join(" · "),
      ])
      .filter(([, hint]) => hint),
  ) as Record<string, string>;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/modules/minutes"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        목록
      </Link>
      <PageHeader
        title="회의 만들기"
        description="일시·장소를 정하고 소집하면, 완료되지 않은 지난 의결의 이행 보고 안건이 자동으로 채워집니다."
      />
      <MeetingForm
        attendeesInit={attendees}
        agendaInit={agenda}
        resolutionHints={resolutionHints}
        hasRegistry={registry.length > 0}
        defaultNoticeDays={DEFAULT_NOTICE_DAYS}
        defaultBoardSeats={prev?.boardSeats ?? null}
        defaultPlace={prev?.place ?? ""}
        defaultKind={prev?.kind ?? "정기"}
        defaultWriterName={
          prev?.writerName ??
          attendees.find((a) => a.role === "CHAIR")?.name ??
          ""
        }
        defaultObservers={(prev?.observers ?? []).join(", ")}
      />
    </div>
  );
}
