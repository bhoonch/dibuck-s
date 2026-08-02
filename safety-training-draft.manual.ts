/**
 * 실 API 확인용 (건당 ~15원) — `npx tsx safety-training-draft.manual.ts`
 * 정기교육(폭염+감전, 그 외 근로자)이 스키마대로, 직종에 맞게, 빈칸 없이 나오는지 본다.
 */
import "dotenv/config";
import { generateTrainingDraft } from "./src/lib/safety-training-ai";

async function main() {
  const draft = await generateTrainingDraft({
    courseLabel: "정기교육",
    topics: ["폭염 대비 온열질환 예방", "전기 작업 안전"],
    hours: "1시간",
    attendeeSummary: "기전 2명 · 경비 1명 · 미화 2명",
    tenantName: "행복아파트",
  });
  console.log(JSON.stringify(draft, null, 2));
  const all = JSON.stringify(draft);
  // 환각 검사 — 빈칸 표기·지어낸 날짜가 없어야 한다
  if (all.includes("○")) throw new Error("빈칸(○) 표기 발견");
  if (/\d{4}년|\d+월 \d+일/.test(all)) throw new Error("입력에 없는 날짜 발견");
  if (draft.sections.length !== 2) throw new Error("주제 수와 절 수가 다르다");
  console.log("\n스키마·빈칸·날짜 검사 통과");
}
main().then(() => process.exit(0));
