/**
 * 견적서 첨부 검증용 초안(수의계약 품의, 견적 2곳)을 dev DB에 만든다.
 * npx tsx gian-attachment.manual.ts — AI 호출 없음(비용 0). 문서 URL을 찍는다.
 */
import "dotenv/config";
import { db } from "./src/lib/db";
import { createDocument } from "./src/lib/documents";
import { classify, legalNoticesFor } from "./src/lib/gian/rules";

async function main() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: "test1@test.com" },
  });
  const quotes = [
    { vendor: "한빛방수", amount: 3_300_000 },
    { vendor: "튼튼설비", amount: 3_520_000 },
  ];
  const cls = classify({
    amountRaw: 3_300_000,
    vatIncluded: true,
    texts: ["누수 부분 보수"],
    fund: "maintenance",
    budgeted: true,
  });
  const draft = {
    title: "지하주차장 누수 부분 보수공사 시행의 건",
    legalBasis: ["공동주택관리법 제63조(관리주체의 업무)"],
    sections: [
      {
        heading: "추진 목적",
        lines: [
          "가. 지하주차장 천장 누수로 차량 피해 민원이 접수되어 보수가 필요함.",
        ],
      },
      {
        heading: "공사 개요",
        lines: [
          "가. 공 사 명: 지하주차장 누수 부분 보수공사",
          "나. 소요예산: 금 3,300,000원 (금삼백삼십만원 / VAT 포함)",
        ],
      },
      {
        heading: "견적 비교",
        lines: [
          "가. 한빛방수: 3,300,000원 (선정)",
          "나. 튼튼설비: 3,520,000원",
          "※ 추정가격 500만 원 이하(VAT 제외)로 수의계약 대상임.",
        ],
      },
    ],
    attachments: ["견적서 2부.", "사업자등록증 사본 1부."],
    legalNotices: legalNoticesFor(cls),
    needsClarification: [],
  };
  const doc = await createDocument({
    tenantId: user.tenantId!,
    moduleId: "approvals",
    type: "approval",
    title: draft.title,
    content: draft.title,
    meta: {
      form: {
        work: "지하주차장 누수 부분 보수공사",
        location: "지하주차장",
        why: "누수 민원",
        schedule: "",
        amount: 3_300_000,
        vatIncluded: true,
        fund: "maintenance",
        budgeted: true,
      },
      quotes,
      cls,
      draft,
      plannedSteps: [],
    },
    status: "draft",
    createdById: user.id,
  });
  console.log(`http://localhost:3000/modules/approvals/${doc.id}`);
}
main().then(() => process.exit(0));
