/**
 * 설비·수선 이력 순수 함수 검증 — `npx tsx repairs.test.ts` (DB 불필요)
 * 12개월 경계·조치 중 포함 여부가 반복 고장 경고의 기준이라 여기서 굳힌다.
 */
import assert from "node:assert/strict";
import {
  equipKey,
  isRepeat,
  parseEquipmentRows,
  parseHistoryRows,
  repairStats,
} from "./src/lib/repairs";

// ── equipKey: 이관 매칭 키 ──
// 띄어쓰기만 다른 이름은 같은 설비 — 여기가 무너지면 이력이 조용히 미지정이 된다
assert.equal(equipKey("급수펌프 #2"), equipKey("급수펌프#2"));
assert.equal(equipKey(" 급수펌프  #2 "), equipKey("급수펌프#2"));
// 호기가 다르면 다른 설비 — 유사도로 붙이지 않는다
assert.notEqual(equipKey("승강기 1호기"), equipKey("승강기 2호기"));

// ── repairStats: 12개월 경계 [오늘−12개월, 오늘] 폐구간 ──
const today = "2026-08-09";
const rec = (startedAt: string, cost = 100) => ({ startedAt, cost });
const s1 = repairStats(
  [rec("2025-08-09"), rec("2025-08-08"), rec("2026-08-09", 50)],
  today,
);
assert.equal(s1.count12m, 2); // 딱 12개월 전(2025-08-09)은 포함, 하루 전은 제외
assert.equal(s1.cost12m, 150);
assert.equal(s1.countAll, 3);
assert.equal(s1.costAll, 250);
assert.deepEqual(repairStats([], today), {
  count12m: 0,
  cost12m: 0,
  countAll: 0,
  costAll: 0,
});

// 조치 중 기록 포함은 호출 규약이 보장 — 호출자가 상태로 거르지 않고 전부 넘긴다.
// (여기서는 "넘긴 것은 전부 센다"를 고정한다)
assert.equal(
  repairStats([rec("2026-01-01"), rec("2026-02-01")], today).count12m,
  2,
);

// ── isRepeat: 12개월 3회부터 ──
assert.equal(
  isRepeat(repairStats([rec("2026-01-01"), rec("2026-02-01")], today)),
  false,
);
assert.equal(
  isRepeat(
    repairStats(
      [rec("2026-01-01"), rec("2026-02-01"), rec("2026-03-01")],
      today,
    ),
  ),
  true,
);

// ── parseEquipmentRows: 머리글 건너뜀, 모르는 분류는 기타, 연 단위 설치연도 ──
const eq = parseEquipmentRows([
  ["분류", "설비명", "위치", "설치연도", "업체", "비고"],
  [
    "급수·배수",
    "지하 1층 급수펌프 #2",
    "지하 1층",
    "2015",
    "한국펌프 02-111-2222",
    "",
  ],
  ["이상한분류", "복도 LED", "", "2020-03-15", "", "메모"],
  ["", "", "", "", "", ""], // 설비명 없는 행은 버린다
]);
assert.ok("rows" in eq);
assert.equal(eq.rows.length, 2);
assert.equal(eq.rows[0].category, "급수·배수");
assert.equal(eq.rows[0].installedAt, "2015-01-01");
assert.equal(eq.rows[1].category, "기타");
assert.equal(eq.rows[1].installedAt, "2020-03-15");
assert.ok("error" in parseEquipmentRows([["분류", "설비명"]])); // 머리글만 = 빈 파일

// ── parseHistoryRows: 일자·증상 필수, 콤마 비용 ──
const hi = parseHistoryRows([
  ["일자", "설비명", "증상", "조치", "업체", "비용"],
  [
    "2024-05-10",
    "지하 1층 급수펌프 #2",
    "누수",
    "패킹 교체",
    "한국펌프",
    "350,000",
  ],
  ["2024-06-01", "", "복도 전등 깜빡임", "안정기 교체", "", ""],
  ["날짜아님", "x", "증상", "", "", ""],
]);
assert.ok("rows" in hi);
assert.equal(hi.rows.length, 2);
assert.equal(hi.rows[0].cost, 350000); // 콤마가 0원이 되면 안 된다 (parseWon)
assert.equal(hi.rows[1].equipmentName, null); // 설비 미지정 이력 허용
assert.equal(hi.rows[1].cost, 0);

console.log("repairs.test.ts OK");
