/**
 * 실 API 확인용 (건당 ~15원) — `npx tsx notice-draft.manual.ts`
 * 키워드 3개만 넣은 단수 안내가 스키마대로, 지어낸 날짜 없이 나오는지 본다.
 */
import "dotenv/config";
import { generateNoticePost } from "./src/lib/notice-ai";

async function main() {
  const draft = await generateNoticePost({
    kind: "guide",
    typeLabel: "단수 안내",
    when: "8월 11일(화) 오전 9시부터 오후 3시",
    where: "102동",
    detail: "옥상 물탱크 배관 교체",
    contact: "관리사무소 031-000-8526",
    tenantName: "행복아파트",
  });
  console.log(JSON.stringify(draft, null, 2));
  // 환각 검사 — 입력에 없는 빈칸 표기가 없어야 한다
  const all = JSON.stringify(draft);
  if (all.includes("○")) throw new Error("빈칸(○) 표기 발견");
  console.log("\n스키마·빈칸 검사 통과");
}
main().then(() => process.exit(0));
