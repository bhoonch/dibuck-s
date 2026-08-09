import { addMonthsYmd } from "@/lib/inspection/schedule";
import { parseWon } from "@/lib/won";

/** 설비 분류 — 법정 값이 아니라 앱의 정리 축. 엑셀의 모르는 분류는 "기타"로 받는다 */
export const EQUIPMENT_CATEGORIES = [
  "승강기",
  "급수·배수",
  "전기",
  "소방",
  "난방·보일러",
  "건축·외벽",
  "조경·부대시설",
  "기타",
] as const;

/**
 * 설비명 매칭 키 — 공백만 지운 것. "급수펌프 #2"와 "급수펌프#2"는 같은 설비다.
 * 표시는 언제나 원래 이름으로 한다(키는 비교 전용).
 *
 * 유사도 매칭(편집거리 등)은 일부러 하지 않는다 — "승강기 1호기"와 "승강기 2호기"를
 * 붙이면 이력이 거짓이 되고, 틀렸다는 걸 아무도 모른다. 못 붙은 이름은 감추지 말고
 * 사용자에게 그대로 돌려준다.
 */
export const equipKey = (name: string) => name.replace(/\s+/g, "");

export const MAX_EQUIPMENT_ROWS = 2000;
export const MAX_HISTORY_ROWS = 10000;
/** 반복 고장 판정 — 최근 12개월 수선 횟수 임계 */
export const REPEAT_COUNT_12M = 3;

const cell = (r: unknown[], i: number) => String(r[i] ?? "").trim();
const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** "2015" 연 단위 입력 허용 — 1월 1일로 저장 */
const installYmd = (v: string) =>
  isYmd(v) ? v : /^\d{4}$/.test(v) ? `${v}-01-01` : null;

export type EquipmentRow = {
  name: string;
  category: string;
  location: string | null;
  installedAt: string | null;
  vendor: string | null;
  note: string | null;
};

/** 설비 엑셀: A분류 B설비명 C위치 D설치연도 E업체 F비고. 첫 행 머리글 자동 건너뜀 */
export function parseEquipmentRows(
  rows: unknown[][],
): { rows: EquipmentRow[] } | { error: string } {
  const body = rows
    .filter((r) => Array.isArray(r) && cell(r, 1))
    .filter((r) => cell(r, 0) !== "분류" && cell(r, 1) !== "설비명");
  if (body.length === 0)
    return {
      error:
        "등록할 설비가 없습니다. A열=분류, B열=설비명 형식인지 확인해 주세요.",
    };
  if (body.length > MAX_EQUIPMENT_ROWS)
    return {
      error: `한 번에 ${MAX_EQUIPMENT_ROWS.toLocaleString()}대까지 등록할 수 있습니다. 파일을 나눠 올려 주세요.`,
    };
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
  startedAt: string;
  equipmentName: string | null;
  symptom: string;
  action: string | null;
  vendor: string | null;
  cost: number;
};

/** 과거 이력 엑셀: A일자 B설비명 C증상 D조치 E업체 F비용. 일자·증상 없는 행은 버린다 */
export function parseHistoryRows(
  rows: unknown[][],
): { rows: HistoryRow[] } | { error: string } {
  const body = rows.filter(
    (r) => Array.isArray(r) && isYmd(cell(r, 0)) && cell(r, 2),
  );
  if (body.length === 0)
    return {
      error:
        "가져올 이력이 없습니다. A열=일자(YYYY-MM-DD), C열=증상 형식인지 확인해 주세요.",
    };
  if (body.length > MAX_HISTORY_ROWS)
    return {
      error: `한 번에 ${MAX_HISTORY_ROWS.toLocaleString()}건까지 가져올 수 있습니다. 파일을 나눠 올려 주세요.`,
    };
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
  count12m: number;
  cost12m: number;
  countAll: number;
  costAll: number;
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
