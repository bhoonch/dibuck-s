/**
 * 기안·품의 초안 생성 수동 확인 — `npx tsx gian-draft.manual.ts`
 *
 * ⚠️ 실제 Claude API를 호출한다 (건당 ~15원, ANTHROPIC_API_KEY 필요).
 * 자동 검증 대상이 아니라 **프롬프트를 손볼 때 결과를 눈으로 보는** 스크립트다.
 * 형식·법령 정확도·환각 여부는 사람이 읽어야 판단할 수 있다.
 */
import "dotenv/config";
import { generateDraft } from "./src/lib/gian/claude";
import { classify, formatMoney, legalNoticesFor } from "./src/lib/gian/rules";

const CASES = [
  {
    label: "품의서 · 수의계약 (LED 교체 450만원)",
    form: {
      work: "지하주차장 노후 등기구 LED 교체 공사",
      location: "지하주차장 1~2층 전구역",
      why: "형광등이 자주 고장 나고 침침해서 민원이 계속 들어옵니다. 전기료도 아끼고 싶습니다.",
      schedule: "8월 중 계약, 9월 초 공사",
      quotes: [
        { vendor: "A 이엔지(주)", amount: 4_500_000 },
        { vendor: "B 테크(주)", amount: 4_950_000 },
      ],
    },
    amount: 4_500_000,
    vat: true,
  },
  {
    label: "기안서 · 예산 없음 (자체 점검)",
    form: {
      work: "단지 내 시설물 정기점검 및 환경정비 추진",
      location: "각 동 옥상, 지하주차장, 어린이놀이터",
      why: "해빙기 대비 안전 점검이 필요합니다",
      schedule: "3월 첫째 주 5일간",
      quotes: [],
    },
    amount: 0,
    vat: true,
  },
  {
    label: "공사 추진 기안서 · 장충금 + 입찰 (옥상 방수 4,500만원)",
    form: {
      work: "옥상 우레탄 도막 방수 재시공 공사",
      location: "101동~105동 옥상 전구역",
      why: "최상층 세대 누수 민원이 계속되고 있습니다",
      schedule: "9월 입찰, 10월 착공",
      quotes: [],
    },
    amount: 45_000_000,
    vat: true,
  },
];

/** 인자로 케이스 번호를 주면 그것만 (예: npx tsx gian-draft.manual.ts 1) */
const pick = Number(process.argv[2]);
const targets = Number.isInteger(pick) ? [CASES[pick]] : CASES;

async function main() {
  for (const c of targets) {
    const cls = classify({
      amountRaw: c.amount,
      vatIncluded: c.vat,
      texts: [c.form.work, c.form.location, c.form.why],
    });
    console.log("\n" + "=".repeat(70));
    console.log(`■ ${c.label}`);
    console.log(
      `  코드 판정: ${cls.docType} / 계약=${cls.context} / 장충금=${cls.isLtp} / 결재선 외부=${cls.externalApprovers.join(",") || "없음"}`,
    );
    if (c.amount > 0) console.log(`  금액 표기: ${formatMoney(c.amount, c.vat)}`);
    console.log("=".repeat(70));

    const t0 = Date.now();
    const draft = await generateDraft({
      cls,
      form: c.form,
      tenantName: "행복아파트",
    });
    console.log(`\n[제목] ${draft.title}`);
    console.log("\n1. 관련근거");
    draft.legalBasis.forEach((b, i) => console.log(`  ${"가나다라마"[i] ?? "•"}. ${b}`));
    draft.sections.forEach((s, i) => {
      console.log(`\n${i + 3}. ${s.heading}`);
      s.lines.forEach((l) => console.log(`  ${l}`));
    });
    console.log("\n붙  임: " + (draft.attachments.join(", ") || "없음") + "  끝.");

    const notices = [...new Set([...legalNoticesFor(cls), ...draft.legalNotices])];
    if (notices.length) console.log("\n[법적 유의사항]");
    notices.forEach((n) => console.log(`  - ${n}`));
    if (draft.needsClarification.length) console.log("\n[확인 필요]");
    draft.needsClarification.forEach((n) => console.log(`  - ${n}`));
    console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  }
}

main();
