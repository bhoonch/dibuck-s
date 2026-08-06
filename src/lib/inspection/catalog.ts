/**
 * 법정점검 카탈로그 — 항목·주기·근거의 유일한 원본.
 *
 * DB에 넣지 않는 이유: 법정 주기는 상품 정책이 아니라 법이 정하는 값이라
 * 코드 개정으로만 바뀌어야 한다(safety-training 법정 시간표와 같은 원칙).
 * 단지별 활성 항목은 InspectionItem이 이 카탈로그의 **스냅샷**을 들고 있어,
 * 여기를 고쳐도 이미 켜 둔 항목과 지난 증빙은 변하지 않는다.
 *
 * 근거는 확실한 조문만 쓴다 — 고시 호수·개정 연도 금지(개정되면 틀린 근거가 된다).
 * "우리 단지가 대상인가"는 코드가 판정하지 않는다: 마법사가 쉬운 말로 묻고
 * 사용자가 켜고 끈다(법 조문 해석은 코드가 하지 않는다 — 전결 한도와 같은 원칙).
 * 주기·근거 출처는 docs/superpowers/specs/2026-08-05-legal-inspection-prompt.md 부록.
 */

export type CycleType = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | "YEARS";

export type Cycle = {
  type: CycleType;
  /** YEARS일 때 몇 년 주기인가 (예: 2, 3) */
  n?: number;
};

/** 자체 수행 / 유지관리업체 / 검사기관 — 리드타임과 준비 안내 문구가 갈린다 */
export type Executor = "SELF" | "VENDOR" | "AGENCY";

export type CatalogItem = {
  key: string;
  label: string;
  category: "소방" | "승강기" | "급수·위생" | "전기" | "시설" | "기타";
  legalBasis: string;
  cycle: Cycle;
  executor: Executor;
  /** 준비 리드타임(일) — 업체 예약·기관 접수가 필요한 항목은 30, 자체는 7 */
  leadDays: number;
  /** "승강기가 있는 단지" — 설정 마법사 질문에 쓴다 */
  applicableHint: string;
};

export const INSPECTION_CATALOG: CatalogItem[] = [
  // ── 소방 ──
  {
    key: "fire_operation",
    label: "소방시설 작동점검",
    category: "소방",
    legalBasis: "소방시설 설치 및 관리에 관한 법률 제22조",
    cycle: { type: "ANNUAL" },
    executor: "VENDOR",
    leadDays: 30,
    applicableHint: "소방시설이 설치된 모든 단지",
  },
  {
    key: "fire_comprehensive",
    label: "소방시설 종합점검",
    category: "소방",
    legalBasis: "소방시설 설치 및 관리에 관한 법률 제22조",
    cycle: { type: "ANNUAL" },
    executor: "VENDOR",
    leadDays: 30,
    applicableHint: "스프링클러설비 등이 설치된 단지 (대상 여부는 점검 업체에 확인)",
  },
  {
    key: "fire_drill",
    label: "소방훈련·교육",
    category: "소방",
    legalBasis: "화재의 예방 및 안전관리에 관한 법률 제37조",
    cycle: { type: "ANNUAL" },
    executor: "SELF",
    leadDays: 7,
    applicableHint: "소방안전관리자를 두는 단지 (사실상 모든 의무관리 단지)",
  },
  // ── 승강기 ──
  {
    key: "elevator_self",
    label: "승강기 자체점검",
    category: "승강기",
    legalBasis: "승강기 안전관리법 제31조",
    cycle: { type: "MONTHLY" },
    executor: "VENDOR",
    leadDays: 7,
    applicableHint: "승강기가 있는 단지",
  },
  {
    key: "elevator_regular",
    label: "승강기 정기검사",
    category: "승강기",
    legalBasis: "승강기 안전관리법 제32조",
    cycle: { type: "ANNUAL" },
    executor: "AGENCY",
    leadDays: 30,
    applicableHint: "승강기가 있는 단지",
  },
  // ── 급수·위생 ──
  {
    key: "tank_cleaning",
    label: "저수조 청소",
    category: "급수·위생",
    legalBasis: "수도법 제33조, 같은 법 시행규칙 제22조의3",
    cycle: { type: "SEMIANNUAL" },
    executor: "VENDOR",
    leadDays: 30,
    applicableHint: "저수조(물탱크)가 있는 단지",
  },
  {
    key: "water_quality",
    label: "수질검사",
    category: "급수·위생",
    legalBasis: "수도법 제33조, 같은 법 시행규칙 제22조의3",
    cycle: { type: "ANNUAL" },
    executor: "AGENCY",
    leadDays: 30,
    applicableHint: "저수조(물탱크)가 있는 단지",
  },
  {
    key: "septic_cleaning",
    label: "정화조 내부청소",
    category: "급수·위생",
    legalBasis: "하수도법 제39조",
    cycle: { type: "ANNUAL" },
    executor: "VENDOR",
    leadDays: 30,
    applicableHint: "정화조가 설치된 단지 (공공하수도 직결 단지는 해당 없음)",
  },
  // ── 전기 ──
  {
    key: "electric_regular",
    label: "전기설비 정기검사",
    category: "전기",
    legalBasis: "전기안전관리법 제11조",
    // 공동주택 수전설비는 3년 주기가 일반적 — 검사기관이 통지하는 검사 시기가 기준이다
    cycle: { type: "YEARS", n: 3 },
    executor: "AGENCY",
    leadDays: 30,
    applicableHint: "자가용 전기설비(수전설비)가 있는 단지 — 주기는 검사기관 통지 기준",
  },
  // ── 시설 ──
  {
    key: "playground_monthly",
    label: "어린이놀이시설 안전점검",
    category: "시설",
    legalBasis: "어린이놀이시설 안전관리법 제15조",
    cycle: { type: "MONTHLY" },
    executor: "SELF",
    leadDays: 7,
    applicableHint: "어린이 놀이터가 있는 단지",
  },
  {
    key: "playground_facility",
    label: "어린이놀이시설 정기시설검사",
    category: "시설",
    legalBasis: "어린이놀이시설 안전관리법 제12조",
    cycle: { type: "YEARS", n: 2 },
    executor: "AGENCY",
    leadDays: 30,
    applicableHint: "어린이 놀이터가 있는 단지",
  },
  {
    key: "apt_safety",
    label: "공동주택 안전점검",
    category: "시설",
    legalBasis: "공동주택관리법 제33조",
    cycle: { type: "SEMIANNUAL" },
    executor: "SELF",
    leadDays: 14,
    applicableHint: "의무관리대상 공동주택 (16층 이상 등은 자격을 갖춘 자의 점검)",
  },
  {
    key: "building_regular",
    label: "건축물 정기점검",
    category: "시설",
    legalBasis: "건축물관리법 제13조",
    cycle: { type: "YEARS", n: 3 },
    executor: "AGENCY",
    leadDays: 30,
    applicableHint: "다중이용 건축물 등 대상 단지 (지자체 통지를 받은 단지)",
  },
];

export const catalogItemOf = (key: string) =>
  INSPECTION_CATALOG.find((c) => c.key === key);

// ── 점검 결과 판정 ──────────────────────────────────────────────
/**
 * 어린이놀이시설 월 점검만 4단계 판정을 쓴다.
 *
 * 이 항목의 법정 서식은 **안전점검 실시대장**(어린이놀이시설 안전관리법 시행규칙
 * 별지 제16호서식, 최종 기재일부터 3년 보관)이고 우리 점검일지가 그 대장을
 * 대신한다 — 서식이 쓰는 판정어를 그대로 써야 감사에서 설명이 필요 없다.
 * 판정은 **놀이기구 단위**다: 미끄럼틀만 이용금지인데 단지 전체를 이용금지로
 * 적으면 대장이 사실과 다르다.
 *
 * (월 점검 결과를 cpf.go.kr에 입력하라는 조항은 확인되지 않았다. 법이 요구하는
 *  것은 대장 기록·보관이다 — 지자체가 별도로 시스템 등록을 요구할 수는 있다.)
 *
 * 나머지 12개 항목은 법이 정한 판정어가 없어 2단계 그대로.
 */
const PLAYGROUND_RESULTS = ["양호", "요주의", "요수리", "이용금지"];
const DEFAULT_RESULTS = ["정상", "지적사항"];

/** 서버 검증용 — 폼이 무엇을 보내든 이 목록 밖의 판정은 저장하지 않는다 */
export const ALL_RESULTS = [...DEFAULT_RESULTS, ...PLAYGROUND_RESULTS];

export const isPlayground = (presetKey?: string | null) =>
  presetKey === "playground_monthly";

export const resultChoicesOf = (presetKey?: string | null): string[] =>
  isPlayground(presetKey) ? PLAYGROUND_RESULTS : DEFAULT_RESULTS;

/** 판정어의 뜻(행정안전부 안전점검 기준) — 입력 폼과 A4가 같은 문장을 쓴다 */
export const RESULT_HINT: Record<string, string> = {
  양호: "위해·위험을 발생시킬 요소가 없음",
  요주의: "위해·위험 요소는 없으나 제조업체가 정한 사용연한이 지남",
  요수리: "틈·헐거움·날카로움이 생길 가능성이 있거나, 더럽거나 안전표시가 훼손됨",
  이용금지: "틈·헐거움·날카로움이 있거나 위해가 발생함",
};

/** 이상 없음 판정만 지적 내용을 비울 수 있다 — 요주의도 무엇이 걸리는지 남아야 대장이 산다 */
export const needsFindings = (result: string) =>
  result !== "정상" && result !== "양호";

/**
 * 기구별 판정 → 기록 대표 판정. 가장 나쁜 것이 이긴다 —
 * 현황판·문서함·검색은 대표 판정 하나만 읽으므로, 여기서 좋은 쪽을 고르면
 * "이용금지 기구가 있는 기록"이 목록에서 양호로 보인다.
 */
export function worstResult(results: string[], choices: string[]): string {
  return results.reduce(
    (worst, r) => (choices.indexOf(r) > choices.indexOf(worst) ? r : worst),
    choices[0],
  );
}

/** 법 제15조제1항이 정한 점검 범위 — 놀이시설 일지 하단에 그대로 찍는다 */
export const PLAYGROUND_SCOPE =
  "연결상태, 노후정도, 변형상태, 청결상태, 안전수칙 등의 표시상태, 부대시설의 파손 상태 및 위험물질의 존재 여부";

/** "월 1회" · "2년 1회" — 화면·문서 공용 표기 */
export function cycleLabel(cycle: Cycle): string {
  switch (cycle.type) {
    case "MONTHLY":
      return "월 1회";
    case "QUARTERLY":
      return "분기 1회";
    case "SEMIANNUAL":
      return "반기 1회";
    case "ANNUAL":
      return "연 1회";
    case "YEARS":
      return `${cycle.n ?? 1}년 1회`;
  }
}

/** 사용자 정의 항목의 주기 선택지 — 카탈로그와 같은 형식 */
export const CYCLE_CHOICES: { value: string; label: string; cycle: Cycle }[] = [
  { value: "MONTHLY", label: "월 1회", cycle: { type: "MONTHLY" } },
  { value: "QUARTERLY", label: "분기 1회", cycle: { type: "QUARTERLY" } },
  { value: "SEMIANNUAL", label: "반기 1회", cycle: { type: "SEMIANNUAL" } },
  { value: "ANNUAL", label: "연 1회", cycle: { type: "ANNUAL" } },
  { value: "YEARS_2", label: "2년 1회", cycle: { type: "YEARS", n: 2 } },
  { value: "YEARS_3", label: "3년 1회", cycle: { type: "YEARS", n: 3 } },
];

/** 설정 마법사 질문 — 한 질문이 항목 여러 개를 한 번에 켠다 */
export const WIZARD_QUESTIONS: {
  key: string;
  question: string;
  hint: string;
  /** 예라고 답하면 켜지는 카탈로그 키 */
  itemKeys: string[];
  /** 대부분 해당되는 질문은 기본 체크 */
  defaultOn: boolean;
}[] = [
  {
    key: "fire",
    question: "소방시설(소화기·옥내소화전 등)이 설치되어 있나요?",
    hint: "아파트는 사실상 전부 해당됩니다 — 작동점검과 소방훈련이 켜집니다.",
    itemKeys: ["fire_operation", "fire_drill"],
    defaultOn: true,
  },
  {
    key: "sprinkler",
    question: "스프링클러가 설치되어 있나요?",
    hint: "설치되어 있으면 종합점검 대상일 수 있습니다 — 정확한 대상 여부는 점검 업체에 확인하세요.",
    itemKeys: ["fire_comprehensive"],
    defaultOn: false,
  },
  {
    key: "elevator",
    question: "승강기(엘리베이터)가 있나요?",
    hint: "월 1회 자체점검과 연 1회 정기검사가 켜집니다.",
    itemKeys: ["elevator_self", "elevator_regular"],
    defaultOn: true,
  },
  {
    key: "tank",
    question: "저수조(물탱크)가 있나요?",
    hint: "반기 1회 청소와 연 1회 수질검사가 켜집니다.",
    itemKeys: ["tank_cleaning", "water_quality"],
    defaultOn: true,
  },
  {
    key: "septic",
    question: "정화조가 설치되어 있나요?",
    hint: "공공하수도에 바로 연결된 단지는 해당 없습니다.",
    itemKeys: ["septic_cleaning"],
    defaultOn: false,
  },
  {
    key: "electric",
    question: "수전설비(변전실·큐비클)가 있나요?",
    hint: "아파트는 대부분 해당됩니다 — 전기설비 정기검사가 켜집니다.",
    itemKeys: ["electric_regular"],
    defaultOn: true,
  },
  {
    key: "playground",
    question: "어린이 놀이터가 있나요?",
    hint: "월 1회 안전점검과 2년 1회 정기시설검사가 켜집니다. 월 점검 결과는 안전점검 실시대장으로 3년간 보관해야 합니다 — 여기서 만드는 점검일지가 그 대장입니다.",
    itemKeys: ["playground_monthly", "playground_facility"],
    defaultOn: true,
  },
  {
    key: "apt",
    question: "의무관리대상 공동주택인가요? (300세대 이상 등)",
    hint: "반기 1회 공동주택 안전점검이 켜집니다. 건축물 정기점검 통지를 받은 단지는 [항목 관리]에서 따로 켜세요.",
    itemKeys: ["apt_safety"],
    defaultOn: true,
  },
];
