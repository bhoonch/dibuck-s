/**
 * 청구 계산 — DB·네트워크 없이 검증되도록 순수 함수만 둔다.
 * 검증: `npx tsx billing.test.ts`
 *
 * 청구 모델: **단지당 월 1회 통합 청구.** 그 시점에 유료인 모듈의 가격 합.
 *
 * 일할(proration) 계산은 일부러 넣지 않았다 — 모듈을 새로 구독하면 체험이 자동으로
 * 시작되므로(단지×모듈 최초 1회) 중도 추가분은 체험 기간이 곧 유예가 된다.
 * ponytail: 체험을 이미 쓴 모듈을 재구독하면 다음 청구일까지 최대 한 달이 무료다.
 * 재구독 빈도가 의미 있게 늘면 그때 일할을 넣을 것.
 */
import { kstDayStart, ymdKst } from "@/lib/utils";

/** 결제 실패 후 서비스를 계속 쓸 수 있는 기간. 넘기면 SUSPENDED */
export const GRACE_DAYS = 7;

/** 갱신 예고 메일을 보내는 날 (청구일까지 남은 일수) */
export const RENEWAL_NOTICE_DAYS = [7, 1];

export type BillingItem = { moduleId: string; name: string; price: number };

/** 청구 대상 = 구독 중이면서 체험이 아닌 모듈. 체험 중인 모듈은 이번 청구에서 빠진다. */
export function billableItems(
  modules: {
    id: string;
    name: string;
    price: number;
    status: string;
    trialEndsAt: Date | null;
  }[],
  now = new Date(),
): BillingItem[] {
  return modules
    .filter(
      (m) =>
        m.status === "ACTIVE" &&
        (!m.trialEndsAt || m.trialEndsAt <= now), // 체험 중(미래)이면 제외
    )
    .map((m) => ({ moduleId: m.id, name: m.name, price: m.price }));
}

export const totalAmount = (items: BillingItem[]) =>
  items.reduce((sum, i) => sum + i.price, 0);

/** 해당 연·월의 말일 (m은 1~12) */
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * `from`의 다음 달 `day`일 00:00(KST). 그 달에 `day`일이 없으면 말일로 자른다.
 * 31일 가입자가 2월에 28일로 잘려도 기준일(31)은 그대로라 3월엔 다시 31일에 청구된다.
 */
export function nextBillingDate(from: Date, day: number): Date {
  const [y, m] = ymdKst(from).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return kstDayStart(ymd(ny, nm, Math.min(day, lastDayOf(ny, nm))));
}

/** 그 날짜의 KST 00:00 — 청구일 비교는 시각이 아니라 날짜 단위다 */
export const kstMidnight = (d: Date) => kstDayStart(ymdKst(d));

/** KST 날짜 기준 경과 일수 (a → b) */
export const daysBetween = (a: Date, b: Date) =>
  Math.round((kstMidnight(b).getTime() - kstMidnight(a).getTime()) / 86400000);

export type DunningAction = "charge" | "retry" | "suspend" | "none";

/**
 * 크론이 이 단지에 지금 무엇을 해야 하는가.
 *
 * PAST_DUE면 유예가 끝날 때까지 **매일** 재시도한다. 카드 한도·잔액은 다음 날 풀리는
 * 일이 흔하고 재시도 비용이 0이라, 며칠 간격으로 띄엄띄엄 거는 것보다 회수가 잘 된다.
 *
 * cancelRequestedAt은 해지 예약이거나 탈퇴 신청이다(호출자가 합쳐 넘긴다) —
 * chargeTenant가 결제 대신 실제 해지를 수행한다.
 */
export function dunningAction(
  b: {
    status: string;
    billingKey: string | null;
    nextBillingAt: Date | null;
    pastDueSince: Date | null;
    cancelRequestedAt: Date | null;
  },
  now = new Date(),
): DunningAction {
  if (!b.billingKey || b.status === "NONE") return "none";
  // 정지된 단지도 해지·탈퇴는 실행돼야 한다 — 여기서 영영 none이면 "해지될
  // 예정입니다" 안내가 거짓이 되고 빌링키를 무기한 쥐고 있게 된다. 낼 것도,
  // 기다릴 남은 기간도 없으므로 미루지 않고 바로 끊는다.
  if (b.status === "SUSPENDED") return b.cancelRequestedAt ? "charge" : "none";
  if (b.status === "PAST_DUE")
    return b.pastDueSince && daysBetween(b.pastDueSince, now) >= GRACE_DAYS
      ? "suspend"
      : "retry";
  return b.nextBillingAt && kstMidnight(b.nextBillingAt) <= kstMidnight(now)
    ? "charge"
    : "none";
}

/** 토스 주문번호 — 재시도마다 새 값이어야 해서 시각을 섞는다 (6~64자, 영문·숫자·`-`·`_`) */
export const orderId = (tenantId: string, now = new Date()) =>
  `dibuck-${tenantId.slice(0, 20)}-${now.getTime()}`;
