/**
 * 결재 토큰 판정 검증 — `npx tsx approval-flow.test.ts` (DB 불필요)
 * 외부 서명 링크는 로그인 없이 토큰이 곧 권한이다 — fail-closed가 생명이다.
 */
import assert from "node:assert/strict";
import { tokenState } from "./src/lib/gian/approval";

const now = new Date("2026-07-27T12:00:00Z");
const future = new Date("2026-07-30T12:00:00Z");
const past = new Date("2026-07-20T12:00:00Z");

const base = { status: "pending", token: "t", tokenExpiresAt: future };

// 정상: 대기 중 단계 + 유효 토큰 + 결재 중 문서
assert.equal(tokenState(base, "pending", now), "valid");

// fail-closed 전부: 단계 없음 / 토큰 없음 / 문서가 결재 중이 아님
assert.equal(tokenState(null, "pending", now), "invalid");
assert.equal(tokenState({ ...base, token: null }, "pending", now), "invalid");
assert.equal(tokenState(base, "draft", now), "invalid");
assert.equal(tokenState(base, "final", now), "invalid");
assert.equal(tokenState(base, "rejected", now), "invalid");
assert.equal(tokenState(base, undefined, now), "invalid");

// 아직 차례가 아닌 단계(waiting)는 토큰이 있어도 거부
assert.equal(tokenState({ ...base, status: "waiting" }, "pending", now), "invalid");

// 만료 — 경계값: 만료 시각 정각도 만료다
assert.equal(tokenState({ ...base, tokenExpiresAt: past }, "pending", now), "expired");
assert.equal(tokenState({ ...base, tokenExpiresAt: now }, "pending", now), "expired");
assert.equal(tokenState({ ...base, tokenExpiresAt: null }, "pending", now), "expired");

// 이미 처리됨 — 링크 재클릭 시 "완료" 안내 (문서 상태와 무관하게 done이 우선)
assert.equal(tokenState({ ...base, status: "approved" }, "pending", now), "done");
assert.equal(tokenState({ ...base, status: "rejected" }, "rejected", now), "done");

console.log("approval-flow OK");
