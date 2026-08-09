import Anthropic from "@anthropic-ai/sdk";
import type { MinutesAgenda } from "@/lib/minutes";

/**
 * 회의록 구조화 초안 — notice-ai.ts와 같은 방식(Sonnet 5·structured outputs·프롬프트
 * 캐싱)이지만 과제 성격이 다르다. 공지문은 자유 작문이고, 회의록은 **안건 앵커**다 —
 * 소장이 붙여넣은 메모를, 회의 만들기에서 이미 정해진 안건 목록에 배분하는 제약 과제다.
 * 안건을 더하거나 빼거나 순서를 바꾸지 않는다(자유 작문이면 안건이 슬쩍 늘거나 합쳐진다).
 */

export { aiEnabled } from "@/lib/gian/claude";

const MODEL = "claude-sonnet-5";

const DRAFT_SCHEMA = {
  type: "object" as const,
  properties: {
    agendas: {
      type: "array",
      description: "입력으로 준 안건 목록과 같은 순서·같은 개수. 안건을 더하거나 빼지 않는다",
      items: {
        type: "object",
        properties: {
          order: { type: "number" },
          title: { type: "string", description: "입력 안건명 그대로" },
          discussion: {
            type: "array",
            items: { type: "string" },
            description:
              "논의 요지 개조식. 메모에 없는 발언·수치·인명 금지. 관련 메모가 없으면 빈 배열",
          },
          decision: {
            type: "string",
            enum: ["가결", "부결", "보류", "없음"],
            description: "메모에 의결 결과가 없으면 '없음'",
          },
          votesFor: { type: ["number", "null"], description: "메모에 찬반 수가 있을 때만, 없으면 null" },
          votesAgainst: { type: ["number", "null"] },
        },
        required: ["order", "title", "discussion", "decision", "votesFor", "votesAgainst"],
        additionalProperties: false,
      },
    },
    needsClarification: {
      type: "array",
      items: { type: "string" },
      description: "메모가 없거나 모호해 확인이 필요한 안건·항목",
    },
  },
  required: ["agendas", "needsClarification"],
  additionalProperties: false,
};

const SYSTEM = `당신은 아파트 입주자대표회의의 회의록 서기다. 회의 중 적은 메모(또는 녹취를 옮긴 글)를 안건별 회의록으로 정리한다.

## 작성 규칙
- 입력 메모에 있는 내용만 쓴다. 메모의 존칭·구어체는 개조식 문어("~함", "~하기로 함")로 다듬되, 다듬는 과정에서 내용을 더하지 않는다.
- **안건 목록은 앵커다.** 입력으로 주어진 안건의 순서·개수·제목을 그대로 출력에 유지한다 — 안건을 더하거나 빼거나 합치거나 나누지 않는다. 각 안건에는 메모에서 그 안건에 해당하는 논의만 배분한다.
- 메모에 있지만 **어느 안건에도 속하지 않는 내용**은 버리지 않는다 — 가장 관련 있는 안건의 discussion 배열 끝에 "(기타) " 접두를 붙여 한 항목으로 넣는다. 관련 안건을 판단하기 어려우면 논의 순서상 가장 가까운 안건에 붙인다.
- 특정 안건에 대응하는 메모가 없으면 그 안건의 discussion은 빈 배열로 둔다. discussion이 비어도 needsClarification에는 "게시 전 확인" 같은 뻔한 문구가 아니라 무엇이 비었는지 구체적으로 적는다(예: "○○ 안건 관련 논의 내용 확인 필요").
- decision은 메모에 의결(가결/부결/보류) 결과가 명시된 안건만 그 값을 쓰고, 단순 보고·논의만 있고 의결 언급이 없으면 "없음"으로 쓴다. 표결 없이 "다들 동의함", "이견 없음" 같은 합의 표현만 있어도 명시적 가결/부결 표현이 없으면 "없음"으로 쓴다 — 의결 여부를 추측하지 않는다.
- votesFor·votesAgainst는 메모에 찬반 수가 숫자로 적혀 있을 때만 채운다. 없으면 반드시 null — "만장일치"처럼 수가 안 적힌 표현으로 숫자를 추정하지 않는다.

## 환각 금지 (가장 중요)
- 메모에 없는 발언·수치·인명·업체명·날짜를 만들어내지 않는다. 발언자 이름이 메모에 없으면 이름을 지어 붙이지 않고 "~는 의견이 제기됨"처럼 주체 없이 쓴다.
- 메모가 모호하거나 상반되면 임의로 하나를 골라 단정하지 말고 needsClarification에 무엇을 확인해야 하는지 적는다.`;

/* 예시는 출력 JSON 그대로 — "(기타)" 배분과 결과 없음("없음") 처리를 보여준다 */
const FEWSHOT = `## 예시 (입력 → 출력 JSON)

입력:
회의: 제12차 입주자대표회의
안건 목록:
1. 승강기 정기점검 업체 재계약 건
2. 놀이터 시설 노후화 안건

메모 원문:
오늘 승강기건 얘기함. 지금 업체가 3년째 하고 있는데 다들 만족한다고 함. 계약 연장하자는 얘기 나와서 표결함. 찬성 7 반대 1로 통과. 그리고 다음 안건인 놀이터는 딱히 얘기 안 하고 넘어감. 아 참, 지하주차장 조명도 어둡다는 얘기 나왔는데 이건 안건에 없던거라 일단 적어둠.

출력: {"agendas":[{"order":1,"title":"승강기 정기점검 업체 재계약 건","discussion":["현재 업체가 3년째 정기점검을 수행 중이며 입주자대표 다수가 만족을 표함.","계약 연장 여부에 대해 표결을 진행함.","(기타) 지하주차장 조명이 어둡다는 의견이 제기됨."],"decision":"가결","votesFor":7,"votesAgainst":1},{"order":2,"title":"놀이터 시설 노후화 안건","discussion":[],"decision":"없음","votesFor":null,"votesAgainst":null}],"needsClarification":["놀이터 시설 노후화 안건 관련 논의 내용 확인 필요"]}`;

export async function generateMinutesDraft(args: {
  agenda: { order: number; title: string }[];
  rawText: string;
  meetingLabel: string;
}): Promise<{ agendas: MinutesAgenda[]; needsClarification: string[] }> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY는 env에서

  const agendaList = args.agenda.map((a) => `${a.order}. ${a.title}`).join("\n");
  const facts = [
    `회의: ${args.meetingLabel}`,
    `안건 목록(이 순서·개수·제목을 그대로 출력에 유지):\n${agendaList}`,
    `메모 원문:\n${args.rawText.trim() || "(입력 없음)"}`,
  ].join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
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
        content: `다음 메모로 회의록 초안을 작성하라.\n\n${facts}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  return JSON.parse(block.text) as { agendas: MinutesAgenda[]; needsClarification: string[] };
}
