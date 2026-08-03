/**
 * 산업안전보건 교육일지 — 법정 값·주제 카탈로그·반기 판정 순수 함수.
 * 클라이언트 폼이 직접 import하므로 db·Anthropic을 물면 안 된다(notice-catalog와 같은 규칙).
 * LLM 호출은 safety-training-ai.ts, 검증은 `npx tsx safety-training.test.ts`.
 */

// ── 법정 값 — 산업안전보건법 시행규칙 별표 4. 개정되면 여기 한 곳만 고친다 ──

export const LEGAL_HOURS = {
  regularOffice: "매반기 6시간 이상",
  regularField: "매반기 12시간 이상",
  newHire: "8시간 이상 (일용·1주 이하 기간제는 1시간)",
  supervisor: "연간 16시간 이상",
} as const;

/** 문서에 인용하는 근거 — 고시 호수·개정 연도는 쓰지 않는다(개정되면 틀린 근거가 된다) */
export const LEGAL_BASIS =
  "산업안전보건법 제29조, 같은 법 시행규칙 별표 4·별표 5";

// ── 교육 종류 ──

export type CourseType = "regular" | "new_hire" | "supervisor";

export const COURSE_TYPES: {
  key: CourseType;
  label: string;
  /** 카드에 보이는 법정 시간 힌트 */
  hours: string;
  desc: string;
}[] = [
  {
    key: "regular",
    label: "정기교육",
    hours: `사무직 ${LEGAL_HOURS.regularOffice} · 그 외 ${LEGAL_HOURS.regularField}`,
    desc: "전 직원이 매반기 받는 기본 교육",
  },
  {
    key: "new_hire",
    label: "채용 시 교육",
    hours: LEGAL_HOURS.newHire,
    desc: "신규 채용자가 업무 시작 전에 받는 교육",
  },
  {
    key: "supervisor",
    label: "관리감독자 교육",
    hours: LEGAL_HOURS.supervisor,
    desc: "관리소장 등 지휘·감독 위치의 직원 대상",
  },
];

export const courseTypeOf = (key: string) =>
  COURSE_TYPES.find((c) => c.key === key);

// ── 직원 명부 ──

export const STAFF_POSITIONS = ["사무", "기전", "경비", "미화", "기타"] as const;

/** 완성된 일지에 남는 참석자 스냅샷 — 명부를 나중에 고쳐도 지난 증빙은 불변 */
export type AttendeeSnap = { name: string; position: string; office: boolean };

// ── 주제 카탈로그 — 화면은 현재 반기 계절 주제를 앞에 배치한다 ──

export type TrainingTopic = {
  key: string;
  label: string;
  /** h1 상반기 계절 · h2 하반기 계절 · all 연중(직무) */
  season: "h1" | "h2" | "all";
  /** 주 대상 직종 힌트 (빈 문자열 = 전체) */
  audience: string;
  /** 다룰 내용 한 줄 */
  hint: string;
  /**
   * 이 주제가 해당하는 교육 종류 — 시행규칙 별표 5의 교육 종류별 내용 기준.
   * 화면은 선택한 교육에 해당하는 주제만 활성화한다(비해당은 회색·선택 불가,
   * 사용자 결정 2026-08-03 — 잘못 담기는 사고 차단을 유연성보다 우선).
   */
  courses: CourseType[];
};

export const TRAINING_TOPICS: TrainingTopic[] = [
  // 계절 — 상반기. 계절 순회 주제는 정기교육의 것이다
  { key: "thaw", label: "해빙기 시설물 안전", season: "h1", audience: "", hint: "옹벽·축대 균열 점검, 지반 침하 주의", courses: ["regular"] },
  { key: "spring_fire", label: "봄철 화재 예방", season: "h1", audience: "", hint: "건조기 화기 취급, 세대 화재 예방 안내", courses: ["regular"] },
  { key: "dust", label: "미세먼지·황사 건강관리", season: "h1", audience: "", hint: "옥외 작업 시 마스크 착용, 세척·세안", courses: ["regular"] },
  { key: "rainy", label: "장마철 감전·누전 예방", season: "h1", audience: "기전", hint: "침수 구역 전기 차단, 누전차단기 점검", courses: ["regular"] },
  { key: "heatwave", label: "폭염 대비 온열질환 예방", season: "h1", audience: "", hint: "물·그늘·휴식, 온열질환 증상과 응급조치", courses: ["regular"] },
  // 계절 — 하반기
  { key: "typhoon", label: "태풍·집중호우 대응", season: "h2", audience: "", hint: "배수로 점검, 낙하물 결속, 침수 대비", courses: ["regular"] },
  { key: "autumn_fire", label: "가을철 화재 예방", season: "h2", audience: "", hint: "건조한 날씨 화기 취급, 낙엽 화재 주의", courses: ["regular"] },
  { key: "coldwave", label: "한파 대비 한랭질환 예방", season: "h2", audience: "", hint: "방한복 착용, 저체온증·동상 증상과 조치", courses: ["regular"] },
  { key: "freeze", label: "동파·제설 작업 안전", season: "h2", audience: "", hint: "계량기 보온, 제설 작업 시 미끄럼·심혈관 주의", courses: ["regular"] },
  { key: "ice", label: "빙판길 넘어짐 예방", season: "h2", audience: "", hint: "결빙 구간 모래·염화칼슘, 보행 요령", courses: ["regular"] },
  // 직무 — 연중. 신규자가 바로 배워야 하는 직무 위험은 채용 시에도 해당
  { key: "electric", label: "전기 작업 안전", season: "all", audience: "기전", hint: "차단·검전·잠금 절차, 감전 시 응급조치", courses: ["regular", "new_hire"] },
  { key: "ladder", label: "사다리·고소작업 안전", season: "all", audience: "", hint: "2인 1조, 아웃트리거·안전모, 최상단 금지", courses: ["regular", "new_hire"] },
  { key: "confined", label: "밀폐공간(저수조·정화조) 질식 재해 예방", season: "all", audience: "기전", hint: "산소 농도 측정, 환기, 감시인 배치", courses: ["regular", "supervisor"] },
  { key: "tools", label: "전동공구·수공구 안전", season: "all", audience: "기전", hint: "보호구 착용, 점검·보관, 회전체 주의", courses: ["regular", "new_hire"] },
  { key: "musculo", label: "근골격계 질환 예방", season: "all", audience: "미화·경비", hint: "중량물 취급 자세, 스트레칭, 반복 작업 휴식", courses: ["regular", "new_hire"] },
  { key: "chemicals", label: "청소·소독 약품(화학물질) 취급 안전", season: "all", audience: "미화", hint: "혼합 금지(락스+산성), 보호장갑, 환기", courses: ["regular", "new_hire"] },
  { key: "parking", label: "차량·주차장 사고 예방", season: "all", audience: "경비", hint: "차량 유도 요령, 후진 차량 주의, 야간 시인성", courses: ["regular", "new_hire"] },
  { key: "elevator", label: "승강기 갇힘·구조 대응", season: "all", audience: "", hint: "갇힘 신고 접수 요령, 임의 구출 금지, 유지보수 업체 호출", courses: ["regular", "new_hire"] },
  { key: "cpr", label: "응급처치·심폐소생술", season: "all", audience: "", hint: "심폐소생술 순서, 자동심장충격기 위치와 사용법", courses: ["regular", "new_hire", "supervisor"] },
  { key: "stress", label: "직무스트레스·감정노동 관리", season: "all", audience: "", hint: "입주민 응대 스트레스, 폭언 대응 절차, 상담 안내", courses: ["regular", "new_hire"] },
  { key: "harassment", label: "직장 내 괴롭힘 예방", season: "all", audience: "", hint: "괴롭힘의 판단 기준, 신고 절차, 2차 피해 방지", courses: ["regular", "new_hire"] },
  { key: "fire_evac", label: "화재 대피 요령·소화기 사용법", season: "all", audience: "", hint: "대피 경로·집결지, 소화기·옥내소화전 사용법", courses: ["regular", "new_hire", "supervisor"] },
  { key: "sanjae", label: "산재보상 제도 안내", season: "all", audience: "", hint: "업무상 재해 신고 절차, 산재보험 급여 종류", courses: ["regular", "new_hire"] },
  // 전용 — 채용 시 (별표 5 채용 시 교육 내용: 기계·기구 위험성, 법령·관리체계, 작업 절차)
  { key: "nh_intro", label: "단지 시설·작업환경과 위험요인 안내", season: "all", audience: "", hint: "담당 구역·시설 안내, 기계·기구 위험성과 안전수칙", courses: ["new_hire"] },
  { key: "nh_law", label: "산업안전보건법령·안전보건관리체계 안내", season: "all", audience: "", hint: "법령 요지, 관리체계와 담당자, 건의·신고 절차", courses: ["new_hire"] },
  { key: "nh_ppe", label: "작업 순서·동선과 보호구 지급", season: "all", audience: "", hint: "작업 절차·동선 숙지, 지급 보호구 종류와 착용법", courses: ["new_hire"] },
  // 전용 — 관리감독자 (별표 5 관리감독자 교육 내용: 유해·위험요인 파악, 감독 요령)
  { key: "sv_role", label: "관리감독자의 역할과 책임", season: "all", audience: "", hint: "법상 업무 범위, 지휘·감독 요령, 사고 시 보고 절차", courses: ["supervisor"] },
  { key: "sv_risk", label: "유해·위험요인 파악과 위험성평가", season: "all", audience: "", hint: "구역별 위험요인 파악, 위험성평가 절차와 개선 조치", courses: ["supervisor"] },
  { key: "sv_check", label: "작업 전 안전점검·작업지시 요령", season: "all", audience: "", hint: "작업 전 점검 항목, 안전 작업지시, 감시인 배치 판단", courses: ["supervisor"] },
];

export const topicOf = (key: string) =>
  TRAINING_TOPICS.find((t) => t.key === key);

/** 화면 표시 순서 — 현재 반기 계절 → 연중(직무) → 다른 반기 계절 */
export function topicsForHalf(half: 1 | 2) {
  const now = half === 1 ? "h1" : "h2";
  const rank = (t: TrainingTopic) => (t.season === now ? 0 : t.season === "all" ? 1 : 2);
  return [...TRAINING_TOPICS].sort((a, b) => rank(a) - rank(b));
}

// ── 반기 판정 — 이행 현황(과태료 안내)이 이 값에 걸려 있다. 전부 KST 기준 ──

export type Half = { year: number; half: 1 | 2 };

const kstParts = (d: Date) => {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return { y: kst.getUTCFullYear(), m: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
};

export function halfOfKst(d: Date): Half {
  const { y, m } = kstParts(d);
  return { year: y, half: m <= 6 ? 1 : 2 };
}

export const halfLabel = (h: Half) =>
  `${h.year}년 ${h.half === 1 ? "상" : "하"}반기`;

/** 반기의 날짜 범위(포함) — 교육일자(YYYY-MM-DD 문자열)와 사전순 비교로 판정한다 */
export function halfRange(h: Half): { start: string; end: string } {
  return h.half === 1
    ? { start: `${h.year}-01-01`, end: `${h.year}-06-30` }
    : { start: `${h.year}-07-01`, end: `${h.year}-12-31` };
}

/** 반기 마감(6/30·12/31)까지 남은 일수 — 마감 당일 0 */
export function daysToHalfEnd(d: Date): number {
  const { y, m, day } = kstParts(d);
  const end = m <= 6 ? Date.UTC(y, 5, 30) : Date.UTC(y, 11, 31);
  return Math.round((end - Date.UTC(y, m - 1, day)) / 86400000);
}

// ── 이행 현황 집계 — 모듈 홈이 열 때마다 계산한다(크론·저장값 없음) ──

export type LogSummary = {
  courseType: CourseType;
  /** 교육일자 YYYY-MM-DD (meta.date) */
  date: string;
  attendees: Pick<AttendeeSnap, "office">[];
};

export type Compliance = {
  half: Half;
  daysLeft: number;
  /** null = 해당 직원이 명부에 없어 판정 대상 아님 */
  regularOffice: boolean | null;
  regularField: boolean | null;
  /** 올해 관리감독자 교육 실시 여부 */
  supervisor: boolean;
};

/**
 * "실시했다" = 완성(final)된 일지의 교육일자가 이번 반기 안이고, 그 직군 참석자가
 * 한 명이라도 있다. 사무직/그 외는 참석자 스냅샷의 office로 가른다 —
 * 명부를 나중에 고쳐도 지난 일지의 판정은 변하지 않는다.
 */
export function complianceOf(
  now: Date,
  finalLogs: LogSummary[],
  roster: { office: boolean }[],
): Compliance {
  const half = halfOfKst(now);
  const { start, end } = halfRange(half);
  const inHalf = finalLogs.filter(
    (l) => l.courseType === "regular" && l.date >= start && l.date <= end,
  );
  const hasOfficeStaff = roster.some((s) => s.office);
  const hasFieldStaff = roster.some((s) => !s.office);
  return {
    half,
    daysLeft: daysToHalfEnd(now),
    regularOffice: hasOfficeStaff
      ? inHalf.some((l) => l.attendees.some((a) => a.office))
      : null,
    regularField: hasFieldStaff
      ? inHalf.some((l) => l.attendees.some((a) => !a.office))
      : null,
    supervisor: finalLogs.some(
      (l) => l.courseType === "supervisor" && l.date.startsWith(`${half.year}-`),
    ),
  };
}

// ── LLM 출력·수정 화면 왕복 ──

export type TrainingDraft = {
  /** 주제별 절 — heading은 주제명, lines는 "가. 나." 개조식(기호 포함) */
  sections: { heading: string; lines: string[] }[];
  closing: string;
  needsClarification: string[];
};

/** 문서함 검색용 평문 — 화면 렌더는 meta의 구조화 데이터가 담당한다 */
export function draftPlainText(d: TrainingDraft) {
  return [
    ...d.sections.flatMap((s) => [s.heading, ...s.lines]),
    d.closing,
  ]
    .filter(Boolean)
    .join("\n");
}

/* 수정칸 왕복 — 빈 줄로 절을 나누고, 각 절의 첫 줄이 주제(제목)다 */
export function sectionsToText(sections: TrainingDraft["sections"]) {
  return sections
    .map((s) => [s.heading, ...s.lines].join("\n"))
    .join("\n\n");
}

export function textToSections(text: string): TrainingDraft["sections"] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim()))
    .filter((lines) => lines.length > 0)
    .map(([heading, ...lines]) => ({ heading, lines }));
}

/* 참석자 수정칸 왕복 — "이름, 직종" 한 줄이 한 명. 직종 생략 시 기타.
 * office는 파싱만으로는 알 수 없어 직종=사무로 추정한다 — 호출부(actions)가
 * 기존 스냅샷과 이름을 맞춰 원래 office를 보존한다 */
export function attendeesToText(a: AttendeeSnap[]) {
  return a.map((x) => `${x.name}, ${x.position}`).join("\n");
}

export function textToAttendees(text: string): AttendeeSnap[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const comma = line.indexOf(",");
      const name = (comma < 0 ? line : line.slice(0, comma)).trim();
      const position = comma < 0 ? "기타" : line.slice(comma + 1).trim() || "기타";
      return { name, position, office: position === "사무" };
    });
}
