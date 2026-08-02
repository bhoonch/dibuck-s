/**
 * 시도 횟수 제한 검증 — `npx tsx rate-limit.test.ts` (DB 불필요)
 *
 * 계약: 반환값 0 = 이번 시도가 한도를 **넘었다**(차단). 한도 N이면 정확히 N번
 * 통과해야 한다 — "10분 3회" 같은 안내 문구를 코드가 지키는지가 이 테스트다.
 * (예전 계약은 "이번 시도 후 남은 횟수"라 N번째가 차단됐고, 한도 1은 전면 차단이었다)
 */
import assert from "node:assert/strict";
import { rateLimit, rateLimitReset } from "./src/lib/rate-limit";

// 한도 3 = 정확히 3번 통과, 4번째부터 잠긴다
const key = "login:a@test.com";
assert.equal(rateLimit(key, 3, 60_000), 3);
assert.equal(rateLimit(key, 3, 60_000), 2);
assert.equal(rateLimit(key, 3, 60_000), 1, "3번째 — 문구가 약속한 마지막 시도는 통과");
assert.equal(rateLimit(key, 3, 60_000), 0, "4번째부터 차단");
assert.equal(rateLimit(key, 3, 60_000), 0); // 계속 잠긴 상태

// 한도 1도 첫 시도는 통과해야 한다 (off-by-one이면 전면 차단이 된다)
assert.equal(rateLimit("once:x", 1, 60_000), 1);
assert.equal(rateLimit("once:x", 1, 60_000), 0);

// 성공하면 초기화된다 — 정상 사용자가 다음 로그인에서 막히지 않아야 한다
rateLimitReset(key);
assert.equal(rateLimit(key, 3, 60_000), 3);

// 키가 다르면 서로 영향이 없다
assert.equal(rateLimit("login:b@test.com", 3, 60_000), 3);

// 윈도우가 지나면 다시 열린다
const expiring = "login:c@test.com";
assert.equal(rateLimit(expiring, 1, -1), 1); // 이미 만료된 윈도우 → 매번 새 윈도우
assert.equal(rateLimit(expiring, 1, -1), 1); // 항상 첫 시도로 취급

console.log("rate-limit OK");
