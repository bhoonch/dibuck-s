"use server";

import { RedirectType, redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import {
  DEFAULT_NOTICE_DAYS,
  type Attendee,
  type MeetingMeta,
} from "@/lib/minutes";

const MODULE_ID = "minutes";
const TYPE = "minutes";

/**
 * Prisma 트랜잭션 직렬화 충돌(Serializable 재시도 대상, P2034).
 * 이 프로젝트는 드라이버 어댑터(@prisma/adapter-pg)를 쓴다 — 인터랙티브 트랜잭션
 * 안에서 난 충돌은 PrismaClientKnownRequestError(P2034)로 안 감싸이고, 원본
 * DriverAdapterError(cause.kind: "TransactionWriteConflict")가 그대로 올라온다.
 * 실측 확인(Postgres SQLSTATE 40001 유도 테스트) — 둘 다 잡는다.
 */
const isSerializationConflict = (e: unknown) => {
  if (typeof e !== "object" || e === null) return false;
  if ("code" in e && e.code === "P2034") return true;
  const err = e as { name?: string; cause?: { kind?: string } };
  return err.name === "DriverAdapterError" && err.cause?.kind === "TransactionWriteConflict";
};

/** 문서를 만드는 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다 */
async function requireMinutes() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, MODULE_ID)))
    redirect("/subscriptions");
  return session;
}

export type MeetingState = { error?: string } | undefined;

/**
 * 회의 만들기(소집) — docNo는 null로 둔다(채번 없음). 소집만 하고 버린 회의가
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
  // meta는 JSON이라 유니크 제약을 걸 수 없다 — 읽기(최대값)와 쓰기를 Serializable
  // 트랜잭션으로 묶어 동시 생성 때 같은 회차를 두 번 발급하는 것을 막는다.
  // createDocument를 안 쓰는 이유: meetingNo 직렬화 트랜잭션 안에서 생성해야 해서
  // (docNo는 numberOnSubmit이라 애초에 null 그대로 — createDocument가 하던 채번은 여기 없다).
  let doc;
  for (let attempt = 0; ; attempt++) {
    try {
      doc = await db.$transaction(
        async (tx) => {
          const existing = await tx.document.findMany({
            where: { tenantId, moduleId: MODULE_ID, type: TYPE },
            select: { meta: true },
          });
          const meetingNo =
            1 +
            Math.max(
              0,
              ...existing.map(
                (d) =>
                  Number((d.meta as { meetingNo?: number } | null)?.meetingNo) || 0,
              ),
            );
          return tx.document.create({
            data: {
              tenantId,
              moduleId: MODULE_ID,
              docNo: null,
              type: TYPE,
              title: `제${meetingNo}차 입주자대표회의`,
              content: agenda.map((a) => a.title).join("\n"), // 문서함 검색용
              status: "draft",
              dueDate: new Date(`${meetingAt.replace(" ", "T")}:00+09:00`), // 홈 할 일 위젯
              createdById: session.userId,
              meta: {
                meetingNo,
                meetingAt,
                place,
                noticeDays,
                attendees,
                agenda,
              } satisfies MeetingMeta,
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
      break;
    } catch (e) {
      if (!isSerializationConflict(e) || attempt >= 4) throw e;
    }
  }
  redirect(`/modules/minutes/${doc.id}`, RedirectType.replace);
}
