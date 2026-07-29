/**
 * 관련근거 화이트리스트 검증 — `npx tsx gian-legal.test.ts` (DB·API 불필요)
 * 이 관문이 새면 LLM이 지어낸 조항이 결재 문서에 인쇄된다.
 */
import assert from "node:assert/strict";
import { verifyLegalBasis } from "./src/lib/gian/legal-sources";

// ── 목록에 있는 인용은 통과하고, 표기 흔들림은 정본으로 교정된다 ──
{
  const { basis, unverified } = verifyLegalBasis([
    "공동주택관리법 제63조(관리주체의 업무)",
    "가. 공동주택관리법 제 29 조", // 항목 기호·공백·조 제목 누락
    "공동주택관리법 제30조(엉뚱한 제목)", // 제목이 틀려도 조 번호가 맞으면 교정
    "주택관리업자 및 사업자 선정지침 (국토교통부 고시)",
  ]);
  assert.deepEqual(basis, [
    "공동주택관리법 제63조(관리주체의 업무)",
    "공동주택관리법 제29조(장기수선계획)",
    "공동주택관리법 제30조(장기수선충당금의 적립)",
    "주택관리업자 및 사업자 선정지침 (국토교통부 고시)",
  ]);
  assert.deepEqual(unverified, []);
}

// ── 목록에 없는 인용은 문서에 실리지 않는다 (이 테스트가 이 파일의 존재 이유) ──
{
  const { basis, unverified } = verifyLegalBasis([
    "공동주택관리법 제63조(관리주체의 업무)",
    "공동주택관리법 제999조(있을 리 없는 조항)", // 조 번호 환각
    "주택법 제1조", // 목록에 없는 법령
    "공동주택관리법 시행규칙 제29조", // 법령명이 다르면 조 번호가 같아도 불통과
  ]);
  assert.deepEqual(basis, ["공동주택관리법 제63조(관리주체의 업무)"]);
  assert.equal(unverified.length, 3);
}

// ── 여러 조를 묶은 인용은 한 조로 줄일 수 없으므로 확인 대상 ──
{
  const { basis, unverified } = verifyLegalBasis(["공동주택관리법 제29·30조"]);
  assert.deepEqual(basis, []);
  assert.deepEqual(unverified, ["공동주택관리법 제29·30조"]);
}

// ── 관리규약은 단지가 입력한 조항일 때만 통과 (LLM의 창작이 아니다) ──
{
  const clause = "제38조 제2항";
  const { basis, unverified } = verifyLegalBasis(
    [
      "당 단지 관리규약 제38조 제2항 — 관리소장 전결 사항으로 처리하는 지출임.",
      "당 단지 관리규약 제77조", // 우리가 준 조항이 아니다
    ],
    clause,
  );
  assert.equal(basis.length, 1);
  assert.ok(basis[0].includes("제38조 제2항"));
  assert.deepEqual(unverified, ["당 단지 관리규약 제77조"]);
}

// 전결 조항을 안 넘겼으면 규약 줄은 전부 확인 대상
{
  const { basis, unverified } = verifyLegalBasis(["당 단지 관리규약 제38조"]);
  assert.deepEqual(basis, []);
  assert.equal(unverified.length, 1);
}

// ── 중복은 한 줄로 (정본 교정 후 같아지는 경우 포함) ──
{
  const { basis } = verifyLegalBasis([
    "공동주택관리법 제63조(관리주체의 업무)",
    "공동주택관리법 제63조", // 교정하면 위와 같은 줄
    "  ", // 빈 줄은 버린다
  ]);
  assert.deepEqual(basis, ["공동주택관리법 제63조(관리주체의 업무)"]);
}

console.log("✓ gian-legal: 관련근거 화이트리스트 통과");
