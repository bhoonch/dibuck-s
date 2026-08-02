/**
 * 공지문 자동완성 — 유형 카탈로그와 순수 함수.
 * 클라이언트 폼이 직접 import하므로 db·Anthropic을 물면 안 된다(브라우저 번들 사고).
 * LLM 호출은 notice-ai.ts, 검증은 `npx tsx notice-post.test.ts`.
 */

/** 안내문(협조 요청 톤) | 공고문(격식·공고번호) */
export type NoticeKind = "guide" | "official";

export type NoticeType = {
  key: string;
  label: string;
  category: string;
  kind: NoticeKind;
  /** 입력 placeholder — "이 칸은 얼마나 대충이어도 되는지"를 예로 보여준다 */
  hint: { when: string; where: string; detail: string };
};

const h = (when: string, where: string, detail: string) => ({ when, where, detail });

/* 카테고리 순서 = 화면 표시 순서. 자주 붙이는 것이 앞에 온다 */
export const NOTICE_TYPES: NoticeType[] = [
  // 시설·점검
  { key: "water_cut", label: "단수 안내", category: "시설·점검", kind: "guide", hint: h("8월 10일(월) 10:00~16:00", "전 세대", "저수조 정기 청소") },
  { key: "power_cut", label: "정전 안내", category: "시설·점검", kind: "guide", hint: h("8월 12일(수) 14:00~16:00", "101동~103동", "전기설비 정기점검") },
  { key: "elevator", label: "승강기 정기점검", category: "시설·점검", kind: "guide", hint: h("8월 14일(금) 09:00~12:00", "전 동", "동별 30분 내외, 점검 업체명") },
  { key: "tank_clean", label: "저수조 청소", category: "시설·점검", kind: "guide", hint: h("8월 20일(목) 09:00~17:00", "전 세대", "반기 정기 청소, 청소 중 단수 여부") },
  { key: "pest_control", label: "소독·방역", category: "시설·점검", kind: "guide", hint: h("8월 12일(수) 10:00~15:00", "지하층·계단·조경지", "하절기 해충 방제, 창문 닫기") },
  { key: "septic", label: "정화조·배수관 청소", category: "시설·점검", kind: "guide", hint: h("8월 18일(화) 09:00~", "전 동", "악취·소음 양해") },
  { key: "construction", label: "공용부 공사", category: "시설·점검", kind: "guide", hint: h("8월 17일~8월 22일 09:00~18:00", "지하주차장 1층", "공사 내용, 소음·통행 제한") },
  { key: "landscaping", label: "조경 작업", category: "시설·점검", kind: "guide", hint: h("8월 25일(화)", "단지 내 조경지", "수목 전지·소독, 주차 이동 협조") },
  // 생활·질서
  { key: "parking", label: "주차 질서 협조", category: "생활·질서", kind: "guide", hint: h("", "지상·지하 주차장", "이중주차·소방차 전용구역 등 협조 내용") },
  { key: "noise", label: "층간소음 자제", category: "생활·질서", kind: "guide", hint: h("", "전 세대", "야간 시간대, 최근 민원 상황") },
  { key: "smoking", label: "금연 안내", category: "생활·질서", kind: "guide", hint: h("", "계단·복도·놀이터", "간접흡연 민원, 금연구역 안내") },
  { key: "recycle", label: "재활용품 분리배출", category: "생활·질서", kind: "guide", hint: h("매주 수요일", "각 동 분리수거장", "품목별 배출 요령, 위반 사례") },
  { key: "food_waste", label: "음식물쓰레기 배출", category: "생활·질서", kind: "guide", hint: h("", "각 동 수거함", "배출 요령, 물기 제거") },
  { key: "dumping", label: "쓰레기 무단투기", category: "생활·질서", kind: "guide", hint: h("", "화단·주차장 주변", "최근 사례, 협조 요청") },
  { key: "clutter", label: "복도·계단 적치물 정리", category: "생활·질서", kind: "guide", hint: h("정리 기한", "각 동 복도·계단", "소방 통로 확보, 자진 정리 요청") },
  { key: "pets", label: "반려동물 관리", category: "생활·질서", kind: "guide", hint: h("", "단지 전체", "목줄·배설물 등 협조 내용") },
  // 계절·안전
  { key: "freeze", label: "동파 예방", category: "계절·안전", kind: "guide", hint: h("동절기", "전 세대", "계량기·수도관 보온, 장기 외출 시 조치") },
  { key: "typhoon", label: "태풍·호우 대비", category: "계절·안전", kind: "guide", hint: h("이번 주말", "전 세대", "태풍 이름, 창문·베란다 물건 정리") },
  { key: "heatwave", label: "폭염 대비", category: "계절·안전", kind: "guide", hint: h("폭염특보 기간", "전 세대", "냉방기 화재 예방, 취약 세대 안부") },
  { key: "fire", label: "화재 예방", category: "계절·안전", kind: "guide", hint: h("", "전 세대", "명절·겨울철 화기 취급 주의") },
  { key: "snow", label: "제설·빙판 주의", category: "계절·안전", kind: "guide", hint: h("강설 기간", "단지 내 보행로", "미끄럼 주의, 제설 협조") },
  // 행사·운영
  { key: "holiday", label: "명절 인사·휴무", category: "행사·운영", kind: "guide", hint: h("추석 연휴 9월 24일~27일", "", "관리사무소 휴무, 비상 연락 안내") },
  { key: "event", label: "행사 안내", category: "행사·운영", kind: "guide", hint: h("행사 일시", "행사 장소", "행사 이름·내용·참여 방법") },
  { key: "fee", label: "관리비 안내", category: "행사·운영", kind: "guide", hint: h("적용 시기", "전 세대", "변경 내용과 사유") },
  { key: "council", label: "입주자대표회의 개최 공고", category: "행사·운영", kind: "official", hint: h("8월 28일(목) 19:00", "관리사무소 회의실", "안건 목록") },
  { key: "election", label: "동별 대표자 선출 공고", category: "행사·운영", kind: "official", hint: h("후보 등록·투표 일정", "해당 선거구(동)", "선출 인원, 등록 방법") },
  // 자유 입력 — kind는 폼에서 토글
  { key: "free", label: "자유 입력", category: "자유 입력", kind: "guide", hint: h("일시·기간", "대상·구역", "알리고 싶은 내용을 자유롭게") },
];

export const NOTICE_CATEGORIES = [...new Set(NOTICE_TYPES.map((t) => t.category))];

export const noticeTypeOf = (key: string) =>
  NOTICE_TYPES.find((t) => t.key === key);

/** 폼 입력 — 전 유형 공통 4칸. 유형별 스키마를 만들지 않는다 */
export type NoticeForm = {
  typeKey: string;
  kind: NoticeKind;
  when: string;
  where: string;
  detail: string;
  contact: string;
};

/** LLM 출력 — notice-ai.ts의 structured outputs 스키마와 같은 모양 */
export type NoticePostDraft = {
  title: string;
  /** 인사말·도입. 공고문이면 "...다음과 같이 공고합니다." 문장 */
  intro: string;
  /** ■ 개요 표 — 입력값 그대로 */
  items: { label: string; value: string }[];
  /** 안내문: 협조 사항(기호 없이, 렌더러가 ▶) / 공고문: 개조식 본문(1. 가. 포함) */
  bodyLines: string[];
  closing: string;
  needsClarification: string[];
};

/** 문서함 검색용 평문 — 화면 렌더는 meta의 구조화 데이터가 담당한다 */
export function draftPlainText(d: NoticePostDraft) {
  return [
    d.title,
    d.intro,
    ...d.items.map((i) => `${i.label}: ${i.value}`),
    ...d.bodyLines,
    d.closing,
  ]
    .filter(Boolean)
    .join("\n");
}

/* 개요 항목 수정칸 왕복 — "라벨: 값" 한 줄 = 항목 하나. 첫 콜론만 구분자다
 * (값에 "10:00" 같은 콜론이 흔하다) */
export function itemsToText(items: { label: string; value: string }[]) {
  return items.map((i) => `${i.label}: ${i.value}`).join("\n");
}

export function textToItems(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(":");
      return colon < 0
        ? { label: "", value: line }
        : { label: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
    });
}
