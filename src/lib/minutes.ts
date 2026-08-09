import crypto from "node:crypto";

// 서버 전용 — node:crypto 때문에 클라이언트 컴포넌트에서 import 금지.
// 클라이언트가 타입이 필요하면 `import type`으로만 가져올 것.

export const DECISIONS = ["가결", "부결", "보류"] as const;
export const FOLLOWUPS = ["없음", "이행중", "완료"] as const;
export const DEFAULT_NOTICE_DAYS = 5;

export type Attendee = {
  role: string; // "CHAIR" | "AUDITOR" | "ETC"
  label: string; // 표시 직함 — approverRoleLabel 결과 스냅샷
  name: string;
  present: boolean;
};
export type AgendaItem = {
  order: number;
  title: string;
  fromResolutionId?: string; // 전차 의결 이행 보고 안건이면 그 Resolution id
};
export type MinutesAgenda = {
  order: number;
  title: string;
  discussion: string[]; // 논의 요지 개조식
  decision: (typeof DECISIONS)[number] | "없음"; // "없음" = 의결 없는 보고 안건
  votesFor: number | null;
  votesAgainst: number | null;
};
export type MeetingMeta = {
  meetingNo: number; // 제N차
  meetingAt: string; // "YYYY-MM-DD HH:mm"
  place: string;
  noticeDays: number; // 소집 통지 기한(일) — 관리규약 값, 판정 안 함
  attendees: Attendee[]; // 명부 스냅샷 (증빙 원칙 — 명부를 고쳐도 지난 회의록 불변)
  agenda: AgendaItem[];
  minutes?: MinutesAgenda[]; // LLM 초안 + 사용자 수정본
  rawText?: string; // 붙여넣은 원 메모 (재생성 재료)
  noticeDocId?: string; // 파생 의결 공고문 역링크
};

/** 미완료 의결 → 다음 회의 "이행 보고" 안건 자동 제안. 회의 준비 야근을 없애는 핵심 장치 */
export function proposeAgenda(
  unresolved: { id: string; title: string; meetingDocNo: string | null }[],
  existingCount: number,
): AgendaItem[] {
  return unresolved.map((r, i) => ({
    order: existingCount + i + 1,
    title: `전차 의결 이행 보고: ${r.title}${r.meetingDocNo ? ` (${r.meetingDocNo})` : ""}`,
    fromResolutionId: r.id,
  }));
}

/**
 * 서명 토큰 판정 — 결재(tokenState)와 두 가지가 다르다:
 * ① 병렬: 모든 스텝이 동시에 pending, 순서 없음. ② 완성(final) 문서에서만 서명한다
 * (결재는 pending 문서). 반려가 없다 — 서명하지 않으면 그냥 빈칸(자필란)으로 남는다.
 * fail-closed: 모르는 상태는 전부 invalid.
 */
export function signTokenState(
  step: { status: string; token: string | null; tokenExpiresAt: Date | null } | null,
  docStatus: string | undefined,
  now = new Date(),
): "valid" | "expired" | "done" | "invalid" {
  if (!step || !step.token) return "invalid";
  if (step.status === "approved") return "done";
  if (step.status !== "pending" || docStatus !== "final") return "invalid";
  if (!step.tokenExpiresAt || step.tokenExpiresAt <= now) return "expired";
  return "valid";
}

/**
 * 서명 시점 문서 버전 해시(증거력 장치 ①). 필드를 명시적으로 고른다 —
 * meta 전체를 넣으면 서명 뒤 공고문 파생(noticeDocId)이 해시를 깨뜨려
 * "서명 후 문서가 바뀌었다"는 거짓 신호가 된다.
 */
export function minutesHash(
  title: string,
  meta: Pick<MeetingMeta, "meetingNo" | "meetingAt" | "place" | "attendees" | "agenda"> &
    { minutes?: MinutesAgenda[]; noticeDocId?: string },
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([
      title, meta.meetingNo, meta.meetingAt, meta.place, meta.attendees, meta.agenda, meta.minutes ?? null,
    ]))
    .digest("hex");
}

/** 소집 통지 시한 — 회의일에서 noticeDays를 뺀 날짜(YYYY-MM-DD). 판정은 안 한다 */
export function noticeDueYmd(meetingAt: string, noticeDays: number): string {
  const d = new Date(`${meetingAt.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - noticeDays);
  return d.toISOString().slice(0, 10);
}

/** 전원 서명 판정 — 스텝 0개는 "요청 전"이지 완료가 아니다 */
export function signProgress(steps: { status: string }[]) {
  const signed = steps.filter((s) => s.status === "approved").length;
  return { signed, total: steps.length, allSigned: steps.length > 0 && signed === steps.length };
}

/** JSON에서 온 값을 0 이상 숫자 또는 null로 — 그 밖의 값(음수·문자열 등)은 "invalid" */
function readVotes(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

export type AnchorMismatch = "count" | "entry" | "decision" | "votes" | "duplicate";

/**
 * 회의록 안건 배열을 meta.agenda(앵커)에 맞춰 검증·정규화한다. 손 입력 저장
 * (saveMinutesDraft)과 LLM 초안(generateMinutes) 둘 다 이걸 거친다 — LLM
 * 출력도 스키마가 형태만 강제할 뿐 안건 개수·순서·제목 동일성은 보장하지
 * 않으므로, 저장 전 여기서 다시 앵커와 대조한다.
 * 제목은 항상 meta.agenda에서 order로 재유도한다 — 제출된(모델이든 클라이언트든)
 * title은 신뢰하지 않는다. 개수·order 집합이 meta.agenda와 다르면 거부한다.
 */
export function normalizeMinutesAgendas(
  raw: unknown,
  agenda: AgendaItem[],
): { agendas: MinutesAgenda[] } | { fail: AnchorMismatch } {
  if (!Array.isArray(raw) || raw.length !== agenda.length) return { fail: "count" };

  const titleByOrder = new Map(agenda.map((a) => [a.order, a.title]));
  const decisionValues = new Set<string>([...DECISIONS, "없음"]);
  const agendas: MinutesAgenda[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown> | null;
    const order = Number(e?.order);
    const title = titleByOrder.get(order);
    if (!e || !Number.isFinite(order) || title === undefined) return { fail: "entry" };

    const decision = String(e.decision ?? "");
    if (!decisionValues.has(decision)) return { fail: "decision" };

    const discussion = Array.isArray(e.discussion)
      ? e.discussion.map((l) => String(l).trim()).filter(Boolean)
      : [];

    const votesFor = readVotes(e.votesFor);
    const votesAgainst = readVotes(e.votesAgainst);
    if (votesFor === "invalid" || votesAgainst === "invalid") return { fail: "votes" };

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
  if (new Set(agendas.map((a) => a.order)).size !== agenda.length) return { fail: "duplicate" };
  agendas.sort((a, b) => a.order - b.order);
  return { agendas };
}
