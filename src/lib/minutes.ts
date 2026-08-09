import crypto from "node:crypto";

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
