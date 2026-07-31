/**
 * 관리자 지표 계산 검증 — `npx tsx metrics.test.ts`
 * 두 가지가 틀리기 쉽다: (1) 해지된 구독도 해지 전 달에는 매출로 잡혀야 한다
 * (2) 무료 체험 중인 구독은 매출이 0원이다.
 */
import assert from "node:assert/strict";
import {
  mrrAt,
  wasActiveAt,
  wasExpiredTrialAt,
  wasPaidAt,
  wasTrialAt,
  recentMonths,
} from "./src/app/admin/metrics";
import { parseWon } from "./src/lib/won";

const d = (s: string) => new Date(s);
const sub = (
  status: string,
  subscribedAt: string,
  updatedAt: string,
  price: number,
  trialEndsAt: string | null = null,
  hasCard = true,
) => ({
  status,
  subscribedAt: d(subscribedAt),
  updatedAt: d(updatedAt),
  trialEndsAt: trialEndsAt ? d(trialEndsAt) : null,
  hasCard,
  module: { price },
});

// 1) 계속 유지 중인 구독은 가입 이후 모든 시점에 잡힌다
const alive = sub("ACTIVE", "2026-03-10", "2026-03-10", 30000);
assert.equal(wasActiveAt(alive, d("2026-03-01")), false, "가입 전에는 안 잡힘");
assert.equal(wasActiveAt(alive, d("2026-04-01")), true, "가입 후에는 잡힘");
assert.equal(wasActiveAt(alive, d("2026-07-01")), true, "이후로도 계속 잡힘");

// 2) 해지된 구독은 해지 시점 전까지만 잡힌다
const canceled = sub("CANCELED", "2026-02-01", "2026-05-20", 20000);
assert.equal(wasActiveAt(canceled, d("2026-05-01")), true, "해지 전 달에는 매출로 잡힘");
assert.equal(wasActiveAt(canceled, d("2026-06-01")), false, "해지 후에는 빠짐");

// 3) 무료 체험(카드 없음) — 체험 기간에는 매출 0원, 만료돼도 결제 수단이 없으니
//    매출 아님(전환 대기). 카드를 등록하면 같은 행이 그대로 매출이 된다(4.5).
const trial = sub("ACTIVE", "2026-04-01", "2026-04-01", 50000, "2026-05-01", false);
assert.equal(wasActiveAt(trial, d("2026-04-15")), true, "체험도 구독은 활성");
assert.equal(wasTrialAt(trial, d("2026-04-15")), true, "기간 안이면 체험");
assert.equal(wasPaidAt(trial, d("2026-04-15")), false, "체험 중에는 매출 없음");
assert.equal(wasTrialAt(trial, d("2026-05-15")), false, "기간이 끝나면 체험 아님");
assert.equal(wasPaidAt(trial, d("2026-05-15")), false, "만료 후 미전환은 매출 아님 — 결제된 적 없음");
assert.equal(wasExpiredTrialAt(trial, d("2026-05-15")), true, "만료 후에는 전환 대기 목록에 잡힘");
assert.equal(wasExpiredTrialAt(trial, d("2026-04-15")), false, "체험 중에는 전환 대기 아님");
assert.equal(wasPaidAt(trial, d("2026-03-01")), false, "가입 전에는 아무것도 아님");

// 4) MRR 합계 — 만료 미전환 체험(trial)은 어느 시점에도 매출에 안 들어간다
const subs = [alive, canceled, trial];
assert.equal(mrrAt(subs, d("2026-04-15")), 50000, "4월 = 30000 + 20000, 체험 50000 제외");
assert.equal(
  mrrAt(subs, d("2026-05-15")),
  50000,
  "5/15 = 30000 + 20000(해지 5/20 전이라 아직 살아있음), 만료 미전환 50000 제외",
);
assert.equal(
  mrrAt(subs, d("2026-06-01")),
  30000,
  "6월 = 30000, 해지분 20000과 만료 미전환 50000 빠짐",
);
assert.equal(mrrAt(subs, d("2026-01-01")), 0, "전부 가입 전");

// 4.5) 셀프 전환 — 카드가 등록된 단지는 체험이 끝나면 자동 청구된다.
//      trialEndsAt은 "체험 소진 이력"으로 과거에 남으므로 null 판정을 쓰면
//      전환 단지 전체가 MRR 0원·전환 대기로 잡힌다(실제 났던 버그).
const converted = sub("ACTIVE", "2026-04-01", "2026-04-01", 50000, "2026-05-01", true);
assert.equal(wasTrialAt(converted, d("2026-04-15")), true, "체험 중에는 체험");
assert.equal(wasPaidAt(converted, d("2026-04-15")), false, "체험 중에는 매출 아님");
assert.equal(wasPaidAt(converted, d("2026-05-15")), true, "체험이 끝나면 카드로 청구 — 매출");
assert.equal(wasExpiredTrialAt(converted, d("2026-05-15")), false, "카드가 있으면 전환 대기가 아니다");
// 카드 없는 무체험 구독은 청구할 길이 없다 — 유료로 세면 MRR이 부풀려진다
const noCardNoTrial = sub("ACTIVE", "2026-04-01", "2026-04-01", 10000, null, false);
assert.equal(wasPaidAt(noCardNoTrial, d("2026-05-15")), false, "카드 없으면 매출 아님");

// 5) recentMonths — 과거→현재 순서, 마지막이 이번 달, 구간이 빈틈없이 이어짐
const months = recentMonths(7);
assert.equal(months.length, 7);
const now = new Date();
assert.equal(months[6].start.getMonth(), now.getMonth(), "마지막 구간이 이번 달");
assert.equal(months[6].end.getTime() - months[6].start.getTime() > 0, true);
assert.equal(months[0].start < months[6].start, true, "과거 → 현재 순서");
assert.equal(
  months[3].end.getTime(),
  months[4].start.getTime(),
  "구간이 빈틈없이 이어짐",
);

// 6) 금액 입력 파싱 — 콤마를 안 걷어내면 Number()가 NaN이라 가격이 0원이 된다
assert.equal(parseWon("39,000"), 39000, "천단위 콤마");
assert.equal(parseWon("₩ 1,200,000"), 1200000, "통화기호·공백 섞여도");
assert.equal(parseWon("20000"), 20000, "콤마 없는 입력");
assert.equal(parseWon(""), 0, "빈 값");
assert.equal(parseWon(null), 0, "null");
assert.equal(parseWon("-5000"), 5000, "음수 기호는 무시 — 음수 요금은 없다");

console.log("metrics OK");
