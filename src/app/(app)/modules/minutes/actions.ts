"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { rateLimit } from "@/lib/rate-limit";
import { aiEnabled, generateMinutesDraft } from "@/lib/minutes-ai";
import {
  DECISIONS,
  DEFAULT_NOTICE_DAYS,
  type Attendee,
  type MeetingMeta,
  type MinutesAgenda,
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

/** 단지당 일일 생성 한도 — 공지문·기안 모듈과 같은 셀프서비스 남용 방지 */
const DAILY_LIMIT = 30;

export type GenerateMinutesState =
  | { error: string }
  | { agendas: MinutesAgenda[]; needsClarification: string[] }
  | undefined;

/**
 * 회의록 AI 초안 — 문서를 만드는 입구가 아니라 상태를 바꾸는 입구라, 호출자를
 * 믿지 않고 여기서 다시 draft 여부를 검사한다(완성 후 재생성 금지 — 불변 원칙).
 * draft인 동안은 몇 번이든 다시 만들 수 있다(일일 한도 안에서). 성공하면
 * meta.minutes·meta.rawText를 저장하지만 문서 status는 그대로 draft다.
 */
export async function generateMinutes(
  _prev: GenerateMinutesState,
  formData: FormData,
): Promise<GenerateMinutesState> {
  const session = await requireMinutes();
  const tenantId = session.tenantId!;
  const docId = String(formData.get("docId") ?? "");
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "draft")
    return { error: "완성된 회의록은 다시 만들 수 없습니다." };

  if (!aiEnabled())
    return {
      error: "AI 초안은 준비 중입니다. 아래에서 직접 입력할 수 있습니다.",
    };

  const meta = doc.meta as MeetingMeta;
  if (meta.agenda.length === 0) return { error: "안건이 없습니다." };

  if (rateLimit(`minutes:${tenantId}`, DAILY_LIMIT, 24 * 60 * 60 * 1000) <= 0)
    return {
      error: `오늘 생성 한도(${DAILY_LIMIT}건)에 도달했습니다. 내일 다시 시도해 주세요.`,
    };

  const rawText = String(formData.get("rawText") ?? "");

  let result: { agendas: MinutesAgenda[]; needsClarification: string[] };
  try {
    result = await generateMinutesDraft({
      agenda: meta.agenda.map((a) => ({ order: a.order, title: a.title })),
      rawText,
      meetingLabel: doc.title,
    });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes("실패")
          ? e.message
          : "초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  await db.document.update({
    where: { id: doc.id },
    data: { meta: { ...meta, minutes: result.agendas, rawText } },
  });
  revalidatePath(`/modules/minutes/${doc.id}`);
  revalidatePath(`/modules/minutes/${doc.id}/edit`);
  return { agendas: result.agendas, needsClarification: result.needsClarification };
}

const MINUTES_DECISIONS = new Set<string>([...DECISIONS, "없음"]);

/** JSON에서 온 값을 0 이상 숫자 또는 null로 — 그 밖의 값(음수·문자열 등)은 "invalid" */
function readVotes(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

export type SaveMinutesState = { error?: string } | undefined;

/**
 * 회의록 손 입력·수정 저장 — LLM 없이도 전부 손으로 채울 수 있다(수용 기준 8).
 * 안건 목록(순서·제목)은 앵커라 서버가 meta.agenda에서 다시 채운다 —
 * 제출된 title은 신뢰하지 않는다. discussion 줄은 trim 후 빈 줄을 뺀다.
 */
export async function saveMinutesDraft(
  _prev: SaveMinutesState,
  formData: FormData,
): Promise<SaveMinutesState> {
  const session = await requireMinutes();
  const tenantId = session.tenantId!;
  const docId = String(formData.get("docId") ?? "");
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "draft")
    return { error: "완성된 회의록은 수정할 수 없습니다." };

  const meta = doc.meta as MeetingMeta;

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("agendas") ?? "[]"));
  } catch {
    return { error: "안건 정보를 읽을 수 없습니다." };
  }
  if (!Array.isArray(raw) || raw.length !== meta.agenda.length)
    return { error: "안건 개수가 맞지 않습니다." };

  const titleByOrder = new Map(meta.agenda.map((a) => [a.order, a.title]));
  const agendas: MinutesAgenda[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown> | null;
    const order = Number(e?.order);
    const title = titleByOrder.get(order);
    if (!e || !Number.isFinite(order) || title === undefined)
      return { error: "안건 정보를 읽을 수 없습니다." };

    const decision = String(e.decision ?? "");
    if (!MINUTES_DECISIONS.has(decision))
      return { error: "의결 결과 값이 올바르지 않습니다." };

    const discussion = Array.isArray(e.discussion)
      ? e.discussion.map((l) => String(l).trim()).filter(Boolean)
      : [];

    const votesFor = readVotes(e.votesFor);
    const votesAgainst = readVotes(e.votesAgainst);
    if (votesFor === "invalid" || votesAgainst === "invalid")
      return { error: "찬반 수는 0 이상의 숫자여야 합니다." };

    agendas.push({
      order,
      title,
      discussion,
      decision: decision as MinutesAgenda["decision"],
      votesFor,
      votesAgainst,
    });
  }
  // 순서 중복·누락 방어 — 길이만 맞고 같은 order가 두 번 오면 다른 안건이 빈다
  if (new Set(agendas.map((a) => a.order)).size !== meta.agenda.length)
    return { error: "안건 정보가 올바르지 않습니다." };
  agendas.sort((a, b) => a.order - b.order);

  await db.document.update({
    where: { id: doc.id },
    data: { meta: { ...meta, minutes: agendas } },
  });
  revalidatePath(`/modules/minutes/${doc.id}`);
  redirect(`/modules/minutes/${docId}`);
}
