import type { InspectionStatus } from "./schedule";

/** 급한 것부터 — 지연이 최상단, 그다음 임박, 기준일 필요, 정상 (현황판·기록 작성 공용) */
export const STATUS_RANK: Record<InspectionStatus, number> = {
  overdue: 0,
  imminent: 1,
  needsAnchor: 2,
  ok: 3,
};

export const STATUS_PILL: Record<InspectionStatus, { label: string; cls: string }> = {
  overdue: { label: "지연", cls: "bg-red-50 text-red-700" },
  imminent: { label: "임박", cls: "bg-amber-50 text-amber-700" },
  needsAnchor: { label: "기준일 필요", cls: "bg-gray-100 text-gray-600" },
  ok: { label: "정상", cls: "bg-emerald-50 text-emerald-700" },
};

/**
 * 점검 결과 판정의 색 — 이상 없음(정상·양호) / 주의·수리 / 이용금지 3축.
 * 이용금지를 요주의와 같은 앰버로 칠하면 "1개월 안에 안전진단"이라는 무게가 사라진다.
 * Tailwind는 클래스 이름을 조립할 수 없어 완성된 문자열로 들고 있는다.
 */
export const RESULT_TONE: Record<
  string,
  { pill: string; on: string; off: string }
> = {
  이용금지: {
    pill: "bg-red-50 text-red-700",
    on: "border-2 border-red-500 bg-red-50 text-red-700",
    off: "border border-gray-300 bg-card text-gray-500 hover:bg-gray-50",
  },
  warn: {
    pill: "bg-amber-50 text-amber-700",
    on: "border-2 border-amber-500 bg-amber-50 text-amber-700",
    off: "border border-gray-300 bg-card text-gray-500 hover:bg-gray-50",
  },
  ok: {
    pill: "bg-emerald-50 text-emerald-700",
    on: "border-2 border-emerald-500 bg-emerald-50 text-emerald-700",
    off: "border border-gray-300 bg-card text-gray-500 hover:bg-gray-50",
  },
};

export const toneOf = (result: string) =>
  RESULT_TONE[result] ??
  (result === "정상" || result === "양호" ? RESULT_TONE.ok : RESULT_TONE.warn);
