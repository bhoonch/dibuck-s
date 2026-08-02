import Anthropic from "@anthropic-ai/sdk";
import type { NoticeKind, NoticePostDraft } from "@/lib/notice-catalog";

/**
 * 공지문(공고문·안내문) 초안 생성 — 기안 모듈(gian/claude.ts)과 같은 방식:
 * structured outputs로 파싱 실패를 없애고, 고정부(규칙+예시)는 프롬프트 캐싱.
 * 결정적 값(단지명·게시일·공고 호수·문의처)은 코드가 주입한다 — LLM은 문안만 쓴다.
 */

export { aiEnabled } from "@/lib/gian/claude";

const MODEL = "claude-sonnet-5";

const DRAFT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: {
      type: "string",
      description:
        "유형명만이 아니라 사유가 드러나는 완결형 제목 (예: '단수 안내'가 아니라 '저수조 청소에 따른 단수 안내')",
    },
    intro: {
      type: "string",
      description:
        "안내문: 인사말+사유 도입 1~2문장. 공고문: '...다음과 같이 공고합니다.'로 끝나는 도입 문장",
    },
    items: {
      type: "array",
      description:
        "개요 표 — 라벨은 2~4글자(일시·구역·사유·대상·기간 등), 값은 입력값 그대로",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
        },
        required: ["label", "value"],
        additionalProperties: false,
      },
    },
    bodyLines: {
      type: "array",
      items: { type: "string" },
      description:
        "안내문: 협조 사항 문장들 — 줄 앞 기호 없이(화면이 ▶를 붙인다). 공고문: 개조식 본문 — '1.' '가.' 기호를 줄 안에 포함",
    },
    closing: {
      type: "string",
      description:
        "맺음 문구 (예: '입주민 여러분의 양해와 협조를 부탁드립니다.'). 공고문은 빈 문자열 허용",
    },
    needsClarification: {
      type: "array",
      items: { type: "string" },
      description: "입력이 부족해 게시 전 확인이 필요한 항목",
    },
  },
  required: ["title", "intro", "items", "bodyLines", "closing", "needsClarification"],
  additionalProperties: false,
};

const SYSTEM = `당신은 아파트 관리사무소의 공고문·안내문 작성 전문가다. 게시판·승강기에 붙이는 A4 한 장짜리 게시물을 쓴다.

## 작성 규칙
- 문서 격은 둘이다. **안내문(guide)**: 입주민에게 협조를 구하는 정중한 톤 — 인사말로 시작해 개요 표와 협조 사항을 적고 양해 문구로 맺는다. **공고문(official)**: 격식체 — "...에 따라(위하여) 다음과 같이 공고합니다."로 시작해 개조식 본문으로 쓴다.
- 톤은 협조 요청형이다. 경고성 유형(무단투기·적치물·주차 위반)도 위협조가 아니라 정중한 협조 요청으로 쓴다 — 민원의 대부분은 내용이 아니라 고지의 태도에서 나온다.
- 제목은 유형명만 쓰지 않는다 — 사유가 드러나는 완결형으로 짓는다 (예: "단수 안내" ×, "저수조 청소에 따른 단수 안내" ○).
- 개요 표(items)에서 일시·기간·구역·연락처 같은 **사실값은 입력값 그대로** 싣는다. "9월 중" 같은 대략 표기도 다듬지 않는다. **사유는 예외다** — 입력 키워드를 그대로 옮기지 말고 완결된 구로 다듬어 쓴다: "물탱크 배관 교체"(입력) → "옥상 물탱크 배관 교체 공사"(사유), "정기 청소"(입력) → "저수조(물탱크) 정기 청소"(사유). 작업이면 "~공사"·"~작업", 행사면 "~행사"처럼 성격이 드러나는 명사구로 끝낸다. 다듬을 때도 입력에 없는 사실(수치·"노후" 같은 상태·업체명)은 더하지 않는다.
- 협조 사항(bodyLines)은 그 유형의 실무 상식으로 보강한다 — 예: 단수 전 물 받아두기·급수 재개 직후 녹물 흘려보내기, 소독 시 창문 닫기·반려동물 주의, 승강기 점검 시 이사 자제. 입주민이 실제로 해야 할 행동만 적는다.
- 문장은 "~바랍니다", "~주시기 바랍니다"로 끝낸다. 공고문 본문은 "~함", "명사형"도 허용한다.
- 법적 근거는 확실할 때만 괄호로 덧붙인다(예: 저수조 청소 = 수도법에 따른 반기 1회 의무 청소). 불확실하면 쓰지 않는다 — 조항을 지어내지 않는다.

## 환각 금지 (가장 중요)
- 입력에 없는 날짜·시간·수치·업체명을 만들어내지 않는다. "○월 ○일" 같은 빈칸 표기는 어떤 경우에도 쓰지 않는다.
- 일시 입력이 없으면 items에서 일시 항목을 빼고 needsClarification에 "게시 전 일시 확인"을 적는다.
- 단지명·게시일·공고 호수·문의처는 입력으로 주어진 값만 쓴다.`;

/* 예시는 출력 JSON 그대로 — 필드 배치까지 보여주는 것이 서식 설명보다 정확하다 */
const FEWSHOT = `## 예시 (입력 → 출력 JSON)

### 예시 1 — 안내문 · 단수 안내
입력: 일시 "2026년 8월 10일(월) 10:00 ~ 16:00" / 대상 "전 세대" / 내용 "저수조 정기 청소"
출력: {"title":"저수조 청소에 따른 단수 안내","intro":"입주민 여러분 안녕하십니까. 저수조 정기 청소로 인하여 아래와 같이 수돗물 공급이 일시 중단됨을 안내드립니다.","items":[{"label":"단수 일시","value":"2026년 8월 10일(월) 10:00 ~ 16:00"},{"label":"단수 구역","value":"전 세대"},{"label":"사유","value":"저수조(물탱크) 정기 청소 (수도법에 따른 반기 1회 의무 청소)"}],"bodyLines":["단수 시간 전에 필요한 물을 미리 받아 두시기 바랍니다.","급수 재개 직후에는 일시적으로 녹물이 나올 수 있으니 2~3분간 흘려보낸 후 사용하시기 바랍니다."],"closing":"입주민 여러분의 양해와 협조를 부탁드립니다.","needsClarification":[]}

### 예시 2 — 안내문 · 소독 실시
입력: 일시 "2026년 8월 12일(수) 10:00 ~ 15:00" / 대상 "각 동 지하층, 공용 계단, 옥외 배수로 및 조경지" / 내용 "하절기 해충 방제"
출력: {"title":"정기 소독 실시 안내","intro":"입주민 여러분 안녕하십니까. 쾌적한 주거 환경 조성을 위하여 아래와 같이 단지 정기 소독을 실시합니다.","items":[{"label":"소독 일시","value":"2026년 8월 12일(수) 10:00 ~ 15:00"},{"label":"소독 구역","value":"각 동 지하층, 공용 계단, 옥외 배수로 및 조경지"},{"label":"사유","value":"하절기 해충(모기·바퀴벌레) 방제"}],"bodyLines":["소독 시간에는 해당 구역 통행을 자제하여 주시기 바랍니다.","저층 세대는 창문을 닫아 주시기 바랍니다.","반려동물이 약제에 닿지 않도록 주의하여 주시기 바랍니다."],"closing":"입주민 여러분의 양해와 협조를 부탁드립니다.","needsClarification":[]}

### 예시 3 — 안내문 · 승강기 정기점검 (일시 미입력)
입력: 일시 "" / 대상 "101동 ~ 105동 전 승강기" / 내용 "승강기 안전관리법 정기점검, 동별 30분 내외, 점검 중 운행 중단"
출력: {"title":"승강기 정기점검 안내","intro":"입주민 여러분 안녕하십니까. 승강기 안전관리법에 따른 정기점검을 아래와 같이 실시합니다. 점검 중에는 승강기 운행이 일시 중단되오니 계단을 이용하여 주시기 바랍니다.","items":[{"label":"점검 대상","value":"101동 ~ 105동 전 승강기"},{"label":"소요 시간","value":"동별 30분 내외"}],"bodyLines":["점검 시간대 이사·대형 화물 운반은 피해 주시기 바랍니다.","거동이 불편하신 세대는 사전에 관리사무소로 연락 주시면 점검 순서를 조정해 드립니다."],"closing":"입주민 여러분의 양해와 협조를 부탁드립니다.","needsClarification":["게시 전 점검 일시 확인"]}

### 예시 4 — 공고문 · 장기 방치 차량
입력: 일시 "2026년 8월 20일(목)까지" / 대상 "지하주차장 2층 B구역 12가3456호" / 내용 "30일 이상 무이동, 기한 내 미이동 시 관리규약에 따라 경고장 부착"
출력: {"title":"장기 방치 차량 자진 이동 요청 공고","intro":"단지 내 주차 질서 확립과 입주민 주차 공간 확보를 위하여, 장기 방치 차량에 대해 다음과 같이 공고합니다.","items":[{"label":"대상 차량","value":"지하주차장 2층 B구역 12가3456호 (30일 이상 무이동)"},{"label":"이동 기한","value":"2026년 8월 20일(목)까지"}],"bodyLines":["1. 기한 내 자진 이동하지 않을 경우 관리규약에 따라 경고장을 부착하고 주차 위반 차량으로 등록합니다.","2. 차량 소유주께서는 관리사무소로 연락하여 주시기 바랍니다."],"closing":"","needsClarification":[]}`;

const kindGuide: Record<NoticeKind, string> = {
  guide: "안내문 (협조 요청 톤, 예시 1~3 구성)",
  official: "공고문 (격식체, 예시 4 구성)",
};

export async function generateNoticePost(args: {
  kind: NoticeKind;
  typeLabel: string;
  when: string;
  where: string;
  detail: string;
  contact: string;
  tenantName: string;
}): Promise<NoticePostDraft> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY는 env에서

  // 오늘 날짜는 고정부가 아니라 user turn에 — system에 넣으면 날마다 캐시가 깨진다
  const kst = new Date(Date.now() + 9 * 3600_000);
  const today = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;

  const facts = [
    `오늘(게시일): ${today} — 문서의 연도는 이 값을 쓴다. 월·일이 입력에 있으면 그대로 쓴다.`,
    `단지명: ${args.tenantName}`,
    `문서 격: ${kindGuide[args.kind]}`,
    `게시물 유형: ${args.typeLabel}`,
    `일시·기간(입력 원문): ${args.when || "(입력 없음)"}`,
    `대상·구역(입력 원문): ${args.where || "(입력 없음)"}`,
    `내용·사유(입력 원문): ${args.detail || "(입력 없음)"}`,
    args.contact
      ? `문의처(items 마지막 항목으로 '문의' 라벨에 이 값 그대로): ${args.contact}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        text: FEWSHOT,
        cache_control: { type: "ephemeral" }, // 고정부 전체 캐시 — 이후 호출 입력비 ~1/10
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: DRAFT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `다음 입력으로 ${kindGuide[args.kind]} 게시물을 작성하라.\n\n${facts}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  return JSON.parse(block.text) as NoticePostDraft;
}
