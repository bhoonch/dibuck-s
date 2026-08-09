/**
 * 실 API 확인용 (건당 ~15원) — `npx tsx minutes-draft.manual.ts`
 * 안건 2개 + 가상 메모로 호출해 ① 안건 개수·순서 유지 ② 메모에 없는 수치·인명 없음
 * ③ 의결 언급 없는 안건은 decision "없음"인지를 눈으로 확인한다.
 */
import "dotenv/config";
import { generateMinutesDraft } from "./src/lib/minutes-ai";

async function main() {
  const draft = await generateMinutesDraft({
    agenda: [
      { order: 1, title: "지하주차장 LED 교체 공사 재계약 건" },
      { order: 2, title: "단지 내 CCTV 증설 안건" },
    ],
    meetingLabel: "제9차 입주자대표회의",
    rawText: `오늘 LED 공사건 논의함. 작년에 계약한 업체가 하자보수도 잘해줘서 재계약하자는 의견 많았음.
표결 진행함 - 찬성 6, 반대 2로 가결.
CCTV 얘기는 시간 없어서 다음 회의로 미루기로 함(의결 안 함).
그리고 회의 끝나고 누가 엘리베이터 정기점검 날짜를 안내판에 안 붙였다고 지적함 — 이건 안건에 없던 얘기.`,
  });
  console.log(JSON.stringify(draft, null, 2));

  // 검사 ① 안건 개수·순서 유지
  if (draft.agendas.length !== 2) throw new Error("안건 개수가 2개가 아님");
  if (draft.agendas[0].order !== 1 || draft.agendas[1].order !== 2)
    throw new Error("안건 순서가 유지되지 않음");
  if (
    draft.agendas[0].title !== "지하주차장 LED 교체 공사 재계약 건" ||
    draft.agendas[1].title !== "단지 내 CCTV 증설 안건"
  )
    throw new Error("안건 제목이 입력과 다름");

  // 검사 ③ 의결 언급 없는 안건은 "없음"
  if (draft.agendas[1].decision !== "없음")
    throw new Error(`CCTV 안건 decision이 '없음'이 아님: ${draft.agendas[1].decision}`);

  console.log("\n스키마·안건 앵커 검사 통과 (② 수치·인명 환각 여부는 출력을 눈으로 확인할 것)");
}
main().then(() => process.exit(0));
