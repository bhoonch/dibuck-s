# 설비·수선 이력(repairs) 모듈 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수선 한 건을 30초에 기록하면 설비별 이력·비용이 쌓여 인수인계 문서(A4 이력 카드)와 교체 설득 자료가 저절로 나오는 모듈.

**Architecture:** 마스터는 테이블(`Equipment`), 기록은 문서(`Document` type `"repair"`, 저장 즉시 채번, 초안 없음). 반복 고장 집계는 열 때 계산하는 순수 함수. 법정 엔진도 LLM도 크론도 없다.

**Tech Stack:** Next.js 16 App Router + Server Actions, Prisma 7 + PostgreSQL, xlsx(설치됨), 기존 문서 첨부 인프라.

**스펙:** `docs/superpowers/specs/2026-08-05-repairs-ledger-prompt.md` (설계 결정 확정 — 재논의 불필요)

**사용자 확정(2026-08-09):** 모듈 이름 **"설비·수선 이력"**, 가격 **월 15,000원**.

## 스펙과 다르게 가는 세 가지 (구현 세션에서 확인된 사유)

1. **설비 엑셀 "전체 교체"는 수선 기록이 하나라도 있으면 막는다.** Unit과 달리 Equipment의 id는 `Document.meta.equipmentId`가 참조한다 — 교체(deleteMany+createMany)로 id가 새로 발급되면 모든 기록의 설비 연결이 고아가 되어 이력 카드가 빈다. 기록 0건일 때만 교체 허용, 그 뒤로는 이름 기준 추가만.
2. **상태값은 `pending`이 아니라 `open`(조치 중)→`done`(완료).** `labels.ts`에 이미 적힌 함정: 문서함이 `pending`을 "결재 대기"로 읽는다 — 수선 기록에 붙으면 거짓 문구가 된다. `open`="처리 중", `done`="처리 완료"가 이미 매핑돼 있다.
3. **과거 이력 이관 기록은 채번하지 않는다(docNo null + `meta.imported`).** 2023년 수선에 `수선-2026-####`을 붙이면 대장이 거짓말을 한다. `@@unique([tenantId, docNo])`는 null 복수 허용.

## Global Constraints

- AGENTS.md 전부: 상태를 바꾸는 함수는 자기 입구에서 검사 / 한 번만 일어나는 일은 조건부 `updateMany` / `{ not: x }`는 NULL 제외 / 트랜잭션 안 행별 쿼리 루프 금지 / 동작을 바꾸면 문구·주석 같은 커밋.
- UI 안내 문구에 '—' 연결 금지 — 문장을 끊고 줄바꿈(사용자 확정 규칙). 코드 주석·커밋 메시지는 예외.
- 스키마 반영은 `npx prisma db push` (migrate dev 금지 — DB 리셋 요구). 반영 후 dev 서버 재시작.
- LLM 호출·`ANTHROPIC_API_KEY` 의존 금지 — 전 기능이 키 없이 돈다. 법 해석 코드 금지(이 모듈은 법령 값 자체가 없다).
- **커밋·푸시는 사용자 지시를 기다린다.** 각 Task 끝 "커밋 대기점"에서 검증 결과를 보고하고 지시를 기다린다.
- Next.js 16은 학습 데이터와 다르다 — 라우트·searchParams(Promise다) 작성 전 `node_modules/next/dist/docs/` 확인.
- 검증 공통: `npx tsc --noEmit`, `npx eslint <파일들>`, `npx prettier --check <파일들>`.

---

### Task 1: 순수 라이브러리 + 테스트 + 엑셀 샘플 2종

**Files:**
- Create: `src/lib/repairs.ts`
- Create: `repairs.test.ts` (저장소 루트 — 기존 테스트 컨벤션)
- Create: `public/equipment-upload-sample.xlsx`, `public/repair-history-sample.xlsx` (생성 스크립트로)

**Interfaces:**
- Consumes: `addMonthsYmd(ymd, months)` — `src/lib/inspection/schedule.ts` (음수 개월 지원 확인됨), `parseWon` — `src/lib/won.ts`
- Produces (이후 Task 전부가 쓴다):
  - `EQUIPMENT_CATEGORIES: readonly string[]`, `MAX_EQUIPMENT_ROWS = 2000`, `MAX_HISTORY_ROWS = 10000`, `REPEAT_COUNT_12M = 3`
  - `type EquipmentRow = { name: string; category: string; location: string | null; installedAt: string | null; vendor: string | null; note: string | null }`
  - `parseEquipmentRows(rows: unknown[][]): { rows: EquipmentRow[] } | { error: string }`
  - `type HistoryRow = { startedAt: string; equipmentName: string | null; symptom: string; action: string | null; vendor: string | null; cost: number }`
  - `parseHistoryRows(rows: unknown[][]): { rows: HistoryRow[] } | { error: string }`
  - `type RepairStat = { count12m: number; cost12m: number; countAll: number; costAll: number }`
  - `repairStats(records: { startedAt: string; cost: number }[], todayYmd: string): RepairStat`
  - `isRepeat(s: RepairStat): boolean` — `count12m >= REPEAT_COUNT_12M`

- [ ] **Step 1: `src/lib/repairs.ts` 작성** — 서버·클라이언트 공용(photo-sheet.ts처럼 DB 임포트 금지)

```ts
import { addMonthsYmd } from "@/lib/inspection/schedule";
import { parseWon } from "@/lib/won";

/** 설비 분류 — 법정 값이 아니라 앱의 정리 축. 엑셀의 모르는 분류는 "기타"로 받는다 */
export const EQUIPMENT_CATEGORIES = [
  "승강기", "급수·배수", "전기", "소방", "난방·보일러",
  "건축·외벽", "조경·부대시설", "기타",
] as const;

export const MAX_EQUIPMENT_ROWS = 2000;
export const MAX_HISTORY_ROWS = 10000;
/** 반복 고장 판정 — 최근 12개월 수선 횟수 임계 */
export const REPEAT_COUNT_12M = 3;

const cell = (r: unknown[], i: number) => String(r[i] ?? "").trim();
const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** "2015" 연 단위 입력 허용 — 1월 1일로 저장(스펙) */
const installYmd = (v: string) =>
  isYmd(v) ? v : /^\d{4}$/.test(v) ? `${v}-01-01` : null;

export type EquipmentRow = {
  name: string; category: string; location: string | null;
  installedAt: string | null; vendor: string | null; note: string | null;
};

/** 설비 엑셀: A분류 B설비명 C위치 D설치연도 E업체 F비고. 첫 행 머리글 자동 건너뜀 */
export function parseEquipmentRows(
  rows: unknown[][],
): { rows: EquipmentRow[] } | { error: string } {
  const body = rows
    .filter((r) => Array.isArray(r) && cell(r, 1))
    .filter((r) => cell(r, 0) !== "분류" && cell(r, 1) !== "설비명");
  if (body.length === 0)
    return { error: "등록할 설비가 없습니다. A열=분류, B열=설비명 형식인지 확인해 주세요." };
  if (body.length > MAX_EQUIPMENT_ROWS)
    return { error: `한 번에 ${MAX_EQUIPMENT_ROWS.toLocaleString()}대까지 등록할 수 있습니다. 파일을 나눠 올려 주세요.` };
  const cats = EQUIPMENT_CATEGORIES as readonly string[];
  return {
    rows: body.map((r) => ({
      category: cats.includes(cell(r, 0)) ? cell(r, 0) : "기타",
      name: cell(r, 1),
      location: cell(r, 2) || null,
      installedAt: installYmd(cell(r, 3)),
      vendor: cell(r, 4) || null,
      note: cell(r, 5) || null,
    })),
  };
}

export type HistoryRow = {
  startedAt: string; equipmentName: string | null; symptom: string;
  action: string | null; vendor: string | null; cost: number;
};

/** 과거 이력 엑셀: A일자 B설비명 C증상 D조치 E업체 F비용. 일자·증상 없는 행은 버린다 */
export function parseHistoryRows(
  rows: unknown[][],
): { rows: HistoryRow[] } | { error: string } {
  const body = rows
    .filter((r) => Array.isArray(r) && isYmd(cell(r, 0)) && cell(r, 2));
  if (body.length === 0)
    return { error: "가져올 이력이 없습니다. A열=일자(YYYY-MM-DD), C열=증상 형식인지 확인해 주세요." };
  if (body.length > MAX_HISTORY_ROWS)
    return { error: `한 번에 ${MAX_HISTORY_ROWS.toLocaleString()}건까지 가져올 수 있습니다. 파일을 나눠 올려 주세요.` };
  return {
    rows: body.map((r) => ({
      startedAt: cell(r, 0),
      equipmentName: cell(r, 1) || null,
      symptom: cell(r, 2),
      action: cell(r, 3) || null,
      vendor: cell(r, 4) || null,
      cost: parseWon(cell(r, 5)),
    })),
  };
}

export type RepairStat = {
  count12m: number; cost12m: number; countAll: number; costAll: number;
};

/**
 * 설비별 수선 집계 — 12개월 경계는 [오늘−12개월, 오늘] 폐구간.
 * 조치 중(open) 기록도 포함한다: 고장 횟수·비용은 발생 기준이 정직하다
 * (완료 대기 중이라고 반복 고장 경고에서 빠지면 경고가 늦는다).
 */
export function repairStats(
  records: { startedAt: string; cost: number }[],
  todayYmd: string,
): RepairStat {
  const cutoff = addMonthsYmd(todayYmd, -12);
  const recent = records.filter((r) => r.startedAt >= cutoff);
  const sum = (rs: { cost: number }[]) => rs.reduce((a, r) => a + r.cost, 0);
  return {
    count12m: recent.length,
    cost12m: sum(recent),
    countAll: records.length,
    costAll: sum(records),
  };
}

export const isRepeat = (s: RepairStat) => s.count12m >= REPEAT_COUNT_12M;
```

- [ ] **Step 2: `repairs.test.ts` 작성** (루트, DB 불필요)

```ts
/**
 * 설비·수선 이력 순수 함수 검증 — `npx tsx repairs.test.ts` (DB 불필요)
 * 12개월 경계·조치 중 포함 여부가 반복 고장 경고의 기준이라 여기서 굳힌다.
 */
import assert from "node:assert/strict";
import {
  isRepeat, parseEquipmentRows, parseHistoryRows, repairStats,
} from "./src/lib/repairs";

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
assert.deepEqual(repairStats([], today), { count12m: 0, cost12m: 0, countAll: 0, costAll: 0 });

// 조치 중 기록 포함은 함수 시그니처가 보장 — 호출자가 상태로 거르지 않고 전부 넘긴다.
// (여기서는 "넘긴 것은 전부 센다"를 고정한다)
assert.equal(repairStats([rec("2026-01-01"), rec("2026-02-01")], today).count12m, 2);

// ── isRepeat: 12개월 3회부터 ──
assert.equal(isRepeat(repairStats([rec("2026-01-01"), rec("2026-02-01")], today)), false);
assert.equal(
  isRepeat(repairStats([rec("2026-01-01"), rec("2026-02-01"), rec("2026-03-01")], today)),
  true,
);

// ── parseEquipmentRows: 머리글 건너뜀, 모르는 분류는 기타, 연 단위 설치연도 ──
const eq = parseEquipmentRows([
  ["분류", "설비명", "위치", "설치연도", "업체", "비고"],
  ["급수·배수", "지하 1층 급수펌프 #2", "지하 1층", "2015", "한국펌프 02-111-2222", ""],
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
  ["2024-05-10", "지하 1층 급수펌프 #2", "누수", "패킹 교체", "한국펌프", "350,000"],
  ["2024-06-01", "", "복도 전등 깜빡임", "안정기 교체", "", ""],
  ["날짜아님", "x", "증상", "", "", ""],
]);
assert.ok("rows" in hi);
assert.equal(hi.rows.length, 2);
assert.equal(hi.rows[0].cost, 350000); // 콤마가 0원이 되면 안 된다 (parseWon)
assert.equal(hi.rows[1].equipmentName, null); // 설비 미지정 이력 허용
assert.equal(hi.rows[1].cost, 0);

console.log("repairs.test.ts OK");
```

- [ ] **Step 3: 테스트 실행** — `npx tsx repairs.test.ts` → 먼저 실패 확인(파일 없을 때), lib 작성 후 `repairs.test.ts OK`
- [ ] **Step 4: 샘플 엑셀 2종 생성** — 스크래치 스크립트를 `npx tsx`로 1회 실행 후 삭제(저장소에 남기지 않는다)

```ts
// scratch-samples.ts — 실행 후 삭제
import * as XLSX from "xlsx";
const eq = [
  ["분류", "설비명", "위치", "설치연도", "업체", "비고"],
  ["급수·배수", "지하 1층 급수펌프 #2", "지하 1층 기계실", "2015", "한국펌프 02-1234-5678", ""],
  ["승강기", "101동 승강기 1호기", "101동", "2008", "한국엘리베이터", ""],
  ["난방·보일러", "중앙난방 보일러 #1", "지하 2층", "2011-11-20", "대성보일러", "노후"],
];
const hi = [
  ["일자", "설비명", "증상", "조치", "업체", "비용"],
  ["2024-05-10", "지하 1층 급수펌프 #2", "누수", "패킹 교체", "한국펌프", "350000"],
  ["2025-01-22", "", "복도 전등 깜빡임", "안정기 교체", "", "45000"],
];
for (const [name, aoa, file] of [
  ["설비", eq, "public/equipment-upload-sample.xlsx"],
  ["과거이력", hi, "public/repair-history-sample.xlsx"],
] as const) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa as unknown[][]), name);
  XLSX.writeFile(wb, file);
}
```

- [ ] **Step 5: 검증** — `npx tsx repairs.test.ts` PASS, `npx tsc --noEmit`, eslint/prettier. **커밋 대기점 1** (제안 메시지: `설비·수선 이력 준비 — 분류 상수·엑셀 파싱·반복 고장 집계 순수 함수`)

---

### Task 2: Equipment 스키마 + 탈퇴 purge

**Files:**
- Modify: `prisma/schema.prisma` (InspectionItem 모델 아래 + Tenant relations 블록)
- Modify: `src/lib/tenant-deletion.ts:37` (inspectionItem 옆)
- Modify: `tenant-deletion.test.ts`

**Interfaces:**
- Produces: `db.equipment` — 필드 `id, tenantId, name, category, location, installedAt, vendor, note, active, createdAt`

- [ ] **Step 1: 스키마 추가** — InspectionItem 아래에:

```prisma
// ── 설비·수선 이력 — 설비 대장 (마스터는 테이블, 기록은 Document) ──
model Equipment {
  id          String    @id @default(cuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  name        String // "지하 1층 급수펌프 #2"
  category    String // EQUIPMENT_CATEGORIES (src/lib/repairs.ts)
  location    String? // 동·위치
  installedAt DateTime? // 설치·최근 교체 시점 (연 단위 입력은 1월 1일로 저장)
  vendor      String? // 담당 업체·연락처 자유 텍스트
  note        String?
  /// 폐기 설비는 삭제가 아니라 비활성 — 수선 기록의 meta.equipmentId가 이 행을 가리킨다
  active      Boolean   @default(true)
  createdAt   DateTime  @default(now())

  @@index([tenantId])
}
```

Tenant 모델 relations 블록(`inspectionItems InspectionItem[]` 아래)에 `equipment Equipment[]` 추가.

- [ ] **Step 2: 반영** — `npx prisma db push` (migrate 금지). 이후 dev 서버 재시작 안내.
- [ ] **Step 3: purge 추가** — `tenant-deletion.ts`의 트랜잭션 배열에서 `db.inspectionItem.deleteMany` 다음 줄에 `db.equipment.deleteMany({ where: { tenantId } }),`
- [ ] **Step 4: 테스트 확장** — `tenant-deletion.test.ts`의 cleanup에 `await db.equipment.deleteMany({ where: { tenantId: T } });`, main에 설비 1대 생성:

```ts
// 설비도 purge 대상 — InspectionItem 때처럼 빠뜨리면 FK가 tenant 삭제를 막는다
await db.equipment.create({
  data: { tenantId: T, name: "테스트 펌프", category: "급수·배수" },
});
```

purge 후 assert에 `assert.equal(await db.equipment.count({ where: { tenantId: T } }), 0);`

- [ ] **Step 5: 검증** — `npx tsx tenant-deletion.test.ts` PASS(DB 필요), tsc. **커밋 대기점 2**

---

### Task 3: 설비 대장 화면 + 엑셀 업로드

**Files:**
- Create: `src/app/(app)/modules/repairs/actions.ts` (모듈 서버 액션의 시작 — 이후 Task가 이어서 쓴다)
- Create: `src/app/(app)/modules/repairs/equipment/page.tsx`
- Create: `src/app/(app)/modules/repairs/equipment/equipment-manager.tsx` (client)
- Create: `src/app/(app)/modules/repairs/equipment/equipment-upload.tsx` (client)

**Interfaces:**
- Consumes: Task 1의 `parseEquipmentRows`, `EQUIPMENT_CATEGORIES`; `requireTenantSession`, `isSubscribed`, `Role`
- Produces: `requireRepairs()` (모듈 공통 입구), `addEquipment`, `updateEquipment`, `setEquipmentActive`, `uploadEquipmentExcel(_prev, formData): Promise<{error?: string; success?: string} | undefined>`

- [ ] **Step 1: actions.ts 뼈대 + 대장 액션** — facilities/actions.ts의 결 그대로:

```ts
"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { isSubscribed } from "@/lib/modules";
import { parseWon } from "@/lib/won";
import { ymdKst } from "@/lib/utils";
import { allowedMime, MAX_FILE_BYTES, MAX_FILES_PER_DOC } from "@/lib/gian/attachments";
import {
  EQUIPMENT_CATEGORIES, parseEquipmentRows, parseHistoryRows,
} from "@/lib/repairs";

const MODULE_ID = "repairs";
const TYPE = "repair";

/** 상태를 바꾸는 함수의 공통 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다 */
async function requireRepairs() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, MODULE_ID)))
    throw new Error("설비·수선 이력 모듈을 구독 중이 아닙니다.");
  return session;
}

/** 대장 관리는 명부와 같은 경계 — 마스터·매니저 */
async function requireEquipAdmin() {
  const session = await requireRepairs();
  if (session.role !== Role.DIRECTOR && session.role !== Role.ACCOUNTANT)
    return { error: "설비 대장 관리는 마스터·매니저만 할 수 있습니다." as const };
  return { session };
}

/** "YYYY-MM-DD" 또는 "YYYY" → KST 00:00. 빈 값 null (facilities kstDateOf와 같은 함정 대응) */
const kstDateOf = (v: string | undefined | null) => {
  const t = (v ?? "").trim();
  const ymd = /^\d{4}$/.test(t) ? `${t}-01-01` : t;
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(`${ymd}T00:00:00+09:00`) : null;
};

export async function addEquipment(input: {
  name: string; category: string; location?: string;
  installedAt?: string; vendor?: string; note?: string;
}) {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return gate;
  const name = input.name.trim();
  if (!name) return { error: "설비 이름을 입력해 주세요." };
  const cats = EQUIPMENT_CATEGORIES as readonly string[];
  await db.equipment.create({
    data: {
      tenantId: gate.session.tenantId!,
      name,
      category: cats.includes(input.category) ? input.category : "기타",
      location: input.location?.trim() || null,
      installedAt: kstDateOf(input.installedAt),
      vendor: input.vendor?.trim() || null,
      note: input.note?.trim() || null,
    },
  });
  revalidatePath("/modules/repairs/equipment");
  return {};
}

export async function updateEquipment(input: {
  id: string; name: string; category: string; location: string;
  installedAt: string; vendor: string; note: string;
}) {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return gate;
  const name = input.name.trim();
  if (!name) return { error: "설비 이름을 입력해 주세요." };
  const cats = EQUIPMENT_CATEGORIES as readonly string[];
  // tenantId를 조건에 넣는다 — 남의 단지 설비 id로는 아무 행도 맞지 않는다
  await db.equipment.updateMany({
    where: { id: input.id, tenantId: gate.session.tenantId! },
    data: {
      name,
      category: cats.includes(input.category) ? input.category : "기타",
      location: input.location.trim() || null,
      installedAt: kstDateOf(input.installedAt),
      vendor: input.vendor.trim() || null,
      note: input.note.trim() || null,
    },
  });
  revalidatePath("/modules/repairs/equipment");
  return {};
}

/** 폐기는 삭제가 아니라 비활성 — 수선 기록의 설비 연결이 허공에 뜨면 안 된다 */
export async function setEquipmentActive(id: string, active: boolean) {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return gate;
  await db.equipment.updateMany({
    where: { id, tenantId: gate.session.tenantId! },
    data: { active },
  });
  revalidatePath("/modules/repairs/equipment");
  return {};
}

export async function uploadEquipmentExcel(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
) {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return gate;
  const tenantId = gate.session.tenantId!;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (file.size > 5 * 1024 * 1024)
    return { error: "5MB 이하 파일만 업로드할 수 있습니다." };

  const XLSX = await import("xlsx");
  let raw: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  } catch {
    return { error: "파일을 읽을 수 없습니다. 엑셀(.xlsx) 파일인지 확인해 주세요." };
  }
  const parsed = parseEquipmentRows(raw);
  if ("error" in parsed) return parsed;
  // 같은 파일 안 중복 이름은 뒤엣것만 (세대 업로드와 같은 판단)
  const unique = [...new Map(parsed.rows.map((r) => [r.name, r])).values()];

  const replace = formData.get("replace") === "on";
  if (replace) {
    // ⚠️ Unit과 다른 점: Equipment id는 수선 기록의 meta.equipmentId가 참조한다.
    // 교체로 id가 새로 발급되면 모든 기록의 설비 연결이 고아가 된다 — 기록이 있으면 막는다.
    const linked = await db.document.count({ where: { tenantId, type: TYPE } });
    if (linked > 0)
      return {
        error: "수선 기록이 있는 단지는 전체 교체를 할 수 없습니다.\n기록과 설비의 연결이 끊어집니다. 교체 없이 올리면 새 설비만 추가됩니다.",
      };
    await db.$transaction(async (tx) => {
      await tx.equipment.deleteMany({ where: { tenantId } });
      await tx.equipment.createMany({
        data: unique.map((r) => ({ ...r, tenantId, installedAt: kstDateOf(r.installedAt) })),
      });
    });
    revalidatePath("/modules/repairs/equipment");
    return { success: `설비 ${unique.length}대를 등록했습니다.` };
  }
  // 추가 모드 — 이미 있는 이름은 건너뛴다(id 보존). 수정은 화면에서.
  const existing = await db.equipment.findMany({
    where: { tenantId }, select: { name: true },
  });
  const have = new Set(existing.map((e) => e.name));
  const fresh = unique.filter((r) => !have.has(r.name));
  if (fresh.length > 0)
    await db.equipment.createMany({
      data: fresh.map((r) => ({ ...r, tenantId, installedAt: kstDateOf(r.installedAt) })),
    });
  revalidatePath("/modules/repairs/equipment");
  return {
    success: `설비 ${fresh.length}대를 추가했습니다.` +
      (unique.length - fresh.length > 0 ? ` 이미 있는 ${unique.length - fresh.length}대는 건너뛰었습니다.` : ""),
  };
}
```

(주의: `EquipmentRow.installedAt`은 문자열이므로 createMany 전에 `kstDateOf`로 변환 — 위 코드처럼 spread 후 덮어쓴다.)

- [ ] **Step 2: 대장 화면** — `equipment/page.tsx`(서버): `requireTenantSession` + `isSubscribed(…, "repairs")` 아니면 `redirect("/subscriptions")`. `db.equipment.findMany({ where: { tenantId }, orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }] })` → `EquipmentManager`에 전달. 업로드 카드는 마스터·매니저만(units/page.tsx 경계 그대로). 뒤로 링크 `/modules/repairs`.
- [ ] **Step 3: `equipment-manager.tsx`** — facilities `items/items-manager.tsx`의 패턴(행 인라인 수정, 비활성 토글, useTransition)으로: 목록 행 = 분류 배지 · 이름 · 위치 · 설치시점(ymd) · 업체 · [수정] [비활성/활성]. 추가 폼 = 이름(Input, 필수) · 분류(native select — EQUIPMENT_CATEGORIES) · 위치 · 설치시점(`<input type="date">` + "연도만 알면 1월 1일로 적어 주세요" 힌트) · 업체 · 비고. 비활성 행은 흐리게(`opacity-60`) + "비활성" 배지.
- [ ] **Step 4: `equipment-upload.tsx`** — `units-upload.tsx` 복제 후 조정: action=`uploadEquipmentExcel`, 안내 문구 "엑셀 형식: A열 = 분류, B열 = 설비명, C열 = 위치, D열 = 설치연도, E열 = 업체, F열 = 비고. 첫 행이 제목이면 자동으로 건너뜁니다.", 체크박스 "기존 설비 목록을 지우고 새로 등록 (수선 기록이 생기면 쓸 수 없습니다)", 샘플 링크 `/equipment-upload-sample.xlsx` download="설비대장_샘플.xlsx".
- [ ] **Step 5: 검증** — tsc·eslint·prettier. 수동: 화면 등록·수정·비활성, 샘플 업로드(추가·교체), 교체+기록 존재 시나리오는 Task 4 뒤에 재확인. **커밋 대기점 3**

---

### Task 4: 수선 기록 — type "repair", 즉시 채번, 모바일 폼, 첨부, 상태 전이

**Files:**
- Modify: `src/lib/documents.ts:17` — `docNoPrefixes`에 `repair: "수선",` 추가
- Modify: `src/app/(app)/modules/repairs/actions.ts` (이어서)
- Create: `src/app/(app)/modules/repairs/new/page.tsx`, `new/repair-form.tsx`
- Create: `src/app/(app)/modules/repairs/[docId]/page.tsx`, `[docId]/repair-files.tsx`, `[docId]/complete-button.tsx`, `[docId]/void-button.tsx`, `[docId]/link-equipment.tsx`
- Modify: `src/app/(app)/documents/page.tsx:10` — `LINKABLE_MODULES`에 `"repairs"` 추가

**Interfaces:**
- Produces:
  - meta 스키마(이 모듈의 계약): `{ equipmentId: string | null, equipmentName: string | null, symptom: string, action: string, vendor: string, cost: number, startedAt: "YYYY-MM-DD", completedAt: "YYYY-MM-DD" | null, imported?: true }`
  - 상태: `open`(조치 중) → `done`(완료) → `void`(폐기)
  - `createRepairRecord(_prev, formData)`, `completeRepairRecord(docId)`, `voidRepairRecord(docId)`, `linkRepairToEquipment(docId, equipmentId)`, `uploadRepairFile(_prev, formData)`, `deleteRepairFile(attachmentId)`
  - `RecordState = { error?: string } | undefined`

- [ ] **Step 1: `docNoPrefixes`에 `repair: "수선",`** — safety_training 아래 한 줄.
- [ ] **Step 2: 기록 액션들** — actions.ts에 추가:

```ts
export type RecordState = { error?: string } | undefined;

/** 문서함 검색용 평문 */
const repairPlainText = (m: {
  equipmentName: string | null; symptom: string; action: string; vendor: string;
}) =>
  [m.equipmentName, m.symptom, m.action, m.vendor].filter(Boolean).join("\n");

/**
 * 수선 기록 저장 — 초안 없음, 저장 즉시 채번(스펙 확정: 작문·검토가 없는 즉시 기록).
 * 조치까지 끝났으면 done, 아니면 open(조치 중).
 */
export async function createRepairRecord(
  _prev: RecordState, formData: FormData,
): Promise<RecordState> {
  const session = await requireRepairs();
  const tenantId = session.tenantId!;

  const symptom = String(formData.get("symptom") ?? "").trim();
  if (!symptom) return { error: "증상을 입력해 주세요." };
  const startedAt = String(formData.get("startedAt") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt))
    return { error: "수선 일자를 입력해 주세요." };

  // 설비 미지정 허용 — 기록 문턱이 낮은 게 이 모듈의 생명 (스펙 확정)
  const equipmentId = String(formData.get("equipmentId") ?? "") || null;
  const equipment = equipmentId
    ? await db.equipment.findFirst({ where: { id: equipmentId, tenantId } })
    : null;
  if (equipmentId && !equipment)
    return { error: "설비를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요." };

  const done = formData.get("done") === "on";
  const meta = {
    equipmentId: equipment?.id ?? null,
    // 이름 스냅샷 — 설비를 나중에 고쳐도 지난 기록의 표기는 불변(점검 기록과 같은 원칙)
    equipmentName: equipment?.name ?? null,
    symptom,
    action: String(formData.get("action") ?? "").trim(),
    vendor: String(formData.get("vendor") ?? "").trim(),
    cost: parseWon(formData.get("cost")),
    startedAt,
    completedAt: done ? startedAt : null,
  };

  // 파일은 문서를 만들기 전에 검사한다 — 반려됐는데 문서만 생기면 중복 기록이 된다
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES_PER_DOC)
    return { error: `첨부는 ${MAX_FILES_PER_DOC}장까지 올릴 수 있습니다.` };
  for (const f of files) {
    if (!allowedMime(f.type)) return { error: "이미지 또는 PDF만 첨부할 수 있습니다." };
    if (f.size > MAX_FILE_BYTES)
      return { error: `${f.name} — 3MB 이하만 첨부할 수 있습니다.` };
  }

  const doc = await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    type: TYPE,
    title: meta.equipmentName ? `${meta.equipmentName} ${symptom}` : symptom,
    content: repairPlainText(meta),
    status: done ? "done" : "open",
    createdById: session.userId,
    meta,
  });

  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    await db.documentAttachment.create({
      data: {
        documentId: doc.id, quoteIndex: null, name: f.name, mime: f.type,
        size: buf.byteLength,
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        data: buf,
      },
    });
  }

  revalidatePath("/modules/repairs");
  // replace — 뒤로가기의 낡은 폼 재제출 방지(점검 기록과 같은 이유)
  redirect(`/modules/repairs/${doc.id}`, RedirectType.replace);
}

/** 조치 완료 — 조건부 updateMany: 이미 완료·폐기된 기록은 아무 행도 맞지 않는다 */
export async function completeRepairRecord(docId: string) {
  const session = await requireRepairs();
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "기록을 찾을 수 없습니다." };
  await db.document.updateMany({
    where: { id: doc.id, status: "open" },
    data: {
      status: "done",
      meta: { ...(doc.meta as object), completedAt: ymdKst(new Date()) },
    },
  });
  revalidatePath("/modules/repairs");
  revalidatePath(`/modules/repairs/${doc.id}`);
  return {};
}

/** 폐기 — 완성본은 목록에 '폐기'로 남고 열람만 된다(점검 기록과 같은 규칙·경계) */
export async function voidRepairRecord(docId: string) {
  const session = await requireRepairs();
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "기록을 찾을 수 없습니다." };
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "폐기는 작성자 또는 마스터만 할 수 있습니다." };
  await db.document.updateMany({
    where: { id: doc.id, status: { not: "void" } },
    data: { status: "void" },
  });
  revalidatePath("/modules/repairs");
  redirect("/modules/repairs");
}

/** 미지정 기록을 설비에 연결 — 잡수선으로 시작한 기록도 이력 카드에 실리게 */
export async function linkRepairToEquipment(docId: string, equipmentId: string) {
  const session = await requireRepairs();
  const tenantId = session.tenantId!;
  const [doc, equipment] = await Promise.all([
    db.document.findFirst({
      where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
    }),
    db.equipment.findFirst({ where: { id: equipmentId, tenantId } }),
  ]);
  if (!doc || !equipment) return { error: "기록 또는 설비를 찾을 수 없습니다." };
  if (doc.status === "void") return { error: "폐기된 기록은 수정할 수 없습니다." };
  const meta = doc.meta as { symptom?: string };
  await db.document.update({
    where: { id: doc.id },
    data: {
      title: `${equipment.name} ${meta.symptom ?? ""}`.trim(),
      meta: {
        ...(doc.meta as object),
        equipmentId: equipment.id,
        equipmentName: equipment.name,
      },
    },
  });
  revalidatePath(`/modules/repairs/${doc.id}`);
  return {};
}
```

`uploadRepairFile` / `deleteRepairFile`: facilities의 `uploadInspectionFile` / `deleteInspectionFile`를 그대로 옮기되 `MODULE_ID`·`TYPE`·revalidate 경로만 repairs로 (완성본에도 올릴 수 있고 void만 막는 규칙 동일 — 영수증은 수선 뒤에 도착한다).

- [ ] **Step 3: 기록 폼** — `new/page.tsx`(서버): 구독 가드, `db.equipment.findMany({ where: { tenantId, active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] })`, searchParams(await) `symptom`·`vendor` 프리필(Task 7의 점검 연동이 쓴다) → `RepairForm`에 전달. `new/repair-form.tsx`(client, **모바일 한 손 입력이 명시 요구사항** — 한 컬럼, 큰 터치 타깃, `max-w-xl`):
  - 설비: native `<select name="equipmentId">` + category별 `<optgroup>` + 첫 옵션 `value=""` "설비 없이 기록 (복도 전등 등 잡수선)". 선택 시 그 설비의 vendor를 업체 칸 기본값으로(클라 state, 사용자가 이미 입력했으면 덮지 않는다).
  - 일자: `<input type="date" name="startedAt">` 기본값 오늘(`ymdKst`).
  - 증상: Input `name="symptom"` (필수). 조치: Textarea `name="action"` rows=2.
  - 업체: Input `name="vendor"`. 비용: 천 단위 콤마 표시 입력(gian-form의 `won()` 패턴 복제, `name="cost"` — 서버는 parseWon).
  - 사진: `<input type="file" name="files" accept="image/*,application/pdf" capture="environment" multiple>` — 선택 시 이미지엔 `shrinkImage(f, 1200)` 적용(record-form.tsx의 파일 상태 패턴), 목록·삭제 UI 동일 결.
  - "조치까지 끝났습니다" 체크박스 `name="done"` 기본 체크(대부분 현장에서 끝내고 기록한다). 해제 시 안내: "조치 중으로 저장됩니다.\n끝나면 기록 화면에서 완료 처리해 주세요."
  - 제출 버튼 `size="lg"` 전체 폭(모바일 엄지 존).
- [ ] **Step 4: 기록 상세** — `[docId]/page.tsx`(서버): 구독 가드, `db.document.findFirst({ where: { id, tenantId, type: "repair", moduleId: "repairs" }, include: { attachmentFiles: { select: { id, name, mime, size } } } })` 없으면 `notFound()`. 표시: PageHeader(docNo + title, 상태 pill — open은 화면에서 "조치 중"으로 표기), 정보 카드(설비[상세 링크]/일자/증상/조치/업체/비용/완료일), 첨부 패널(`repair-files.tsx` — facilities `inspection-files.tsx` 복제, repairs 액션 연결), 버튼: [조치 완료](`complete-button.tsx`, open일 때만), [폐기](`void-button.tsx` — facilities 것 복제), 미지정 기록이면 `link-equipment.tsx`(설비 select + [설비에 연결] — useTransition으로 `linkRepairToEquipment` 호출). 폐기본은 수정 버튼류 전부 숨기고 안내만.
- [ ] **Step 5: 문서함 연결** — `documents/page.tsx` `LINKABLE_MODULES`에 `"repairs"` 추가 (지난 세션 facilities 누락 버그의 재발 방지 — 새 모듈 필수 체크).
- [ ] **Step 6: 검증** — tsc·eslint·prettier. 수동(모바일 뷰포트 390px): 설비 선택→증상·비용만 입력→저장이 30초 안에 끝나는지, 미지정 저장→[설비에 연결], 저장 즉시 `수선-2026-0001` 채번, 문서함 검색에 걸리는지, 콤마 비용이 0원이 안 되는지. **커밋 대기점 4**

---

### Task 5: 설비 상세 — 타임라인·배지 + A4 이력 카드

**Files:**
- Create: `src/app/(app)/modules/repairs/equipment/[id]/page.tsx`
- Create: `src/components/equipment-history-paper.tsx`
- Create: `src/app/(app)/modules/repairs/equipment/[id]/print-button.tsx` (facilities binder의 PrintButton 복제, 문구 "이력 카드 인쇄")

**Interfaces:**
- Consumes: `repairStats`, `isRepeat` (Task 1), `PrintStyle` (`src/components/gian-paper.tsx:382`, 기본 margin "14mm 16mm"), meta 스키마(Task 4)
- Produces: `EquipmentHistoryPaper({ office, equipment, stat, records, printedAt })` — records는 시간 역순 `{ docNo: string | null; startedAt: string; symptom: string; action: string; vendor: string; cost: number; status: string }[]`

- [ ] **Step 1: 설비별 기록 조회** — 페이지에서 meta JSON 필터(findNoticeFor 선례, 단지 규모 연 수백 건에 충분):

```ts
const records = await db.document.findMany({
  where: {
    tenantId, type: "repair", status: { not: "void" },
    meta: { path: ["equipmentId"], equals: equipment.id },
  },
  select: { id: true, docNo: true, status: true, meta: true },
});
// 정렬은 meta.startedAt 역순 — createdAt은 이관 기록에서 실제 수선일과 다르다
```

- [ ] **Step 2: 화면 구성** — 정보 카드(이름·분류·위치·설치시점·업체·상태), 집계 배지 줄(SummaryBox: "최근 12개월 N회 · ₩X", "전체 N회 · ₩X"), `isRepeat`이면 AttentionCard "반복 고장 설비입니다" + "최근 12개월 3회 이상 수선했습니다.\n수리 비용 누계를 교체 판단 자료로 쓰세요.", 타임라인(시간 역순 리스트: 일자 · 문서번호(없으면 "이관") · 증상 · 조치 · 비용, 각 행은 기록 상세 링크 — 이관 기록도 문서라 링크된다), [교체 품의 만들기]는 Task 7. 아래에 `EquipmentHistoryPaper` + `PrintStyle`(기본 margin) + PrintButton.
- [ ] **Step 3: 이력 카드 컴포넌트** — 스펙 §6 그대로, 기안서 축(본문 11.5pt, `--gian-doc-line` 괘선), `id="a4-sheet"`:

```tsx
/**
 * A4 설비 이력 카드 — 인수인계 출력물. 이력이 길면 여러 장이 정상이고,
 * 쪽 나눔이 표 행 중간을 자르지 않아야 한다(tr break-inside-avoid + thead 자동 반복).
 */
export function EquipmentHistoryPaper({ office, equipment, stat, records, printedAt }: {...}) {
  return (
    <article id="a4-sheet" className="w-full max-w-[210mm] bg-white px-[16mm] py-[14mm] text-[11.5pt] leading-[1.6] [border:1.5px_solid_var(--gian-doc-line)] print:border-0 print:p-0 ...">
      <h1 className="text-center text-[16pt] font-bold tracking-[0.3em]">설비 이력 카드</h1>
      {/* 정보 표: 설비명/분류/위치/설치·교체 시점/담당 업체/상태 — 2열 th·td 표, 괘선 border-[var(--gian-doc-line)] */}
      {/* 집계 줄: 최근 12개월 수선 N회 · 누계 ₩X ｜ 전체 기간 N회 · 누계 ₩X */}
      {/* 이력 표(시간 역순): 일자 · 문서번호 · 증상 · 조치 · 업체 · 비용
          <thead>는 인쇄에서 쪽마다 자동 반복, <tr className="break-inside-avoid"> */}
      {/* 하단: 출력일 {printedAt} · {office} — "본 이력은 디벅 문서함에 원본이 보관되어 있습니다." */}
    </article>
  );
}
```

(위 골격의 주석 자리를 실제 표 마크업으로 채운다 — 정보 표는 `<table>` 6행 2열, 이력 표는 `<table className="mt-[6mm] w-full border-collapse text-[10.5pt]">` + `th/td border border-[var(--gian-doc-line)] px-2 py-1`, 비용 우측 정렬 `tabular-nums`, 조치 중 기록은 비고 없이 상태 그대로. 문서번호 없는 이관 기록은 "이관"으로 표기.)

- [ ] **Step 4: 인쇄 검증(실측)** — 시드 전이라 수동 데이터로: 기록 5건에서 인쇄 미리보기 1장, 기록 30건(임시로 폼 반복 또는 Task 6 이관 샘플 사용)에서 행이 쪽 경계에서 중간에 잘리지 않는지 확인. 브라우저 인쇄 미리보기로 확인하고 결과를 보고. **커밋 대기점 5**

---

### Task 6: 모듈 홈 + 과거 이력 엑셀 이관

**Files:**
- Create: `src/app/(app)/modules/repairs/page.tsx`
- Modify: `src/app/(app)/modules/repairs/actions.ts` — `uploadRepairHistory` 추가
- Modify: `src/app/(app)/modules/repairs/equipment/page.tsx` — 이력 이관 카드 추가
- Create: `src/app/(app)/modules/repairs/equipment/history-upload.tsx`

**Interfaces:**
- Consumes: `parseHistoryRows`, `repairStats`, `isRepeat`, `nextDocNo` 불필요(이관은 docNo null)
- Produces: `uploadRepairHistory(_prev, formData): Promise<{error?: string; success?: string} | undefined>`

- [ ] **Step 1: 이관 액션** — **추가만**(재업로드해도 기존 기록이 사라지지 않는다 — 세대와 다른 점, 주석 명기). createDocument 행별 호출 금지 — 채번·알림이 없으므로 createMany 한 방:

```ts
/**
 * 과거 수선 이력 엑셀 이관 — **추가만 한다.** 세대 업로드의 삭제-재삽입과 다른 점:
 * 기존 수선 기록은 증빙이라 업로드가 날리면 안 된다. 같은 파일을 두 번 올리면
 * 두 벌이 생긴다 — 화면 문구로 알리고, 정리는 기록 폐기로 한다.
 * 이관 기록은 채번하지 않는다(docNo null + meta.imported) — 과거 수선에 올해
 * 번호를 붙이면 대장이 거짓말을 한다.
 */
export async function uploadRepairHistory(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
) {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return gate;
  const tenantId = gate.session.tenantId!;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (file.size > 5 * 1024 * 1024)
    return { error: "5MB 이하 파일만 업로드할 수 있습니다." };

  const XLSX = await import("xlsx");
  let raw: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  } catch {
    return { error: "파일을 읽을 수 없습니다. 엑셀(.xlsx) 파일인지 확인해 주세요." };
  }
  const parsed = parseHistoryRows(raw);
  if ("error" in parsed) return parsed;

  // 설비명 → id 매칭 (이름이 대장에 없으면 미지정 기록으로 들어간다)
  const equipment = await db.equipment.findMany({
    where: { tenantId }, select: { id: true, name: true },
  });
  const byName = new Map(equipment.map((e) => [e.name, e]));

  await db.document.createMany({
    data: parsed.rows.map((r) => {
      const eq = r.equipmentName ? byName.get(r.equipmentName) : undefined;
      const meta = {
        equipmentId: eq?.id ?? null,
        equipmentName: eq?.name ?? r.equipmentName,
        symptom: r.symptom,
        action: r.action ?? "",
        vendor: r.vendor ?? "",
        cost: r.cost,
        startedAt: r.startedAt,
        completedAt: r.startedAt, // 과거 이력은 끝난 일이다
        imported: true,
      };
      return {
        tenantId,
        moduleId: MODULE_ID,
        type: TYPE,
        docNo: null,
        title: meta.equipmentName ? `${meta.equipmentName} ${r.symptom}` : r.symptom,
        content: repairPlainText(meta),
        status: "done",
        createdById: gate.session.userId,
        meta,
      };
    }),
  });
  const unmatched = parsed.rows.filter(
    (r) => r.equipmentName && !byName.has(r.equipmentName),
  ).length;
  revalidatePath("/modules/repairs");
  revalidatePath("/modules/repairs/equipment");
  return {
    success: `이력 ${parsed.rows.length}건을 가져왔습니다.` +
      (unmatched > 0 ? ` 대장에 없는 설비명 ${unmatched}건은 미지정으로 들어갔습니다.` : ""),
  };
}
```

- [ ] **Step 2: `history-upload.tsx`** — equipment-upload와 같은 결(useActionState + FileUpload + 샘플 링크 `/repair-history-sample.xlsx`). 안내: "과거 수첩·엑셀의 수선 이력을 가져옵니다.\n추가만 되므로 같은 파일을 두 번 올리면 두 벌이 생깁니다." 대장 화면에 "과거 이력 가져오기" 카드로 배치(설비 업로드 카드 아래).
- [ ] **Step 3: 모듈 홈** — `page.tsx`(서버, facilities 홈의 결):
  - 구독 가드. 데이터: `db.equipment.findMany({ where: { tenantId } })` + `db.document.findMany({ where: { tenantId, type: "repair", status: { not: "void" } }, orderBy: { createdAt: "desc" }, select: { id, docNo, status, title, meta, createdAt } })`.
  - 온보딩: 설비 0대 + 기록 0건이면 안내 카드("설비 대장을 먼저 올리면 수선이 설비별 이력으로 쌓입니다.\n대장 없이 바로 기록부터 시작해도 됩니다." + [설비 대장] [기록 작성] 버튼) — 마법사 리다이렉트 없음(기록 문턱이 낮은 게 생명).
  - SummaryBox 4칸: 조치 중 N건(`status === "open"`) / 이번 달 N건 / 이번 달 비용 ₩X(meta.startedAt이 이번 달 KST) / 등록 설비 N대.
  - **반복 고장 경고 카드**: 활성 설비별로 records를 `meta.equipmentId`로 묶어 `repairStats` → `isRepeat`인 설비를 `cost12m` 내림차순으로 AttentionCard에 나열("최근 12개월 {n}회 · ₩{cost}" + 설비 상세 링크). 열 때 계산 — 크론 없음(스펙 확정).
  - 조치 중 목록(있으면): 행 클릭 → 기록 상세.
  - 최근 기록 리스트(최근 10건: docNo(없으면 "이관") · 제목 · 일자 · 상태 pill — open은 "조치 중" 표기).
  - 헤더 버튼: [설비 대장](outline) / [기록 작성](primary).
- [ ] **Step 4: 검증** — 샘플 이력 업로드 → 홈 KPI·설비 타임라인·이력 카드에 반영, 재업로드 시 기존 기록 유지(두 벌 생김도 확인), tsc·eslint·prettier. Task 5의 30건 인쇄 실측을 이관 데이터로 재확인. **커밋 대기점 6**

---

### Task 7: 연동 — [교체 품의 만들기] + 점검 지적사항 → [수선 등록]

**Files:**
- Modify: `src/app/(app)/modules/approvals/new/gian-form.tsx:63-84` — `defaults` prop
- Modify: `src/app/(app)/modules/approvals/new/page.tsx` — searchParams 프리필 전달
- Modify: `src/app/(app)/modules/repairs/equipment/[id]/page.tsx` — [교체 품의 만들기] 버튼
- Modify: `src/app/(app)/modules/facilities/[docId]/page.tsx` — 지적 기록에 [수선 등록] 버튼

**Interfaces:**
- Consumes: `isSubscribed`, `needsFindings` (`src/lib/inspection/catalog`), Task 4의 repairs/new searchParams 프리필(`symptom`, `vendor`)
- Produces: `GianForm`의 `defaults?: { work?: string; why?: string }` prop

- [ ] **Step 1: GianForm 프리필** — prop 추가 후 초기값만 바꾼다(다른 로직 불변):

```tsx
export function GianForm({ internal, external, directorLimit, defaults }: {
  ...
  /** 다른 모듈에서 넘어온 초기값 — 설비 교체 품의(repairs)가 쓴다 */
  defaults?: { work?: string; why?: string };
}) {
  ...
  const [work, setWork] = useState(defaults?.work ?? "");
  const [why, setWhy] = useState(defaults?.why ?? "");
```

`approvals/new/page.tsx`: `searchParams`(Promise — await) 에서 `work`·`why`를 `String(...).slice(0, 500)`으로 받아 `<GianForm defaults={{ work, why }} ... />`. 값이 없으면 undefined — 기존 동작 불변.

- [ ] **Step 2: [교체 품의 만들기]** — 설비 상세 페이지에서 `isSubscribed(tenantId, "approvals")`일 때만 버튼 노출(미구독이면 버튼 자체가 없다 — 잠금 유도 배너 금지, 홈/헤더 모듈 종속 버튼 금지 규칙의 정신):

```tsx
{approvalsSubscribed && (
  <Button asChild variant="outline" size="lg">
    <Link href={`/modules/approvals/new?work=${encodeURIComponent(`${equipment.name} 교체`)}&why=${encodeURIComponent(whyText)}`}>
      <Stamp className="size-4" /> 교체 품의 만들기
    </Link>
  </Button>
)}
```

`whyText` = `` `최근 12개월 수선 ${stat.count12m}회, 비용 누계 ${stat.cost12m.toLocaleString()}원. 전체 기간 ${stat.countAll}회, ${stat.costAll.toLocaleString()}원. 반복 수선으로 교체 검토가 필요함.` `` — 사실 서술만. **장충금 판정·결재선은 gian 규칙 엔진이 담당** — 이 모듈은 근거만 넘긴다(법 해석은 코드가 하지 않는다).

- [ ] **Step 3: 점검 → 수선** — facilities 기록 상세에서 지적이 있는 기록(`needsFindings(meta.result)` 또는 `meta.findings`가 비어 있지 않음)이고 `isSubscribed(tenantId, "repairs")`이면:

```tsx
<Button asChild variant="outline">
  <Link href={`/modules/repairs/new?symptom=${encodeURIComponent(`${meta.itemName} 점검 지적: ${meta.findings}`.slice(0, 200))}&vendor=${encodeURIComponent(meta.vendor ?? "")}`}>
    <Wrench className="size-4" /> 수선 등록
  </Link>
</Button>
```

repairs/new는 Task 4 Step 3에서 이미 searchParams 프리필을 받는다. facilities 화면의 기존 배치를 존중해 후속 조치·첨부 근처에 둔다.

- [ ] **Step 4: 검증** — repairs 상세→품의 폼에 공사명·사유 프리필, approvals 미구독 시 버튼 없음(시드 단지에서 구독 토글로 확인), 지적 있는 점검 기록(시드 `점검-{year}-0003` 저수조, findings 있음)→수선 폼에 증상·업체 프리필, tsc·eslint·prettier. **커밋 대기점 7**

---

### Task 8: 출시 — 레지스트리 등록 + 데모 시드

**Files:**
- Modify: `prisma/seed.ts` — MODULES 행 + 데모 구독 + 데모 데이터

**Interfaces:**
- Consumes: 전 Task 완료 상태 (모듈 라우트 구현 전 `isActive: true` 금지 — 체험 소진 규칙. 이 Task가 마지막인 이유)

- [ ] **Step 1: 레지스트리 행** — MODULES 배열 facilities 다음에:

```ts
// repairs — 설비 대장(테이블) + 수선 기록(Document). 아이콘 Wrench는 이 모듈 것
// (facilities는 법정점검 대장으로 재정의되며 ClipboardCheck로 이미 정리됨 — 2026-08-05 합의)
{ id: "repairs", name: "설비·수선 이력", description: "수선 한 건을 30초에 기록하면 설비별 이력과 비용이 쌓여 인수인계 자료가 저절로 나와요", icon: "Wrench", route: "/modules/repairs", price: 15000, sortOrder: 9, isActive: true },
```

(`module-icons.ts`는 Wrench 매핑이 이미 있어 수정 불필요 — 확인만. facilities 설명·아이콘 정리는 법정점검 세션에서 이미 완료 — 확인만.)

- [ ] **Step 2: 데모 구독** — seed의 데모 단지 구독 배열(`["dunning", "notice", ...]`)에 `"repairs"` 추가.
- [ ] **Step 3: 데모 데이터** — 없을 때만 심는다(다른 시드와 같은 규칙). 설비 8대(분류 골고루) + 기록 15건(그중 "지하 1층 급수펌프 #2"에 최근 12개월 4건 → 홈 경고 카드가 서는 시연). 기록은 `db.document.createMany`로, docNo는 `수선-${year}-0001`부터 순번 직접 부여(트랜잭션 불필요 — 시드는 단독 실행), 조치 중 1건(`status: "open"`, completedAt null) 포함:

```ts
// 수선 데모 — 설비 8 + 기록 15 (반복 고장 1대 포함: 홈 경고 카드 시연)
if ((await db.equipment.count({ where: { tenantId: tenant.id } })) === 0) {
  await db.equipment.createMany({ data: [
    { tenantId: tenant.id, name: "지하 1층 급수펌프 #2", category: "급수·배수", location: "지하 1층 기계실", installedAt: new Date("2015-01-01T00:00:00+09:00"), vendor: "한국펌프 02-1234-5678" },
    { tenantId: tenant.id, name: "101동 승강기 1호기", category: "승강기", location: "101동", installedAt: new Date("2008-01-01T00:00:00+09:00"), vendor: "한국엘리베이터" },
    // ... 난방·보일러 / 전기 / 소방 / 건축·외벽 / 조경·부대시설 / 기타 각 1대
  ]});
  const pump = await db.equipment.findFirst({ where: { tenantId: tenant.id, name: "지하 1층 급수펌프 #2" } });
  // 기록 15건 — 급수펌프 최근 12개월 4건(반복), 나머지는 설비 분산 + 미지정 2건 + 조치 중 1건
  // meta·title·content는 Task 4의 규칙 그대로, startedAt은 최근 18개월에 분포
  await db.document.createMany({ data: [ /* ... docNo: `수선-${year}-0001` ... */ ]});
}
```

- [ ] **Step 4: 시드 실행 + 전체 점검** — `npx prisma db seed`. 확인 목록(= 스펙 수용 기준):
  1. 모바일 뷰포트에서 기록 30초 흐름
  2. 미지정 저장 → [설비에 연결]
  3. 저장 즉시 `수선-YYYY-####`, 문서함 검색·링크
  4. `npx tsx repairs.test.ts` (12개월 경계·조치 중 포함 고정)
  5. 홈 경고 카드에 급수펌프
  6. 이력 카드 5건 1장·30건 행 안 잘림(인쇄 미리보기)
  7. 설비 교체 업로드는 기록 있으면 거부, 이력 재업로드는 기존 기록 유지
  8. [교체 품의 만들기] 프리필·미구독 숨김
  9. 콤마 비용 정상(parseWon)
  10. `npx tsx tenant-deletion.test.ts`
  11. 요금표(/subscriptions)에 "설비·수선 이력" 월 15,000원 노출
  12. `ANTHROPIC_API_KEY` 검색 결과에 repairs 파일 없음
- [ ] **Step 5: 최종 검증** — `npx tsc --noEmit`, 전체 신규 파일 eslint·prettier. **커밋 대기점 8** (레지스트리·시드·아이콘 확인이 같은 커밋 — 동작·문구 동기 규칙)
