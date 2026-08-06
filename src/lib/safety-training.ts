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

// ── 교육시간 ──
// 법정 기준이 "매반기 6시간 이상" 누적이라 시간은 반드시 숫자여야 한다.
// 예전엔 meta.hours가 자유 텍스트("1시간")라 합산이 불가능했고, 1시간짜리
// 한 번으로도 "완료"로 보였다. 옛 일지를 읽어야 하므로 파서는 둘 다 받는다.

/** 교육시간 → 시간(숫자). 옛 자유 텍스트("1시간", "1.5h")도 읽는다. null = 못 읽음 */
export function parseHours(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const m = v.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return n > 0 ? n : null;
}

/** 화면·문서 표기 — 1 → "1시간", 1.5 → "1시간 30분". 못 읽으면 원문 그대로 */
export function formatHours(v: unknown): string {
  const n = parseHours(v);
  if (n === null) return typeof v === "string" ? v : "";
  const h = Math.floor(n);
  const min = Math.round((n - h) * 60);
  if (min === 0) return `${h}시간`;
  return h === 0 ? `${min}분` : `${h}시간 ${min}분`;
}

// ── 직원 명부 ──

export const STAFF_POSITIONS = ["사무", "기전", "경비", "미화", "기타"] as const;

/**
 * 완성된 일지에 남는 참석자 스냅샷 — 명부를 나중에 고쳐도 지난 증빙은 불변.
 * staffId는 인원별 이수 집계가 사람을 특정하는 열쇠다. 이름만으로 묶으면
 * 동명이인이 한 사람으로 합쳐진다. 옛 일지에는 없으므로(선택) 집계 쪽은
 * staffId가 없으면 이름으로 떨어지는 폴백을 갖는다.
 */
export type AttendeeSnap = {
  name: string;
  position: string;
  office: boolean;
  staffId?: string;
};

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

/** KST 기준 YYYY-MM-DD — 교육일자(문자열)와 사전순 비교하려고 표기를 맞춘다 */
const ymdKstOf = (d: Date) => {
  const { y, m, day } = kstParts(d);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** KST 자정 기준 경과 일수 (from → to). 같은 날 0 */
const daysSinceKst = (from: Date, to: Date) => {
  const a = kstParts(from);
  const b = kstParts(to);
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.day) - Date.UTC(a.y, a.m - 1, a.day)) / 86400000,
  );
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

/**
 * 미이수 안내 회차 — 반기 마감까지 남은 일수로 고른다. null = 아직 안내할 때 아님.
 *
 * "D-30 당일"이 아니라 "30일 이하에서 처음"인 이유: 크론이 하루 빠지면 그 회차가
 * 영영 안 나간다. 임계값은 반드시 **작은 것부터** 본다 — 큰 것부터 보면 D-7에도
 * 30이 먼저 걸려 마지막 안내가 나가지 않는다.
 */
export const DUE_MILESTONES = [7, 30] as const;

export function dueMilestone(daysLeft: number): number | null {
  return DUE_MILESTONES.find((m) => daysLeft <= m) ?? null;
}

/** 반기 마감(6/30·12/31)까지 남은 일수 — 마감 당일 0 */
export function daysToHalfEnd(d: Date): number {
  const { y, m, day } = kstParts(d);
  const end = m <= 6 ? Date.UTC(y, 5, 30) : Date.UTC(y, 11, 31);
  return Math.round((end - Date.UTC(y, m - 1, day)) / 86400000);
}

// ── 이행 현황 집계 — 모듈 홈이 열 때마다 계산한다(크론·저장값 없음) ──

/**
 * 판정에 쓰는 법정 최소 시간(숫자). 문구는 LEGAL_HOURS.
 * newHire 8시간은 상시 근로자 기준이다 — 일용·1주 이하 기간제는 1시간이지만
 * 명부에 고용형태 칸이 없어 구분하지 않는다. 많이 요구하는 쪽이라 안전한 오차고,
 * 대체 인력이 흔한 단지가 나오면 그때 명부에 칸을 늘릴 것.
 */
export const REQUIRED_HOURS = { office: 6, field: 12, newHire: 8, supervisor: 16 } as const;

/**
 * 채용 시 교육을 며칠 안에 하는 것으로 볼 것인가 — 안내 시점의 기준.
 * 법 문언은 "작업 배치 전"이라 사실상 즉시지만, 입사 당일부터 미이수로 띄우면
 * 입사 처리 중인 단지에 매번 경고가 뜬다. 유예를 두고 그 뒤부터 알린다.
 */
export const NEW_HIRE_GRACE_DAYS = 7;

export type LogSummary = {
  courseType: CourseType;
  /** 교육일자 YYYY-MM-DD (meta.date) */
  date: string;
  /** 교육시간 — 새 일지는 숫자, 옛 일지는 자유 텍스트. parseHours가 읽는다 */
  hours?: unknown;
  attendees: Pick<AttendeeSnap, "office" | "name" | "staffId">[];
};

export type RosterMember = {
  id: string;
  name: string;
  position: string;
  office: boolean;
  /** 입사일 — null이면 채용 시 교육 판정에서 아예 빠진다(도입 전 입사자) */
  hiredAt?: Date | null;
  /** 관리감독자(소장) — 정기교육이 반기 6/12h가 아니라 연 16h(별표 4)로 갈린다 */
  supervisor?: boolean;
  /** 외부 교육 이수 기록 — DB Json 그대로. 읽기는 parseExtTrainings가 한다 */
  extTrainings?: unknown;
};

/** 외부 교육 이수 한 건 — 원본 증빙은 수료증(종이), 여기는 집계용 기록 */
export type ExternalTraining = { date: string; org: string; hours: number };

/** DB Json → 외부 이수 목록. 모양이 어긋난 항목은 조용히 버린다(집계를 깨뜨리지 않는다) */
export function parseExtTrainings(v: unknown): ExternalTraining[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (t): t is ExternalTraining =>
      !!t &&
      typeof t === "object" &&
      typeof (t as ExternalTraining).date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test((t as ExternalTraining).date) &&
      typeof (t as ExternalTraining).org === "string" &&
      parseHours((t as ExternalTraining).hours) !== null,
  );
}

/** 한 사람의 채용 시 교육 이수 현황. 대상이 아닌 사람은 목록에 아예 없다 */
export type NewHireProgress = RosterMember & {
  /** 입사일 이후 채용 시 교육 이수 시간 합계 */
  hours: number;
  required: number;
  done: boolean;
  /** 입사 후 지난 일수 — 안내 유예(NEW_HIRE_GRACE_DAYS) 판정에 쓴다 */
  daysSinceHire: number;
};

/** 한 사람의 이번 반기 정기교육 이수 현황 */
export type PersonProgress = RosterMember & {
  /** 이번 반기 정기교육 이수 시간 합계 */
  hours: number;
  /** 법정 최소 시간 — 사무직 6, 그 외 12 */
  required: number;
  done: boolean;
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

/** 참석자 스냅샷이 이 직원인가 — id가 있으면 id로, 옛 일지는 이름으로 떨어진다 */
export const isSamePerson = (
  a: Pick<AttendeeSnap, "name" | "staffId">,
  s: RosterMember,
) => (a.staffId ? a.staffId === s.id : a.name === s.name);

/**
 * 인원별 이수 시간 — 이번 반기 정기교육 일지에서 그 사람이 참석한 회차의 시간을 더한다.
 * 법정 요건이 근로자 **개인별** 누적(사무직 6h·그 외 12h)이라 회차 수가 아니라 시간을 센다.
 *
 * 시간을 읽을 수 없는 옛 일지는 0으로 친다 — 실제보다 적게 세는 쪽이라
 * "이수했는데 미이수로 보이는" 안전한 방향의 오차다(반대면 위반을 놓친다).
 * 채용 시·관리감독자 교육은 별도 요건이라 반기 누적에 넣지 않는다.
 *
 * **관리감독자는 여기서 아예 뺀다** — 별표 4에서 관리감독자의 정기교육은 반기
 * 6/12시간이 아니라 연간 16시간이다. 여기 두면 소장이 관리감독자 교육을 다
 * 받고도 "정기교육 미이수"로 찍힌다(거짓 기록). 판정은 supervisorProgress가 한다.
 */
export function personProgress(
  now: Date,
  finalLogs: LogSummary[],
  roster: RosterMember[],
  /** 집계할 반기 — 연간 보고서가 지난 연도 상·하반기를 지정한다. 기본은 지금 */
  half: Half = halfOfKst(now),
): PersonProgress[] {
  const { start, end } = halfRange(half);
  const inHalf = finalLogs.filter(
    (l) => l.courseType === "regular" && l.date >= start && l.date <= end,
  );
  return roster.filter((s) => !s.supervisor).map((s) => {
    const hours = inHalf.reduce(
      (sum, l) =>
        l.attendees.some((a) => isSamePerson(a, s))
          ? sum + (parseHours(l.hours) ?? 0)
          : sum,
      0,
    );
    const required = s.office ? REQUIRED_HOURS.office : REQUIRED_HOURS.field;
    return { ...s, hours, required, done: hours >= required };
  });
}

/**
 * 채용 시 교육 이수 — 개인별 1회성 요건이라 반기 누적(정기교육)과 축이 다르다.
 * 입사일 이후에 실시된 채용 시 교육만 센다: 입사 전 일지가 잡히면 전 직장에서
 * 받은 교육을 이수로 치는 꼴이 된다.
 *
 * **입사일이 없는 사람은 결과에 넣지 않는다.** 디벅 도입 전 입사자는 이미
 * 받았는지 알 방법이 없고, 전부 미이수로 띄우면 알림이 그날로 무의미해진다.
 * 정기교육 시간을 감하는 규정은 적용하지 않는다 — 법 조문 해석은 코드가 하지
 * 않는다(전결 한도와 같은 원칙). 필요하면 확인 후 켤 것.
 */
export function newHireProgress(
  now: Date,
  finalLogs: LogSummary[],
  roster: RosterMember[],
): NewHireProgress[] {
  return roster
    .filter((s): s is RosterMember & { hiredAt: Date } => !!s.hiredAt)
    .map((s) => {
      const hired = ymdKstOf(s.hiredAt);
      const hours = finalLogs.reduce(
        (sum, l) =>
          l.courseType === "new_hire" &&
          l.date >= hired &&
          l.attendees.some((a) => isSamePerson(a, s))
            ? sum + (parseHours(l.hours) ?? 0)
            : sum,
        0,
      );
      return {
        ...s,
        hours,
        required: REQUIRED_HOURS.newHire,
        done: hours >= REQUIRED_HOURS.newHire,
        daysSinceHire: daysSinceKst(s.hiredAt, now),
      };
    });
}

/**
 * 채용 시 교육 안내 회차 — 입사 후 **지난** 일수로 고른다. null = 아직 유예 안.
 * 반기 안내(dueMilestone)와 방향이 반대다: 저쪽은 마감까지 남은 일수라 작은 것부터
 * 보지만, 여기는 지날수록 급해지므로 **큰 것부터** 봐야 한다. 순서를 뒤집으면
 * 입사 30일이 지난 사람도 7일 회차로 잡혀 두 번째 안내가 나가지 않는다.
 */
export const NEW_HIRE_MILESTONES = [30, NEW_HIRE_GRACE_DAYS] as const;

export function newHireMilestone(daysSinceHire: number): number | null {
  return NEW_HIRE_MILESTONES.find((m) => daysSinceHire >= m) ?? null;
}

/** 안내·경고 대상 — 유예를 넘겼는데 아직 못 채운 사람 */
export const newHireOverdue = (list: NewHireProgress[]) =>
  list.filter((p) => !p.done && p.daysSinceHire >= NEW_HIRE_GRACE_DAYS);

/** 한 사람의 관리감독자 교육(연 16시간) 이수 현황 */
export type SupervisorProgress = RosterMember & {
  /** 그해 이수 시간 합계 = 앱의 관리감독자 일지 + 외부 이수 등록 */
  hours: number;
  /** 그중 외부 이수분 — 보고서가 "수료증 별도 보관"을 붙일 근거 */
  extHours: number;
  required: number;
  done: boolean;
};

/**
 * 관리감독자 교육 이수 — 연 단위 16시간 누적(별표 4). 관리감독자로 표시된
 * 사람만 대상이고, 앱 일지 시간에 **외부 교육 이수 등록**을 합산한다.
 * 관리감독자 교육은 등록기관 위탁·본사 집합교육이 관행이라 앱 일지가 없는
 * 경우가 기본값이다 — 앱 일지만 세면 교육을 받고도 "미실시"로 찍힌다.
 */
export function supervisorProgress(
  year: number,
  finalLogs: LogSummary[],
  roster: RosterMember[],
): SupervisorProgress[] {
  return roster
    .filter((s) => s.supervisor)
    .map((s) => {
      const logHours = finalLogs.reduce(
        (sum, l) =>
          l.courseType === "supervisor" &&
          l.date.startsWith(`${year}-`) &&
          l.attendees.some((a) => isSamePerson(a, s))
            ? sum + (parseHours(l.hours) ?? 0)
            : sum,
        0,
      );
      const extHours = parseExtTrainings(s.extTrainings).reduce(
        (sum, t) =>
          t.date.startsWith(`${year}-`) ? sum + (parseHours(t.hours) ?? 0) : sum,
        0,
      );
      const hours = logHours + extHours;
      return {
        ...s,
        hours,
        extHours,
        required: REQUIRED_HOURS.supervisor,
        done: hours >= REQUIRED_HOURS.supervisor,
      };
    });
}

/**
 * 직군별 이행 판정 = 그 직군 **전원**이 법정 시간을 채웠는가.
 * 예전엔 "그 직군 참석자가 한 명이라도 있으면 완료"였다 — 사무직 6명 중
 * 한 명만 받아도 완료로 보였고, 1시간짜리 한 번이 6시간 요건을 통과했다.
 *
 * 관리감독자: 명부에 관리감독자로 표시된 사람이 있으면 **전원 연 16시간
 * 누적**으로 판정한다(외부 이수 포함). 아무도 표시하지 않은 단지는 예전
 * 기준(그해 실시 여부)으로 떨어진다 — 표시 전부터 "미실시" 경고를 바꾸면
 * 기존 단지의 화면이 하루아침에 달라진다.
 */
export function complianceOf(
  now: Date,
  finalLogs: LogSummary[],
  roster: RosterMember[],
): Compliance {
  const half = halfOfKst(now);
  const progress = personProgress(now, finalLogs, roster);
  const allDone = (office: boolean) => {
    const group = progress.filter((p) => p.office === office);
    return group.length === 0 ? null : group.every((p) => p.done);
  };
  const supervisors = supervisorProgress(half.year, finalLogs, roster);
  return {
    half,
    daysLeft: daysToHalfEnd(now),
    regularOffice: allDone(true),
    regularField: allDone(false),
    supervisor:
      supervisors.length > 0
        ? supervisors.every((p) => p.done)
        : finalLogs.some(
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

/**
 * 수정칸에서 돌아온 참석자에 기존 스냅샷의 신원(직원 id·사무직 여부)을 다시 잇는다.
 * 파서는 이름·직종만 읽으므로 이걸 빼면 일지를 한 번 수정할 때마다 staffId가
 * 사라지고, 인원별 이수 집계가 이름 매칭으로 되돌아간다(동명이인에서 깨진다).
 * 수정칸에서 새로 타이핑한 이름은 명부에 없는 사람일 수 있어 그대로 둔다.
 */
export function mergeAttendees(
  parsed: AttendeeSnap[],
  prev: AttendeeSnap[],
): AttendeeSnap[] {
  const byName = new Map(prev.map((a) => [a.name, a]));
  return parsed.map((a) => {
    const old = byName.get(a.name);
    if (!old) return a;
    return {
      ...a,
      office: old.office,
      ...(old.staffId ? { staffId: old.staffId } : {}),
    };
  });
}
