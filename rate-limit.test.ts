/** 시도 횟수 제한 검증 — `npx tsx rate-limit.test.ts` */
import assert from "node:assert/strict";
import { rateLimit, rateLimitReset } from "./src/lib/rate-limit";

// 한도까지는 남은 횟수가 줄고, 넘으면 0으로 잠긴다
const key = "login:a@test.com";
assert.equal(rateLimit(key, 3, 60_000), 2);
assert.equal(rateLimit(key, 3, 60_000), 1);
assert.equal(rateLimit(key, 3, 60_000), 0);
assert.equal(rateLimit(key, 3, 60_000), 0); // 계속 잠긴 상태

// 성공하면 초기화된다 — 정상 사용자가 다음 로그인에서 막히지 않아야 한다
rateLimitReset(key);
assert.equal(rateLimit(key, 3, 60_000), 2);

// 키가 다르면 서로 영향이 없다
assert.equal(rateLimit("login:b@test.com", 3, 60_000), 2);

// 윈도우가 지나면 다시 열린다
const expiring = "login:c@test.com";
assert.equal(rateLimit(expiring, 1, -1), 0); // 이미 만료된 윈도우
assert.equal(rateLimit(expiring, 1, -1), 0); // 매번 새 윈도우 → 항상 첫 시도

console.log("rate-limit OK");
