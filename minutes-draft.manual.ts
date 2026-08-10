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
    attendees: ["김회장", "이감사", "박대표"],
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

  // 검사 ④ speaker는 참석자 명단 안에서만 (빈 문자열 허용)
  const roster = new Set(["김회장", "이감사", "박대표", ""]);
  for (const a of draft.agendas)
    for (const sp of a.discussion)
      if (typeof sp !== "string" && !roster.has(sp.speaker))
        throw new Error(`명단에 없는 발언자: ${sp.speaker}`);

  // 검사 ⑤ 표결은 모델이 만들지 않는다 — 메모에 "찬성 6, 반대 2"가 있어도 무시해야 한다
  for (const a of draft.agendas)
    if (a.votes || a.votesFor != null || a.votesAgainst != null)
      throw new Error("모델이 표결을 출력함 — 표결은 화면에서만 찍는다");

  console.log("\n스키마·안건 앵커 검사 통과 (② 수치·인명 환각 여부는 출력을 눈으로 확인할 것)");
}
main().then(() => process.exit(0));
