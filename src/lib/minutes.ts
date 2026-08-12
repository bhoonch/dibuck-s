import crypto from "node:crypto";

// 서버 전용 — node:crypto 때문에 클라이언트 컴포넌트에서 import 금지.
// 클라이언트가 타입이 필요하면 `import type`으로만 가져올 것.

export const DECISIONS = ["가결", "부결", "보류"] as const;
export const MEETING_KINDS = ["정기", "임시"] as const;
/** 준칙 별첨3 서식의 회의 진행순서 예시. 단지별 편집은 요청이 나오면 받는다 */
export const AGENDA_STEPS = ["개회선언", "국민의례", "안건 상정 및 토의", "폐회"];
export const FOLLOWUPS = ["없음", "이행중", "완료"] as const;
export const DEFAULT_NOTICE_DAYS = 5;

export type Attendee = {
  role: string; // "CHAIR" | "AUDITOR" | "ETC"
  label: string; // 표시 직함 — approverRoleLabel 결과 스냅샷
  name: string;
  present: boolean;
  dong?: string; // 선거구 동 — 준칙 서명표의 '동' 칸. 명부에 없으면 빈칸으로 인쇄된다
};

/** 발언 한 건 — 준칙 별첨3 제3호서식이 `발언자 | 발언 내용` 2열 표라 발언자를 분리해 받는다 */
export type Speech = { speaker: string; text: string };

/** 안건별 표결 — 준칙은 인원수가 아니라 찬성자·반대자·기권자 **성명**을 요구한다 */
export type Votes = { for: string[]; against: string[]; abstain: string[] };

/** 입찰·비교 안건의 견적 한 건 — 회의록 심의표 안에 비교표로 인쇄된다 */
export type Quote = { vendor: string; amount: number | null; note: string };
export type AgendaItem = {
  order: number;
  title: string;
  fromResolutionId?: string; // 전차 의결 이행 보고 안건이면 그 Resolution id
};
export type MinutesAgenda = {
  order: number;
  title: string;
  /** 발언 요지. 이 모듈 이전에 완성된 회의록은 발언자 없는 string이라 두 모양을 다 받는다 */
  discussion: (string | Speech)[];
  decision: (typeof DECISIONS)[number] | "없음"; // "없음" = 의결 없는 보고 안건
  /** 표결자 성명. 인원수는 여기서 파생한다 — 숫자를 따로 저장하면 성명과 어긋난다 */
  votes?: Votes;
  /** 견적 비교표(입찰 안건). 금액은 사람이 입력한다 — LLM은 견적을 출력하지 않는다(표결과 같은 이유) */
  quotes?: Quote[];
  /** votes 도입 전 회의록의 인원수. 새로 저장하는 회의록은 votes만 쓴다 */
  votesFor: number | null;
  votesAgainst: number | null;
};

/** 발언 한 줄을 표시용으로 — 레거시 string은 발언자 없는 발언으로 흡수한다 */
export function toSpeech(l: string | Speech): Speech {
  return typeof l === "string" ? { speaker: "", text: l } : l;
}

/** 표결 인원수 — votes가 있으면 성명 배열 길이가 진실, 없으면 레거시 숫자 */
export function voteCounts(a: MinutesAgenda) {
  if (a.votes)
    return {
      for: a.votes.for.length,
      against: a.votes.against.length,
      abstain: a.votes.abstain.length,
    };
  return { for: a.votesFor ?? 0, against: a.votesAgainst ?? 0, abstain: 0 };
}
export type MeetingMeta = {
  meetingNo: number; // 제N차
  meetingAt: string; // "YYYY-MM-DD HH:mm"
  closedAt?: string; // 폐회 시각 "HH:mm" — 준칙 서식은 개회~폐회 범위를 적는다
  kind?: (typeof MEETING_KINDS)[number]; // 정기/임시 — 준칙 서식의 "회의구분"
  place: string;
  /**
   * 관리규약이 정한 입주자대표회의 정원. 회의마다 스냅샷으로 남긴다 —
   * 명부(externalApprovers)는 나중에 바뀌지만 지난 회의록의 성원보고는 불변이어야
   * 한다(attendees 스냅샷과 같은 원칙). 규약 값이라 코드가 유도하지 않는다.
   */
  boardSeats?: number;
  writerName?: string; // 회의록 작성자 — 준칙상 작성 책임은 회장에게 있다
  observers?: string[]; // 배석자(관리사무소장 등) — 참석자와 구분해 적는다
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
  meta: Pick<
    MeetingMeta,
    "meetingNo" | "meetingAt" | "place" | "attendees" | "agenda"
  > &
    Partial<
      Pick<MeetingMeta, "kind" | "closedAt" | "boardSeats" | "writerName" | "observers">
    > & { minutes?: MinutesAgenda[]; noticeDocId?: string },
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([
      title, meta.meetingNo, meta.meetingAt, meta.place, meta.attendees, meta.agenda, meta.minutes ?? null,
      // 성원보고·회의구분도 서명 대상 내용이다 — 빠지면 서명 뒤 정족수를 고쳐도 해시가 안 깨진다.
      // 표결 성명은 meta.minutes 안(agenda.votes)이라 이미 포함된다.
      meta.kind ?? null, meta.closedAt ?? null, meta.boardSeats ?? null,
      meta.writerName ?? null, meta.observers ?? null,
    ]))
    .digest("hex");
}

/**
 * 공개용 성명 마스킹(서울 준칙 제43조⑤ — 공개 시 성명 비식별).
 * 성만 남기고 전부 ○ — 공공기관 공개 문서의 비식별 관행("박○○")이다.
 * 가운데만 가리는 언론식("박○동")은 동대표 명단처럼 좁은 모집단에서 특정된다.
 * 복성(남궁 등)은 판별하지 않고 첫 글자만 남긴다 — 더 가려지는 쪽의 오차라 안전하다.
 */
export function maskName(name: string): string {
  const n = name.trim();
  if (n.length <= 1) return n;
  return n[0] + "○".repeat(n.length - 1);
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

/**
 * 성원보고 — 준칙 별첨3 제1호서식의 `총정원·미선출·구성원·의결정족수·참석·불참` 칸.
 *
 * 계산 근거는 두 조문의 명문이다(해석이 아니다):
 * - 영 제4조제3항 — 구성원은 관리규약이 정한 정원. 단 **정원의 3분의 2 이상이
 *   선출되었을 때에는 그 선출된 인원**.
 * - 영 제14조제1항 — 입주자대표회의는 **구성원 과반수의 찬성**으로 의결한다.
 *   출석 과반수가 아니다.
 *
 * required는 제안값일 뿐 가결·부결을 단정하지 않는다 — 관리규약이 특정 안건에 더
 * 엄격한 정족수를 정할 수 있다(법 해석은 코드가 하지 않는다).
 * seats가 없으면(규약 정원 미입력) 선출 인원을 정원으로 본다 — 미선출 0명 가정이다.
 */
export function quorum(
  seats: number | null | undefined,
  electedCount: number,
  presentCount: number,
) {
  const total = seats && seats > 0 ? seats : electedCount;
  const members =
    electedCount >= Math.ceil((total * 2) / 3) ? electedCount : total;
  return {
    seats: total,
    unfilled: Math.max(0, total - electedCount),
    members,
    required: Math.floor(members / 2) + 1,
    present: presentCount,
    absent: Math.max(0, electedCount - presentCount),
  };
}

/** JSON에서 온 값을 0 이상 숫자 또는 null로 — 그 밖의 값(음수·문자열 등)은 "invalid" */
function readVotes(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

export type AnchorMismatch =
  | "count"
  | "entry"
  | "decision"
  | "votes"
  | "duplicate"
  | "voter"
  | "quote";

/**
 * 견적 비교표 검증 — 업체명 없는 행은 버리고, 금액은 0 이상 숫자 또는 null만.
 * 회의록에 인쇄되는 돈이라 이상한 값(음수·문자열)은 조용히 고치지 않고 거부한다.
 */
function readQuotes(v: unknown): Quote[] | null | "invalid" {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return "invalid";
  const quotes: Quote[] = [];
  for (const raw of v) {
    const q = raw as Record<string, unknown> | null;
    const vendor = String(q?.vendor ?? "").trim();
    if (!vendor) continue; // 업체명 없는 빈 행 — 입력 중 남은 껍데기
    const amount = readVotes(q?.amount); // 0 이상 숫자 또는 null — 표결 수와 같은 규칙
    if (amount === "invalid") return "invalid";
    quotes.push({ vendor, amount, note: String(q?.note ?? "").trim() });
  }
  return quotes.length > 0 ? quotes : null;
}

/**
 * 표결 성명 검증 — 준칙이 요구하는 찬성자·반대자·기권자 성명을 참석자 명부와 대조한다.
 * 명부 밖 이름과 한 사람의 중복 배정(찬성이면서 반대)을 둘 다 막는다.
 * 셋 다 비어 있으면(표결 없는 보고 안건) votes 자체를 남기지 않는다.
 */
function readVotes3(v: unknown, presentNames: string[]): Votes | null | "invalid" {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return "invalid";
  const src = v as Record<string, unknown>;
  const roster = new Set(presentNames);
  const seen = new Set<string>();
  const bucket = (key: "for" | "against" | "abstain") => {
    const arr = src[key];
    if (arr === undefined || arr === null) return [];
    if (!Array.isArray(arr)) return null;
    const names: string[] = [];
    for (const raw of arr) {
      const name = String(raw).trim();
      // 명부 밖 이름은 거부한다 — LLM이든 클라이언트든 없는 사람을 표결에 넣을 수 없다
      if (!name || !roster.has(name) || seen.has(name)) return null;
      seen.add(name);
      names.push(name);
    }
    return names;
  };
  const f = bucket("for");
  const a = bucket("against");
  const b = bucket("abstain");
  if (f === null || a === null || b === null) return "invalid";
  if (f.length + a.length + b.length === 0) return null;
  return { for: f, against: a, abstain: b };
}

/**
 * AI가 제안한 표결·견적을 명부·형식 기준으로 걸러낸다 — 원칙은 "AI는 제안만".
 * normalizeMinutesAgendas는 위반을 **거부**하지만, AI 제안의 위반(명부 밖 이름,
 * 이상한 금액)은 초안 전체를 버릴 이유가 아니다 — 그 제안만 조용히 떨군다.
 */
export function sanitizeAiSuggestions(
  agendas: MinutesAgenda[],
  roster: string[],
): MinutesAgenda[] {
  const names = new Set(roster);
  return agendas.map((a) => {
    let votes: Votes | undefined;
    if (a.votes && typeof a.votes === "object") {
      const seen = new Set<string>();
      const bucket = (arr: unknown) =>
        (Array.isArray(arr) ? arr : [])
          .map((n) => String(n).trim())
          .filter((n) => n && names.has(n) && !seen.has(n) && (seen.add(n), true));
      const v = {
        for: bucket(a.votes.for),
        against: bucket(a.votes.against),
        abstain: bucket(a.votes.abstain),
      };
      if (v.for.length + v.against.length + v.abstain.length > 0) votes = v;
    }
    // 의결이 없는 안건의 표결 제안은 버린다 — 화면도 저장도 decision과 짝으로 다룬다
    if (a.decision === "없음") votes = undefined;
    const quotes = (Array.isArray(a.quotes) ? a.quotes : [])
      .map((q) => ({
        vendor: String(q?.vendor ?? "").trim().slice(0, 50),
        amount:
          q?.amount != null && Number.isFinite(Number(q.amount)) && Number(q.amount) >= 0
            ? Number(q.amount)
            : null,
        note: String(q?.note ?? "").trim().slice(0, 50),
      }))
      .filter((q) => q.vendor)
      .slice(0, 10);
    return {
      ...a,
      votes,
      quotes: quotes.length > 0 ? quotes : undefined,
    };
  });
}

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
  /** 참석자 성명 — 표결자가 이 안에 있는지 대조한다. 빈 배열이면 표결 성명을 못 쓴다 */
  presentNames: string[] = [],
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

    // 발언은 항상 { speaker, text }로 정규화해 저장한다 — 레거시 string 입력은
    // 발언자 없는 발언으로 흡수한다(준칙 제3호서식의 발언자 칸이 빈칸으로 나온다).
    const discussion = Array.isArray(e.discussion)
      ? e.discussion
          .map((l) => {
            const sp = toSpeech(
              typeof l === "string" ? l : (l as Speech) ?? "",
            );
            return {
              speaker: String(sp.speaker ?? "").trim(),
              text: String(sp.text ?? "").trim(),
            };
          })
          .filter((sp) => sp.text)
      : [];

    const votes = readVotes3(e.votes, presentNames);
    if (votes === "invalid") return { fail: "voter" };

    const quotes = readQuotes(e.quotes);
    if (quotes === "invalid") return { fail: "quote" };

    const votesFor = readVotes(e.votesFor);
    const votesAgainst = readVotes(e.votesAgainst);
    if (votesFor === "invalid" || votesAgainst === "invalid") return { fail: "votes" };

    agendas.push({
      order,
      title,
      discussion,
      decision: decision as MinutesAgenda["decision"],
      // 성명이 있으면 그것만 남긴다 — 숫자를 같이 저장하면 둘이 어긋날 자리가 생긴다.
      // 인원수가 필요한 곳은 voteCounts()로 배열 길이에서 파생한다.
      ...(votes ? { votes } : {}),
      ...(quotes ? { quotes } : {}),
      votesFor: votes ? null : votesFor,
      votesAgainst: votes ? null : votesAgainst,
    });
  }
  // 순서 중복·누락 방어 — 길이만 맞고 같은 order가 두 번 오면 다른 안건이 빈다
  if (new Set(agendas.map((a) => a.order)).size !== agenda.length) return { fail: "duplicate" };
  agendas.sort((a, b) => a.order - b.order);
  return { agendas };
}
