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
            items: {
              type: "object",
              properties: {
                speaker: {
                  type: "string",
                  description:
                    "발언자. 메모에 발언자가 적혀 있을 때만 참석자 명단의 이름 그대로. 없으면 빈 문자열",
                },
                text: {
                  type: "string",
                  description: "발언 내용 — 메모의 내용을 보존해 문어체로 다듬은 문장",
                },
              },
              required: ["speaker", "text"],
              additionalProperties: false,
            },
            description:
              "발언 요지. 메모에 없는 발언·수치·인명 금지. 관련 메모가 없으면 빈 배열",
          },
          decision: {
            type: "string",
            enum: ["가결", "부결", "보류", "없음"],
            description: "메모에 의결 결과가 없으면 '없음'",
          },
          // 표결·견적은 **제안**이다 — 메모에 성명·금액이 명시된 경우에만 채우고,
          // 화면에서 "AI 제안" 배지와 함께 보여 사람이 확인·수정한 뒤 저장한다.
          // 서버는 참석자 명부 대조(readVotes3)를 통과한 것만 받는다.
          votes: {
            type: ["object", "null"],
            properties: {
              for: { type: "array", items: { type: "string" } },
              against: { type: "array", items: { type: "string" } },
              abstain: { type: "array", items: { type: "string" } },
            },
            required: ["for", "against", "abstain"],
            additionalProperties: false,
            description:
              "메모에 표결자 성명이 명시된 경우에만. 이름은 참석자 명단 그대로. 인원수만 적혀 있으면 null",
          },
          quotes: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: {
                vendor: { type: "string" },
                amount: {
                  type: ["number", "null"],
                  description: "원 단위 숫자. 금액이 없으면 null",
                },
                note: { type: "string" },
              },
              required: ["vendor", "amount", "note"],
              additionalProperties: false,
            },
            description:
              "메모에 업체명·금액이 명시된 사업자 선정 비교 대목만. 없으면 null",
          },
        },
        required: ["order", "title", "discussion", "decision", "votes", "quotes"],
        additionalProperties: false,
      },
    },
    needsClarification: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: {
            type: "number",
            description: "관련 안건 번호. 특정 안건이 아니면 0",
          },
          text: { type: "string" },
        },
        required: ["order", "text"],
        additionalProperties: false,
      },
      description: "메모가 없거나 모호해 확인이 필요한 안건·항목",
    },
  },
  required: ["agendas", "needsClarification"],
  additionalProperties: false,
};

const SYSTEM = `당신은 아파트 입주자대표회의의 회의록 서기다. 회의 중 적은 메모(또는 녹취를 옮긴 글)를 안건별 회의록으로 정리한다.

## 작성 규칙
- 입력 메모에 있는 내용만 쓴다. 메모의 존칭·구어체는 문어체("~함", "~하기로 함")로 다듬는다.
- **압축·생략하지 않는다.** 메모에 적힌 이유·조건·금액·기간 같은 세부를 요약으로 뭉개지 말고 그대로 보존한다 — 회의록은 요약문이 아니라 기록이다. 다듬는 것은 문장의 꼴이지 내용의 양이 아니다.
- 발언자가 구분되는 대목은 발언 단위로 나눈다 — 한 발언자의 연속된 말은 한 항목으로 묶어도 된다.
- **안건 목록은 앵커다.** 입력으로 주어진 안건의 순서·개수·제목을 그대로 출력에 유지한다 — 안건을 더하거나 빼거나 합치거나 나누지 않는다. 각 안건에는 메모에서 그 안건에 해당하는 논의만 배분한다.
- 메모에 있지만 **어느 안건에도 속하지 않는 내용**은 버리지 않는다 — 가장 관련 있는 안건의 discussion 배열 끝에 "(기타) " 접두를 붙여 한 항목으로 넣는다. 관련 안건을 판단하기 어려우면 논의 순서상 가장 가까운 안건에 붙인다.
- 특정 안건에 대응하는 메모가 없으면 그 안건의 discussion은 빈 배열로 둔다. 짧은 메모를 부풀리지도 않는다 — 출력 분량은 메모 분량에 비례한다. discussion이 비어도 needsClarification에는 "게시 전 확인" 같은 뻔한 문구가 아니라 무엇이 비었는지 구체적으로 적는다(예: "○○ 안건 관련 논의 내용 확인 필요").
- decision은 메모에 의결(가결/부결/보류) 결과가 명시된 안건만 그 값을 쓰고, 단순 보고·논의만 있고 의결 언급이 없으면 "없음"으로 쓴다. 표결 없이 "다들 동의함", "이견 없음" 같은 합의 표현만 있어도 명시적 가결/부결 표현이 없으면 "없음"으로 쓴다 — 의결 여부를 추측하지 않는다.
- votes(표결자 성명)는 **제안**이다. 메모에 표결자 성명이 명시된 경우에만 채운다:
  - 이름은 참석자 명단에 있는 그대로만 쓴다. 한 사람을 두 칸에 넣지 않는다.
  - 반대·기권자 성명이 명시되고 나머지가 "나머지 전원 찬성"처럼 서술되면, 명단의 나머지 참석자를 for에 채워도 된다.
  - "찬성 7, 반대 1"처럼 **인원수만** 적혀 있으면 votes는 null — 성명을 추측하지 않는다.
  - 표결 언급이 없으면 null.
- quotes(견적 비교)도 제안이다. 메모에 업체명과 금액이 명시된 사업자 선정·입찰 비교 대목만 추출한다. 금액은 원 단위 숫자로 환산한다(예: "480만원" → 4800000). 금액이 없으면 amount는 null. note에는 메모의 조건 표현(최저가, 월 계약액 등)을 짧게 옮긴다. 해당 내용이 없으면 null.
- speaker는 **참석자 명단에 있는 이름**만 쓴다. 메모에 발언자가 없거나 명단에 없는 사람이면 빈 문자열로 두고 발언 요지만 적는다.
- needsClarification의 order는 관련 안건 번호, 특정 안건에 붙일 수 없는 지적이면 0으로 쓴다.

## 환각 금지 (가장 중요)
- 메모에 없는 발언·수치·인명·업체명·날짜를 만들어내지 않는다. 발언자 이름이 메모에 없으면 이름을 지어 붙이지 않고 speaker를 빈 문자열로 둔다.
- 표결자 성명·견적 금액도 같다 — 메모에 명시된 것만 옮기고, 추측으로 채우지 않는다.
- 메모가 모호하거나 상반되면 임의로 하나를 골라 단정하지 말고 needsClarification에 무엇을 확인해야 하는지 적는다.`;

/* 예시는 출력 JSON 그대로 — 보존형 다듬기, "(기타)" 배분, 결과 없음("없음") 처리,
   성명 명시 표결의 제안(나머지 전원 찬성 채움), 견적 추출, 인원수만 있는 표결의 null을 보여준다 */
const FEWSHOT = `## 예시 (입력 → 출력 JSON)

입력:
회의: 제12차 입주자대표회의
참석자: 김회장, 이감사, 박대표
안건 목록:
1. 승강기 정기점검 업체 재계약 건
2. 놀이터 시설 노후화 안건
3. 옥상 방수공사 사업자 선정 건

메모 원문:
오늘 승강기건 얘기함. 지금 업체가 3년째 하고 있는데 다들 만족한다고 함. 김회장이 하자보수 대응도 빨랐으니 조건 그대로 계약 연장하자고 해서 표결함. 찬성 7 반대 1로 통과. 그리고 다음 안건인 놀이터는 딱히 얘기 안 하고 넘어감. 옥상 방수는 견적 두 개 받아둠. 한빛방수 4,800만원, 대성건설 5,200만원. 이감사가 최저가로 하자고 해서 표결했는데 박대표만 반대하고 나머지 전원 찬성으로 한빛방수로 결정. 아 참, 지하주차장 조명도 어둡다는 얘기 나왔는데 이건 안건에 없던거라 일단 적어둠.

출력: {"agendas":[{"order":1,"title":"승강기 정기점검 업체 재계약 건","discussion":[{"speaker":"","text":"현재 업체가 3년째 정기점검을 수행 중이며 입주자대표 다수가 만족한다는 의견이 있었음."},{"speaker":"김회장","text":"하자보수 대응도 빨랐으므로 기존 조건 그대로 계약을 연장하자고 제안함."},{"speaker":"","text":"(기타) 지하주차장 조명이 어둡다는 의견이 제기됨."}],"decision":"가결","votes":null,"quotes":null},{"order":2,"title":"놀이터 시설 노후화 안건","discussion":[],"decision":"없음","votes":null,"quotes":null},{"order":3,"title":"옥상 방수공사 사업자 선정 건","discussion":[{"speaker":"","text":"옥상 방수공사에 대하여 2개 업체의 견적을 접수함."},{"speaker":"이감사","text":"최저가 업체로 선정하자고 제안함."},{"speaker":"","text":"표결 결과 한빛방수를 시공 업체로 선정하기로 함."}],"decision":"가결","votes":{"for":["김회장","이감사"],"against":["박대표"],"abstain":[]},"quotes":[{"vendor":"한빛방수","amount":48000000,"note":"최저가"},{"vendor":"대성건설","amount":52000000,"note":""}]}],"needsClarification":[{"order":2,"text":"놀이터 시설 노후화 안건 관련 논의 내용 확인 필요"},{"order":1,"text":"1호 안건 표결(찬성 7, 반대 1)의 반대자 성명이 메모에 없어 표결자를 확인해야 함"}]}`;

export async function generateMinutesDraft(args: {
  agenda: { order: number; title: string }[];
  rawText: string;
  meetingLabel: string;
  /** 회의 일시 "YYYY-MM-DD HH:mm" — 메모 속 상대 날짜("다음 달")의 기준점 */
  meetingAt?: string;
  /** 참석자 성명 — speaker를 이 안에서만 고르게 하는 앵커(안건 앵커와 같은 장치) */
  attendees: string[];
  /** 이행보고 안건의 전차 의결 배경(기한·비고) — 안건 제목만으로는 모델이 맥락을 모른다 */
  resolutionContext?: string[];
}): Promise<{
  agendas: MinutesAgenda[];
  needsClarification: { order: number; text: string }[];
}> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY는 env에서

  const agendaList = args.agenda.map((a) => `${a.order}. ${a.title}`).join("\n");
  const facts = [
    `회의: ${args.meetingLabel}`,
    ...(args.meetingAt ? [`회의 일시: ${args.meetingAt}`] : []),
    `참석자(speaker는 이 명단의 이름만 쓴다): ${args.attendees.join(", ") || "(명단 없음)"}`,
    ...(args.resolutionContext?.length
      ? [`전차 의결 맥락(이행 보고 안건의 배경 정보다. 메모에 없는 내용을 지어내는 근거로 쓰지 않는다):\n${args.resolutionContext.join("\n")}`]
      : []),
    `안건 목록(이 순서·개수·제목을 그대로 출력에 유지):\n${agendaList}`,
    `메모 원문:\n${args.rawText.trim() || "(입력 없음)"}`,
  ].join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    // 전사 파일(.txt) 업로드 경로가 생겨 메모가 길어질 수 있다 — 출력도 비례해 커진다
    max_tokens: 8192,
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
  return JSON.parse(block.text) as {
    agendas: MinutesAgenda[];
    needsClarification: { order: number; text: string }[];
  };
}
