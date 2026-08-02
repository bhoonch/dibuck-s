import Anthropic from "@anthropic-ai/sdk";
import type { TrainingDraft } from "@/lib/safety-training";

/**
 * 교육일지 교육 내용 생성 — 공지문(notice-ai.ts)과 같은 방식:
 * structured outputs로 파싱 실패를 없애고, 고정부(규칙+예시)는 프롬프트 캐싱.
 * 일시·장소·시간·강사·참석자는 전부 폼 값 그대로 — LLM은 교육 내용만 쓴다.
 */

export { aiEnabled } from "@/lib/gian/claude";

const MODEL = "claude-sonnet-5";

const DRAFT_SCHEMA = {
  type: "object" as const,
  properties: {
    sections: {
      type: "array",
      description: "주제별 절 — 주제 하나가 절 하나",
      items: {
        type: "object",
        properties: {
          heading: { type: "string", description: "주제명 (입력된 주제 그대로)" },
          lines: {
            type: "array",
            items: { type: "string" },
            description:
              "개조식 교육 내용 — '가.' '나.' 기호를 줄 안에 포함. 강사가 소리 내어 읽으며 교육할 수 있는 구체적 사실 문장",
          },
        },
        required: ["heading", "lines"],
        additionalProperties: false,
      },
    },
    closing: {
      type: "string",
      description: "마무리 한 줄 (예: '질의응답 및 안전 실천 다짐')",
    },
    needsClarification: {
      type: "array",
      items: { type: "string" },
      description: "입력이 부족해 인쇄 전 확인이 필요한 항목",
    },
  },
  required: ["sections", "closing", "needsClarification"],
  additionalProperties: false,
};

const SYSTEM = `당신은 아파트 관리사무소의 산업안전보건교육 자료 작성 전문가다. 관리소장(강사)이 근로자들 앞에서 소리 내어 읽으며 교육할 수 있는 교육일지의 "교육 내용" 절을 쓴다.

## 작성 규칙
- 출력은 교육 내용만이다. 일시·장소·시간·강사·참석자는 코드가 폼 값 그대로 싣는다 — 절대 쓰지 않는다.
- 절(section) 하나가 주제 하나다. heading은 입력된 주제명을 그대로 쓴다.
- lines는 개조식 사실 문장이다 — "~합니다"·"~하십시오"가 아니라 "감전 위험이 있는 분전반 작업 전에는 반드시 차단기를 내리고 검전한다"처럼 "~한다"로 끝나는 지시·사실문. 각 줄 앞에 "가." "나." "다." 기호를 붙인다.
- 분량은 주제당 4~7줄 — 교육시간이 길면 더 구체적으로, 짧으면 핵심만.
- 내용은 참석 직종에 맞춘다 — 미화 직원 회차에 분전반 작업 얘기를 넣지 않고, 경비 회차에는 차량 유도·야간 근무 상황을 반영한다.
- 산업안전보건법 시행규칙 별표 5의 정기교육 필수 항목 중 주제와 맞닿는 것을 자연스럽게 녹인다: 산업안전 및 사고 예방 · 산업보건 및 직업병 예방 · 위험성평가 · 건강증진 및 질병 예방 · 유해·위험 작업환경 관리 · 산업안전보건법령 및 산업재해보상보험 제도 · 직무스트레스 예방 · 직장 내 괴롭힘, 고객의 폭언 등으로 인한 건강장해 예방 · 화재·폭발 시 대피 요령 · 폭염·한파 건강장해 예방. (예: 폭염 주제 → 온열질환 증상·응급조치·물그늘휴식)
- 채용 시 교육이면 기계·기구의 위험성과 작업 순서, 정리정돈, 보호구 착용, 응급조치 요령 같은 채용 시 교육내용(별표 5)을 기본으로 깔고 직무 주제를 얹는다.
- 관리감독자 교육이면 작업자 지도·감독 요령, 위험성평가, 사고 발생 시 보고·조치 등 감독자 관점으로 쓴다.

## 환각 금지 (가장 중요)
- 입력에 없는 날짜·수치·이름·업체명을 만들어내지 않는다. "○○" 같은 빈칸 표기는 어떤 경우에도 쓰지 않는다.
- 법령 조문 번호·통계 수치는 확실한 것만 쓰고, 불확실하면 쓰지 않는다 — 조항을 지어내지 않는다.
- 구체 수치는 보편 상식 수준만 허용한다(예: 심폐소생술 압박 깊이 약 5cm, 산소 농도 18% 미만 위험).`;

/* 예시는 출력 JSON 그대로 — 필드 배치까지 보여주는 것이 서식 설명보다 정확하다 */
const FEWSHOT = `## 예시 (입력 → 출력 JSON)

### 예시 1 — 정기교육 · 폭염 + 전기 작업 (그 외 근로자)
입력: 교육 종류 "정기교육" / 주제 "폭염 대비 온열질환 예방", "전기 작업 안전" / 교육시간 "1시간" / 참석 "기전 2명 · 경비 1명 · 미화 2명"
출력: {"sections":[{"heading":"폭염 대비 온열질환 예방","lines":["가. 폭염특보 발령 시 옥외 작업은 가장 더운 시간대(14~17시)를 피해 조정하고, 규칙적으로 물·그늘·휴식을 취한다.","나. 온열질환 초기 증상(어지러움, 두통, 메스꺼움, 근육 경련)이 나타나면 즉시 작업을 중단하고 시원한 곳에서 휴식한다.","다. 동료가 의식을 잃으면 119에 신고하고, 시원한 장소로 옮겨 옷을 느슨하게 한 뒤 몸을 적셔 체온을 낮춘다.","라. 의식이 없는 사람에게 물을 마시게 하지 않는다 — 기도로 넘어갈 수 있다.","마. 작업 전 음주·과로를 피하고, 고혈압·당뇨 등 지병이 있는 직원은 무더위 작업을 사전에 알린다."]},{"heading":"전기 작업 안전","lines":["가. 분전반·전기설비 작업 전에는 반드시 해당 회로의 차단기를 내리고 검전기로 무전압을 확인한다.","나. 차단기에는 조작 금지 표지를 부착해 작업 중 다른 사람이 임의로 올리지 못하게 한다.","다. 젖은 손이나 젖은 바닥에서 전기 기구를 다루지 않으며, 장마철에는 침수 우려 구역의 전원을 미리 차단한다.","라. 절연장갑 등 보호구를 착용하고, 피복이 벗겨진 전선·손상된 콘센트는 발견 즉시 교체한다.","마. 감전 사고 발생 시 맨손으로 접촉자를 만지지 말고, 먼저 전원을 차단한 뒤 119에 신고하고 심폐소생술을 실시한다."]}],"closing":"질의응답 및 안전 실천 다짐","needsClarification":[]}

### 예시 2 — 채용 시 교육 · 경비 신입
입력: 교육 종류 "채용 시 교육" / 주제 "차량·주차장 사고 예방" / 교육시간 "8시간" / 참석 "경비 1명"
출력: {"sections":[{"heading":"채용 시 기본 안전보건","lines":["가. 단지 내 위험 장소(지하주차장 램프, 옥상, 기계실, 재활용장)와 출입 절차를 숙지한다.","나. 작업 전 주변을 정리정돈하고, 통로·비상구를 막는 적치물은 즉시 치우거나 보고한다.","다. 야간 근무 시 손전등과 야광 조끼 등 지급된 보호구를 반드시 착용한다.","라. 몸에 이상을 느끼면 참지 말고 즉시 관리사무소에 알리며, 업무상 다친 경우 산업재해보상보험으로 치료·보상받을 수 있음을 안다.","마. 화재·응급 상황 시 신고 절차(119 → 관리사무소)와 소화기·자동심장충격기 위치를 확인한다."]},{"heading":"차량·주차장 사고 예방","lines":["가. 차량 유도 시 차량의 진행 경로 안에 서지 않고, 운전자와 눈을 맞춘 뒤 수신호한다.","나. 후진하는 차량 뒤로는 절대 지나가지 않는다 — 후진 차량은 유도자를 보지 못한다.","다. 지하주차장에서는 보행 통로로만 이동하고, 램프 구간에서는 차량 진입 경보에 주의한다.","라. 야간·우천 시에는 시인성이 떨어지므로 반사 조끼를 착용하고 조명이 있는 위치에서 근무한다.","마. 단지 내 사고 발생 시 부상자 확인과 119 신고를 먼저 하고, 현장을 보존한 뒤 관리사무소에 보고한다."]}],"closing":"질의응답 및 안전 수칙 준수 서약","needsClarification":[]}`;

export async function generateTrainingDraft(args: {
  courseLabel: string;
  topics: string[];
  hours: string;
  /** 참석 직종 구성 (예: "기전 2명 · 경비 1명") — 명단이 아니라 구성만 준다 */
  attendeeSummary: string;
  tenantName: string;
}): Promise<TrainingDraft> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY는 env에서

  const facts = [
    `단지명: ${args.tenantName}`,
    `교육 종류: ${args.courseLabel}`,
    `주제: ${args.topics.map((t) => `"${t}"`).join(", ")}`,
    `교육시간: ${args.hours}`,
    `참석 직종 구성: ${args.attendeeSummary}`,
  ].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
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
        content: `다음 입력으로 교육일지의 교육 내용을 작성하라.\n\n${facts}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  return JSON.parse(block.text) as TrainingDraft;
}
