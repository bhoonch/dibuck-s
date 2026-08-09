"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignDocNo, createDocument } from "@/lib/documents";
import { isSubscribed } from "@/lib/modules";
import { rateLimit } from "@/lib/rate-limit";
import { aiEnabled, generateMinutesDraft } from "@/lib/minutes-ai";
import { newToken, reissueToken, tokenExpiry } from "@/lib/gian/approval";
import {
  DEFAULT_PLACES,
  DEFAULT_POST_TO,
  findNoticeFor,
  type NoticeDoc,
} from "@/lib/gian/notice";
import { mailerEnabled, sendSignatureRequest, trySend } from "@/lib/mailer";
import { ymdKst } from "@/lib/utils";
import type { ExternalApprover } from "@/lib/gian/rules";
import {
  DECISIONS,
  DEFAULT_NOTICE_DAYS,
  FOLLOWUPS,
  normalizeMinutesAgendas,
  type AnchorMismatch,
  type Attendee,
  type MeetingMeta,
  type MinutesAgenda,
} from "@/lib/minutes";

const MODULE_ID = "minutes";
const TYPE = "minutes";

/** 트랜잭션 안에서 조건부 쓰기가 빈손일 때 — 전체를 되돌리고 사용자 문구로 돌려준다 (approval.ts와 동형) */
class ActFailed extends Error {}

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

  // JSON 스키마는 형태만 강제한다 — 안건 개수·순서·제목이 입력 앵커와 같은지는
  // 여기서 다시 검사해야 한다(모델이 안건을 더하거나 빼거나 제목을 바꿀 수 있다).
  // saveMinutesDraft와 같은 정규화를 태워, 제목도 meta.agenda 기준으로 되돌린다.
  const validated = normalizeMinutesAgendas(result.agendas, meta.agenda);
  if ("fail" in validated)
    return { error: "AI 초안이 안건 구성과 맞지 않습니다. 다시 시도해 주세요." };

  // LLM 호출(수십 초) 동안 다른 탭이 완성·서명까지 끝낼 수 있다 — 그 사이 status가
  // draft를 벗어났으면 이 쓰기는 버린다. 무조건 update면 지연된 쓰기가 서명된
  // final 문서의 meta.minutes를 덮어써 서명 docHash와 문서가 어긋난다(증거력 붕괴).
  const updated = await db.document.updateMany({
    where: { id: doc.id, status: "draft" },
    data: { meta: { ...meta, minutes: validated.agendas, rawText } },
  });
  if (updated.count === 0)
    return { error: "완성된 회의록은 수정할 수 없습니다." };
  revalidatePath(`/modules/minutes/${doc.id}`);
  revalidatePath(`/modules/minutes/${doc.id}/edit`);
  return { agendas: validated.agendas, needsClarification: result.needsClarification };
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

  const result = normalizeMinutesAgendas(raw, meta.agenda);
  if ("fail" in result) {
    const messages: Record<AnchorMismatch, string> = {
      count: "안건 개수가 맞지 않습니다.",
      entry: "안건 정보를 읽을 수 없습니다.",
      decision: "의결 결과 값이 올바르지 않습니다.",
      votes: "찬반 수는 0 이상의 숫자여야 합니다.",
      duplicate: "안건 정보가 올바르지 않습니다.",
    };
    return { error: messages[result.fail] };
  }

  // 검사(위 status draft 확인)와 쓰기 사이 다른 탭이 완성·서명을 끝낼 수 있다 —
  // 조건부 updateMany로 그 경합을 다시 막는다(generateMinutes와 동형).
  const updated = await db.document.updateMany({
    where: { id: doc.id, status: "draft" },
    data: { meta: { ...meta, minutes: result.agendas } },
  });
  if (updated.count === 0)
    return { error: "완성된 회의록은 수정할 수 없습니다." };
  revalidatePath(`/modules/minutes/${doc.id}`);
  redirect(`/modules/minutes/${docId}`);
}

export type FinalizeResolutionInput = {
  order: number;
  title: string;
  decision: string;
  followupStatus: string;
  dueDate: string | null; // "YYYY-MM-DD" | null
  note: string;
};

/**
 * 완성 — 확인 화면(finalize-form.tsx)에서 사용자가 등록을 체크한 의결만 넘어온다.
 * 그래도 서버는 다시 검사한다: order는 meta.minutes에 실제로 있는 값만,
 * decision·followupStatus는 각 상수 집합 안의 값만, title은 필수(trim).
 * 번호 부여(멱등)가 먼저다: 여기서 실패해도 초안으로 남아 다시 누르면 되지만,
 * 확정부터 하면 번호 없는 완성본이 남는다(notice finalizeNoticePost와 동일 이유).
 */
export async function finalizeMinutes(
  docId: string,
  resolutions: FinalizeResolutionInput[],
): Promise<{ error?: string } | void> {
  const session = await requireMinutes();
  const tenantId = session.tenantId!;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "draft")
    return { error: "이미 완성됐거나 폐기된 회의록입니다." };

  const meta = doc.meta as MeetingMeta;
  if (!meta.minutes?.length)
    return { error: "회의록을 작성한 뒤 완성할 수 있습니다." };
  const orderSet = new Set((meta.minutes ?? []).map((a) => a.order));
  const decisionSet = new Set<string>(DECISIONS);
  const followupSet = new Set<string>(FOLLOWUPS);
  const rows: {
    tenantId: string;
    meetingDocId: string;
    order: number;
    title: string;
    decision: string;
    followupStatus: string;
    dueDate: Date | null;
    note: string | null;
  }[] = [];
  for (const r of resolutions) {
    if (!orderSet.has(r.order)) return { error: "안건 정보가 올바르지 않습니다." };
    const title = String(r.title ?? "").trim();
    if (!title) return { error: "의결사항 제목을 입력해 주세요." };
    if (!decisionSet.has(r.decision))
      return { error: "의결 결과 값이 올바르지 않습니다." };
    if (!followupSet.has(r.followupStatus))
      return { error: "후속 조치 값이 올바르지 않습니다." };
    if (r.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate))
      return { error: "기한 형식이 올바르지 않습니다." };
    rows.push({
      tenantId,
      meetingDocId: doc.id,
      order: r.order,
      title,
      decision: r.decision,
      followupStatus: r.followupStatus,
      dueDate: r.dueDate ? new Date(`${r.dueDate}T00:00:00+09:00`) : null,
      note: r.note?.trim() || null,
    });
  }

  await assignDocNo(doc); // 멱등 — 실패하면 초안으로 남아 다시 누르면 된다
  try {
    await db.$transaction(async (tx) => {
      // 완성 자리를 먼저 잡는다 — 동시 더블클릭이 Resolution을 두 벌 만들면 안 된다
      const claimed = await tx.document.updateMany({
        where: { id: doc.id, status: "draft" },
        data: { status: "final" },
      });
      if (claimed.count === 0) throw new ActFailed("이미 완성 처리되었습니다.");
      if (rows.length > 0) await tx.resolution.createMany({ data: rows });
    });
  } catch (e) {
    if (e instanceof ActFailed) return { error: e.message };
    throw e;
  }
  revalidatePath(`/modules/minutes/${docId}`);
  revalidatePath("/modules/minutes");
}

/**
 * 폐기 — notice voidNoticePost와 같은 규칙. docNo 없는 초안(한 번도 완성되지
 * 않음)은 흔적 없이 삭제(이 시점엔 Resolution이 아직 없다 — 완성 때만 만들어진다.
 * ApprovalStep·첨부는 onDelete: Cascade). 완성본은 상태만 바꾼다 —
 * Resolution은 지우지 않는다. 의결은 유효, 문서만 폐기한다.
 */
export async function voidMinutes(docId: string) {
  const session = await requireMinutes();
  const tenantId = session.tenantId!;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (!doc.docNo) {
    await db.document.delete({ where: { id: doc.id } });
  } else {
    await db.document.updateMany({
      where: { id: doc.id, status: { not: "void" } },
      data: { status: "void" },
    });
  }
  revalidatePath("/modules/minutes");
  redirect("/modules/minutes");
}

/**
 * 서명 요청 — 완성(final) 회의록에서 한 번만. 결재(순차)와 달리 참석자 전원이
 * 동시에 pending + 각자 토큰을 받는다(병렬). 이미 스텝이 있으면 거부하고,
 * 개별 재발급은 아래 reissueSignToken(스텝 단위, gian의 reissueToken 재사용)이 맡는다.
 */
export async function requestSignatures(
  docId: string,
): Promise<{ error?: string } | void> {
  const session = await requireMinutes();
  const tenantId = session.tenantId!;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "final")
    return { error: "완성된 회의록만 서명을 요청할 수 있습니다." };

  const meta = doc.meta as MeetingMeta;
  const present = meta.attendees.filter((a) => a.present);
  if (present.length === 0) return { error: "참석자가 없습니다." };

  const already = await db.approvalStep.count({ where: { documentId: doc.id } });
  if (already > 0) return { error: "이미 서명을 요청했습니다." };

  try {
    await db.approvalStep.createMany({
      data: present.map((a, i) => ({
        documentId: doc.id,
        order: i + 1,
        name: a.name,
        externalRole: a.role === "ETC" ? null : a.role, // 표시용 — 판정에 안 쓴다
        status: "pending",
        token: newToken(),
        tokenExpiresAt: tokenExpiry(),
      })),
    });
  } catch (e) {
    // 동시 요청 경합 — @@unique([documentId, order]) 충돌
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002")
      return { error: "이미 서명을 요청했습니다." };
    throw e;
  }

  // 메일은 실패해도 흐름을 막지 않는다 — 링크 복사가 기본 전달 수단
  if (mailerEnabled()) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, externalApprovers: true },
    });
    const approvers =
      (tenant?.externalApprovers as ExternalApprover[] | null) ?? [];
    const steps = await db.approvalStep.findMany({ where: { documentId: doc.id } });
    for (const step of steps) {
      const person = approvers.find((e) => e.name === step.name);
      if (person?.email && step.token && tenant)
        await trySend(() =>
          sendSignatureRequest(
            person.email!,
            step.name,
            tenant.name,
            doc.title,
            step.token!,
          ),
        );
    }
  }

  revalidatePath(`/modules/minutes/${docId}`);
}

/** 서명 링크 재발급 — 스텝 단위. gian의 reissueToken을 그대로 쓴다(조건이 그대로 맞는다) */
export async function reissueSignToken(
  stepId: string,
): Promise<{ error?: string; token?: string }> {
  const session = await requireMinutes();
  const step = await db.approvalStep.findFirst({
    where: {
      id: stepId,
      document: { tenantId: session.tenantId!, type: TYPE, moduleId: MODULE_ID },
    },
  });
  if (!step) return { error: "단계를 찾을 수 없습니다." };

  const result = await reissueToken(stepId);
  if ("error" in result) return result;
  revalidatePath(`/modules/minutes/${step.documentId}`);
  return result;
}

/**
 * 의결사항 후속 상태 변경 — 대장(resolutions)에서 행마다 한 클릭. FOLLOWUPS 전체를
 * 허용한다("없음"으로 되돌리기도 실무에 있다 — 잘못 등록한 후속 필요 표시 해제).
 * tenantId를 updateMany where에 반드시 넣는다 — 남의 단지 의결을 못 바꾼다.
 */
export async function setResolutionStatus(
  id: string,
  status: (typeof FOLLOWUPS)[number],
): Promise<{ error?: string } | void> {
  const session = await requireMinutes();
  const tenantId = session.tenantId!;
  if (!(FOLLOWUPS as readonly string[]).includes(status))
    return { error: "후속 조치 값이 올바르지 않습니다." };

  const resolution = await db.resolution.findFirst({
    where: { id, tenantId },
    select: { meetingDocId: true },
  });
  if (!resolution) return { error: "의결사항을 찾을 수 없습니다." };

  await db.resolution.updateMany({
    where: { id, tenantId },
    data: { followupStatus: status },
  });
  revalidatePath("/modules/minutes/resolutions");
  revalidatePath("/modules/minutes");
  revalidatePath(`/modules/minutes/${resolution.meetingDocId}`);
}

/**
 * 의결 공고문 파생 — gian의 결재 완료 → 공고문 파생(createNoticeFrom)과 동형·결정적 코드.
 * 게이트: 완성(final) + 의결 1건 이상. 이미 파생됐으면(findNoticeFor) 그 문서로 안내한다
 * (재생성이 아니다 — 공고문은 결정적 코드 산출물이라 손으로 못 고치고, 다시 만드는 게
 * 유일한 복구다. 그래도 여기선 있으면 그냥 보여주기만 한다).
 * moduleId는 원본과 같은 "minutes"를 쓴다 — [docId] 화면이 type "notice"도 함께 연다.
 * 파생 실패가 완성을 롤백하지 않는다: 완성은 이미 끝난 일이고, 공고는 언제든 다시 누른다.
 */
export async function createResolutionNotice(
  docId: string,
): Promise<{ error?: string } | void> {
  const session = await requireMinutes();
  const tenantId = session.tenantId!;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "final")
    return { error: "완성된 회의록만 공고문을 만들 수 있습니다." };

  const meta = doc.meta as MeetingMeta;

  const existing = await findNoticeFor(doc.id);
  if (existing) {
    if (meta.noticeDocId !== existing.id)
      await db.document.update({
        where: { id: doc.id },
        data: { meta: { ...meta, noticeDocId: existing.id } },
      });
    redirect(`/modules/minutes/${existing.id}`);
  }

  const resolutions = await db.resolution.findMany({
    where: { meetingDocId: doc.id, tenantId },
    orderBy: { order: "asc" },
  });
  if (resolutions.length === 0)
    return { error: "의결사항이 없어 공고문을 만들 수 없습니다." };

  // 찬반 수는 Resolution에 없다(후속 조치 대장은 표결 수를 안 쓴다) — meta.minutes에서 order로 되찾는다
  const votesByOrder = new Map((meta.minutes ?? []).map((a) => [a.order, a]));
  const [ymd] = meta.meetingAt.split(" ");
  const [y, m, d] = ymd.split("-");
  const meetingAtDisplay = `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;

  const notice: NoticeDoc = {
    kind: "공 고 문",
    place: DEFAULT_PLACES.join(", "),
    // 게시 시작일 = 지금(파생 시점). gian 공고문의 postFrom(approvedAt)과 다른 판단이다 —
    // 결재 파생은 "결재된 날"이 곧 시행 근거일이지만, 의결 공고는 "결정된 날"이 아니라
    // "게시하는 날"부터 효력이 있다. 완성 시점을 따로 저장하지 않으므로 지금이 가장 정직하다.
    postFrom: ymdKst(new Date()),
    postTo: DEFAULT_POST_TO,
    title: `제${meta.meetingNo}차 입주자대표회의 의결사항 공고`,
    intro: `제${meta.meetingNo}차 입주자대표회의(${meetingAtDisplay})에서 다음과 같이 의결되었음을 공고합니다.`,
    rows: resolutions.map((r) => {
      const a = votesByOrder.get(r.order);
      const votes =
        a && (a.votesFor !== null || a.votesAgainst !== null)
          ? `(찬성 ${a.votesFor ?? 0}, 반대 ${a.votesAgainst ?? 0})`
          : "";
      return { k: `제${r.order}호 안건`, v: `${r.title} ${r.decision}${votes}` };
    }),
    notes: [{ text: "회의록은 관리사무소에 보관되어 있습니다." }],
  };

  let created;
  try {
    created = await createDocument({
      tenantId,
      moduleId: MODULE_ID,
      type: "notice",
      title: notice.title,
      // 문서함 검색용 평문 — 화면 렌더는 meta.notice가 담당한다
      content: [
        notice.intro,
        ...notice.rows.map((r) => `${r.k}: ${r.v}`),
        ...notice.notes.map((n) => n.text),
      ].join("\n"),
      meta: { sourceDocId: doc.id, notice },
      status: "final",
      createdById: session.userId,
      sourceDocId: doc.id, // @@unique([type, sourceDocId])가 동시 파생을 막는다
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      // 동시 파생의 진 쪽 — 이긴 쪽이 이미 만들었으니 그 문서로 안내한다
      const won = await findNoticeFor(doc.id);
      if (won) redirect(`/modules/minutes/${won.id}`);
      return { error: "이미 공고문이 만들어졌습니다." };
    }
    throw e;
  }

  await db.document.update({
    where: { id: doc.id },
    data: { meta: { ...meta, noticeDocId: created.id } },
  });
  revalidatePath(`/modules/minutes/${docId}`);
  revalidatePath("/modules/minutes");
  redirect(`/modules/minutes/${created.id}`);
}
