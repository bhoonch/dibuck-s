"use server";

import { RedirectType, redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { isSubscribed } from "@/lib/modules";
import {
  DEFAULT_NOTICE_DAYS,
  type Attendee,
  type MeetingMeta,
} from "@/lib/minutes";

const MODULE_ID = "minutes";
const TYPE = "minutes";

/** 문서를 만드는 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다 */
async function requireMinutes() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, MODULE_ID)))
    redirect("/subscriptions");
  return session;
}

export type MeetingState = { error?: string } | undefined;

/**
 * 회의 만들기(소집) — 채번은 하지 않는다(numberOnSubmit). 소집만 하고 버린 회의가
 * 문서번호를 결번으로 남기면 안 된다(회의록 완성에서 채번 — Task 4).
 * meetingNo(회차)는 별도 채번 트랙 — docNo와 달리 즉시 확정해야 제목("제N차")을 지을 수 있다.
 */
export async function createMeeting(
  _prev: MeetingState,
  formData: FormData,
): Promise<MeetingState> {
  const session = await requireMinutes();
  const tenantId = session.tenantId!;

  // datetime-local 값: "YYYY-MM-DDTHH:mm"(초가 붙기도 한다) → MeetingMeta 저장 형식 "YYYY-MM-DD HH:mm"
  const meetingAtRaw = String(formData.get("meetingAt") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(meetingAtRaw))
    return { error: "회의 일시를 입력해 주세요." };
  const meetingAt = meetingAtRaw.slice(0, 16).replace("T", " ");

  const place = String(formData.get("place") ?? "").trim();

  const noticeDaysRaw = Number(formData.get("noticeDays"));
  const noticeDays =
    Number.isFinite(noticeDaysRaw) && noticeDaysRaw > 0
      ? Math.floor(noticeDaysRaw)
      : DEFAULT_NOTICE_DAYS;

  let attendees: Attendee[];
  try {
    attendees = (JSON.parse(String(formData.get("attendees") ?? "[]")) as Attendee[])
      .filter((a) => a && typeof a.name === "string" && a.name.trim());
  } catch {
    return { error: "참석자 정보를 읽을 수 없습니다." };
  }
  if (!attendees.some((a) => a.present))
    return { error: "참석 대상을 1명 이상 선택해 주세요." };

  let agendaRaw: { title?: string; fromResolutionId?: string }[];
  try {
    agendaRaw = JSON.parse(String(formData.get("agenda") ?? "[]"));
  } catch {
    return { error: "안건 정보를 읽을 수 없습니다." };
  }
  // order는 제출된 배열 순서로 다시 매긴다 — 제안분 삭제로 생긴 빈틈을 그대로 쓰면 안 된다
  const agenda = agendaRaw
    .map((a, i) => ({
      order: i + 1,
      title: (a.title ?? "").trim(),
      fromResolutionId: a.fromResolutionId,
    }))
    .filter((a) => a.title);
  if (agenda.length === 0) return { error: "안건을 1개 이상 입력해 주세요." };

  // 회차 = 기존 minutes 문서 meta.meetingNo 최대값 + 1. count+1이 아니다 —
  // 소집만 하고 버린 회의가 있으면 count가 줄어 회차가 겹친다(채번과 같은 이유).
  const existing = await db.document.findMany({
    where: { tenantId, moduleId: MODULE_ID, type: TYPE },
    select: { meta: true },
  });
  const meetingNo =
    1 +
    Math.max(
      0,
      ...existing.map(
        (d) => Number((d.meta as { meetingNo?: number } | null)?.meetingNo) || 0,
      ),
    );

  const doc = await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    type: TYPE,
    title: `제${meetingNo}차 입주자대표회의`,
    content: agenda.map((a) => a.title).join("\n"), // 문서함 검색용
    status: "draft",
    numberOnSubmit: true, // [회의록 완성]에서 채번 — 버린 소집이 결번을 남기면 안 된다
    dueDate: new Date(`${meetingAt.replace(" ", "T")}:00+09:00`), // 홈 할 일 위젯
    createdById: session.userId,
    meta: { meetingNo, meetingAt, place, noticeDays, attendees, agenda } satisfies MeetingMeta,
  });
  redirect(`/modules/minutes/${doc.id}`, RedirectType.replace);
}
