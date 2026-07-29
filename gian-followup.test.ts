/**
 * 후속 문서 파생 검증 — `npx tsx gian-followup.test.ts` (DB·API 불필요)
 * 상속된 값이 틀리면 결재된 사실과 다른 문서가 만들어진다.
 */
import assert from "node:assert/strict";
import {
  buildExpenseDraft,
  buildReportDraft,
  followupCls,
  type SourceInfo,
} from "./src/lib/gian/followup";
import { classify } from "./src/lib/gian/rules";

const source: SourceInfo = {
  docNo: "품의-2026-0007",
  title: "지하주차장 LED 등기구 교체공사 지출품의의 건",
  approvedAt: new Date("2026-08-01T03:00:00Z"), // KST 8/1 12:00
  work: "지하주차장 노후 등기구 LED 교체 공사",
  vendor: "A 이엔지(주)",
  amountRaw: 4_500_000,
  vatIncluded: true,
};

// ── 완료보고서: 원 품의를 근거로 걸고, 계약금액은 상속한다 ──
{
  const d = buildReportDraft(source, {
    period: "2026년 8월 3일 ~ 8월 7일",
    condition: "전 구역 교체 완료 및 점등 상태 양호함.",
    inspector: "관리과장 홍길동",
  });
  assert.equal(d.title, "지하주차장 노후 등기구 LED 교체 공사 완료보고의 건");
  // 근거는 법령이 아니라 승인된 품의 — 문서번호와 승인일이 함께 박힌다
  assert.equal(d.legalBasis.length, 1);
  assert.ok(d.legalBasis[0].includes("품의-2026-0007"));
  assert.ok(d.legalBasis[0].includes("2026. 08. 01. 승인"));

  const overview = d.sections[0].lines.join("\n");
  assert.ok(overview.includes("금 4,500,000원")); // 금액은 다시 묻지 않고 상속
  assert.ok(overview.includes("금사백오십만원")); // 한글 병기까지 원 표기 그대로
  assert.ok(overview.includes("A 이엔지(주)"));
  // 항목 기호는 빠짐없이 이어져야 한다 (가·나·다·라)
  assert.deepEqual(
    d.sections[0].lines.map((l) => l[0]),
    ["가", "나", "다", "라"],
  );
  // 후속조치를 비우면 기본 문구가 들어간다 — 빈 절을 종이에 내보내지 않는다
  assert.ok(d.sections[2].lines[0].includes("세금계산서"));
}

// 업체가 없으면(전자입찰 등) 그 줄만 빠지고 기호는 다시 이어진다
{
  const d = buildReportDraft(
    { ...source, vendor: "" },
    { period: "8월", condition: "양호", inspector: "소장" },
  );
  assert.deepEqual(
    d.sections[0].lines.map((l) => l[0]),
    ["가", "나", "다"],
  );
  assert.ok(!d.sections[0].lines.join("").includes("시공업체"));
}

// 철거폐기물(선택)을 넣고 빼도 검수 결과의 기호가 어긋나지 않는다
{
  const withWaste = buildReportDraft(source, {
    period: "8월",
    condition: "양호",
    inspector: "소장",
    waste: "전량 회수",
  });
  assert.deepEqual(
    withWaste.sections[1].lines.map((l) => l[0]),
    ["가", "나", "다"],
  );
  const without = buildReportDraft(source, {
    period: "8월",
    condition: "양호",
    inspector: "소장",
  });
  assert.deepEqual(
    without.sections[1].lines.map((l) => l[0]),
    ["가", "나"],
  );
}

// ── 지출결의서: 발의일자는 만드는 날, 금액·품의는 상속 ──
{
  const d = buildExpenseDraft(
    source,
    {
      payDate: "2026년 8월 20일",
      account: "[관] 수선비 / [항] 수선유지비 / [목] 공용시설수선비",
      vendor: "A 이엔지(주)",
      ceo: "홍길동",
      bizNo: "000-00-00000",
      bank: "○○은행 000-000000-00000",
    },
    new Date("2026-08-10T03:00:00Z"),
  );
  assert.equal(d.title, "지하주차장 노후 등기구 LED 교체 공사 지출결의의 건");
  assert.ok(d.sections[0].lines[0].includes("2026. 08. 10.")); // 발의일자 = 오늘
  assert.ok(d.sections[0].lines[3].includes("금 4,500,000원"));
  assert.ok(d.legalBasis[0].includes("품의-2026-0007")); // 관련품의
  assert.equal(d.sections[2].heading, "채권자 정보");
  assert.deepEqual(
    d.sections[2].lines.map((l) => l[0]),
    ["가", "나", "다", "라"],
  );
}

// ── 결재선: 완료보고 3단(회장 없음) / 지출결의 4단(+회장) ──
{
  const pumui = classify({
    amountRaw: 4_500_000,
    vatIncluded: true,
    texts: ["LED 교체"],
  });
  assert.deepEqual(pumui.externalApprovers, ["CHAIR"]); // 원 품의는 4단

  assert.deepEqual(followupCls(pumui, "report").externalApprovers, []);
  assert.deepEqual(followupCls(pumui, "expense").externalApprovers, ["CHAIR"]);

  // 견적서 첨부 가드는 업체를 고르는 문서의 요건 — 파생 문서에 다시 걸면 상신이 막힌다
  assert.equal(followupCls(pumui, "report").context, "none");
  assert.equal(followupCls(pumui, "expense").context, "none");
}

// 원 품의가 소장 전결이면 그 지출결의에도 회장을 붙이지 않는다
{
  const 전결 = classify({
    amountRaw: 1_000_000,
    vatIncluded: false,
    texts: ["소모품 구입"],
    directorLimit: 3_000_000,
  });
  assert.equal(전결.withinDirectorLimit, true);
  assert.deepEqual(전결.externalApprovers, []);
  assert.deepEqual(followupCls(전결, "expense").externalApprovers, []);
}

// 장충금 공사(5단)의 지출결의도 서식대로 회장까지 — 감사는 붙지 않는다
{
  const ltp = classify({
    amountRaw: 45_000_000,
    vatIncluded: true,
    texts: ["옥상 방수공사"],
  });
  assert.deepEqual(ltp.externalApprovers, ["AUDITOR", "CHAIR"]);
  assert.deepEqual(followupCls(ltp, "expense").externalApprovers, ["CHAIR"]);
}

console.log("✓ gian-followup: 완료보고·지출결의 파생 통과");
