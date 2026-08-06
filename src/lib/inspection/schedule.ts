/**
 * 법정점검 주기 엔진 — 전부 순수 함수. 날짜 계산 오류가 곧 과태료인 모듈이라
 * 화면보다 먼저 테스트로 굳힌다(`npx tsx inspection.test.ts`).
 *
 * 다음 도래일은 **저장하지 않는다** — 열 때마다 여기서 계산한다. 저장하면 갱신
 * 크론이 필요해지고 어긋날 자리가 생긴다(체험 만료를 trialEndsAt 시점 비교로
 * 푼 것과 같은 판단). 전부 KST 기준: 법정 기한은 KST 벽시계다.
 */
import { ymdKst } from "@/lib/utils";
import type { Cycle } from "./catalog";

/** 판정에 필요한 최소 형태 — InspectionItem 행이 그대로 들어온다 */
export type ScheduleItem = {
  cycleType: string;
  cycleN?: number | null;
  leadDays: number;
  lastDoneAt: Date | null;
};

export type InspectionStatus = "ok" | "imminent" | "overdue" | "needsAnchor";

const pad = (n: number) => String(n).padStart(2, "0");

/** 주기 → 개월 수. YEARS는 n년(기본 1) */
function cycleMonths(cycleType: string, cycleN?: number | null): number {
  switch (cycleType) {
    case "MONTHLY":
      return 1;
    case "QUARTERLY":
      return 3;
    case "SEMIANNUAL":
      return 6;
    case "ANNUAL":
      return 12;
    case "YEARS":
      return 12 * (cycleN ?? 1);
    default:
      return 12; // 모르는 주기는 연 1회로 — 더 자주 안내하는 안전한 방향
  }
}

/**
 * "YYYY-MM-DD" + n개월 — 같은 날, 말일은 잘라 붙인다(1/31 + 1개월 = 2/28).
 * billing의 billingDay 교훈: 매달 +1개월로 이어 계산하면 날짜가 앞으로 밀리지만,
 * 여기는 항상 앵커(마지막 실시일)에서 한 번만 더하므로 누적 밀림이 없다.
 */
export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** 다음 도래일(KST YYYY-MM-DD) = 마지막 실시일 + 주기. 앵커가 없으면 null */
export function nextDue(item: ScheduleItem): string | null {
  if (!item.lastDoneAt) return null;
  return addMonthsYmd(
    ymdKst(item.lastDoneAt),
    cycleMonths(item.cycleType, item.cycleN),
  );
}

/** 도래일까지 남은 일수 (KST 자정 기준, 당일 0, 지났으면 음수) */
export function daysUntil(dueYmd: string, today: Date): number {
  const [y1, m1, d1] = dueYmd.split("-").map(Number);
  const [y2, m2, d2] = ymdKst(today).split("-").map(Number);
  return Math.round(
    (Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000,
  );
}

/**
 * 상태 판정 4종. 도래일 **당일까지는 imminent**(아직 할 수 있다), 다음 날부터 overdue.
 * lastDoneAt이 없으면 판정에서 빼지 않고 needsAnchor — 켜 놓고 기준일이 없으면
 * 주기를 셀 수 없다는 사실 자체를 알려야 한다(교육 크론의 hiredAt 규칙과 반대).
 */
export function statusOf(item: ScheduleItem, today: Date): InspectionStatus {
  const due = nextDue(item);
  if (!due) return "needsAnchor";
  const left = daysUntil(due, today);
  if (left < 0) return "overdue";
  if (left <= item.leadDays) return "imminent";
  return "ok";
}

/**
 * 크론 안내 회차 — "당일"이 아니라 "임계를 처음 넘긴 때"라 크론이 하루 빠져도
 * 안내가 사라지지 않는다(training의 dueMilestone과 같은 문법).
 * 임계값은 반드시 작은 것부터 — 큰 것부터 보면 D-7에도 D-30이 먼저 걸린다.
 * 지연(음수)은 회차가 아니라 별도 키(overdue)다 — null을 돌려준다.
 */
export function dueMilestone(
  daysLeft: number,
  leadDays: number,
): number | null {
  if (daysLeft < 0) return null;
  const milestones = [...new Set([7, leadDays])].sort((a, b) => a - b);
  return milestones.find((m) => daysLeft <= m) ?? null;
}

/**
 * 회차 키 — Notification.type으로 저장돼 같은 회차 중복 발송을 걸러낸다.
 * 도래일이 키에 들어가므로 기록을 남겨 도래일이 굴러가면 새 회차가 열린다.
 */
export function roundKey(
  itemId: string,
  dueYmd: string,
  tag: number | "overdue",
): string {
  return `inspection_${itemId}_${dueYmd}_${typeof tag === "number" ? `D${tag}` : "overdue"}`;
}

/** "YYYY-MM-DD" + n일 */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 이상 판정에 딸린 후속 조치 — 없으면 null */
export type FollowupAction = {
  title: string;
  dueYmd: string;
  /** 법이 정한 기한인가 — 화면·일지가 문구를 달리 쓴다 */
  legal: boolean;
  note: string;
};

/**
 * 판정 → 후속 조치 기한. 순수 함수(`npx tsx inspection.test.ts`).
 *
 * **이용금지는 법정 기한이다** — 어린이놀이시설 안전관리법 제15조: 안전점검 결과
 * 어린이에게 위해를 가할 우려가 있으면 이용을 금지하고 **1개월 이내**에
 * 안전검사기관에 안전진단을 신청해야 한다(해당 시설을 철거하는 경우는 생략).
 *
 * **요수리는 법에 기한이 없다** — 30일은 앱이 정한 기본값이고, 화면도 그렇게
 * 말한다(법 조문 해석은 코드가 하지 않는다 — 없는 기한을 법정 기한인 척하지 않는다).
 */
export function followupOf(result: string, doneAtYmd: string): FollowupAction | null {
  if (result === "이용금지")
    return {
      title: "안전진단 신청",
      dueYmd: addMonthsYmd(doneAtYmd, 1),
      legal: true,
      note: "이용금지 조치 후 1개월 이내에 안전검사기관에 안전진단을 신청해야 합니다 (어린이놀이시설 안전관리법 제15조). 해당 시설을 철거하는 경우에는 신청을 생략할 수 있습니다.",
    };
  if (result === "요수리")
    return {
      title: "수리·보수",
      dueYmd: addDaysYmd(doneAtYmd, 30),
      legal: false,
      note: "빠른 시일 안에 부품 교체·수리를 마쳐 주세요. 30일은 법정 기한이 아니라 이 앱이 잡아 둔 기본 기한입니다.",
    };
  return null;
}

/** 카탈로그 Cycle → InspectionItem 저장 형태 */
export function cycleToRow(cycle: Cycle): { cycleType: string; cycleN: number | null } {
  return { cycleType: cycle.type, cycleN: cycle.type === "YEARS" ? (cycle.n ?? 1) : null };
}
