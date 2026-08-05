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
