/**
 * 관리자 지표 계산 검증 — `npx tsx metrics.test.ts`
 * 두 가지가 틀리기 쉽다: (1) 해지된 구독도 해지 전 달에는 매출로 잡혀야 한다
 * (2) 무료 체험 중인 구독은 매출이 0원이다.
 */
import assert from "node:assert/strict";
import {
  mrrAt,
  wasActiveAt,
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
) => ({
  status,
  subscribedAt: d(subscribedAt),
  updatedAt: d(updatedAt),
  trialEndsAt: trialEndsAt ? d(trialEndsAt) : null,
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

// 3) 무료 체험 — 체험 기간에는 매출 0원, 끝나면 유료로 잡힌다
const trial = sub("ACTIVE", "2026-04-01", "2026-04-01", 50000, "2026-05-01");
assert.equal(wasActiveAt(trial, d("2026-04-15")), true, "체험도 구독은 활성");
assert.equal(wasTrialAt(trial, d("2026-04-15")), true, "기간 안이면 체험");
assert.equal(wasPaidAt(trial, d("2026-04-15")), false, "체험 중에는 매출 없음");
assert.equal(wasTrialAt(trial, d("2026-05-15")), false, "기간이 끝나면 체험 아님");
assert.equal(wasPaidAt(trial, d("2026-05-15")), true, "체험 종료 후 유료로 전환");
assert.equal(wasPaidAt(trial, d("2026-03-01")), false, "가입 전에는 아무것도 아님");

// 4) MRR 합계
const subs = [alive, canceled, trial];
assert.equal(mrrAt(subs, d("2026-04-15")), 50000, "4월 = 30000 + 20000, 체험 50000 제외");
assert.equal(
  mrrAt(subs, d("2026-05-15")),
  100000,
  "5/15 = 30000 + 20000(해지 5/20 전이라 아직 살아있음) + 50000(체험 종료)",
);
assert.equal(
  mrrAt(subs, d("2026-06-01")),
  80000,
  "6월 = 30000 + 50000, 해지분 20000 빠짐",
);
assert.equal(mrrAt(subs, d("2026-01-01")), 0, "전부 가입 전");

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
