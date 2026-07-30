"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { isSubscribed } from "@/lib/modules";
import { rateLimit } from "@/lib/rate-limit";
import { parseWon } from "@/lib/won";
import { aiEnabled, generateDraft, type GianDraft } from "@/lib/gian/claude";
import {
  buildApprovalSteps,
  classify,
  externalRoleLabels,
  legalNoticesFor,
  type FundSource,
} from "@/lib/gian/rules";
import { approvalLineFor } from "@/lib/gian/approval";

// "use server" 파일은 async 함수만 export 가능 — 상수는 로컬로
const MODULE_ID = "approvals";

/** 단지당 일일 생성 한도 — 셀프서비스라 무한 생성 남용을 막는다. ponytail: 프로세스 메모리(rate-limit.ts 천장 동일) */
const DAILY_LIMIT = 30;

export type GenerateState = { error?: string } | undefined;

/** 문서함 검색용 평문 — 화면 렌더는 meta의 구조화 데이터가 담당한다 */
function toPlainText(draft: GianDraft): string {
  return [
    draft.title,
    ...draft.legalBasis,
    ...draft.sections.flatMap((s) => [s.heading, ...s.lines]),
    ...draft.attachments,
  ].join("\n");
}

export async function generateGian(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, MODULE_ID)))
    return { error: "모듈 구독이 필요합니다." };
  if (!aiEnabled())
    return {
      error: "AI 초안 생성이 아직 활성화되지 않았습니다. 운영팀에 문의해 주세요.",
    };

  const work = String(formData.get("work") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const why = String(formData.get("why") ?? "").trim();
  const schedule = String(formData.get("schedule") ?? "").trim();
  const amountRaw = parseWon(formData.get("amount"));
  const vatIncluded = formData.get("vat") === "on";
  const rawFund = String(formData.get("fund") ?? "");
  const fund: FundSource | undefined =
    rawFund === "ltp" || rawFund === "misc" || rawFund === "maintenance"
      ? rawFund
      : undefined;
  // 예산 반영은 기본 true — 칸이 없던 시절 문서와 같은 판정이 나오게
  const budgeted = formData.get("budgeted") !== "no";
  if (!work) return { error: "공사·사업명(안건)을 입력해 주세요." };

  // 결재선 재료 — 전결 한도가 분류에 들어가므로 판정보다 먼저 읽는다
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      name: true,
      directorLimit: true,
      directorLimitClause: true,
    },
  });

  const cls = classify({
    amountRaw,
    vatIncluded,
    texts: [work, location, why],
    fund,
    budgeted,
    directorLimit: tenant.directorLimit ?? undefined,
  });

  // 견적 3칸 중 채워진 것만 — 수의계약이면 법적 요건상 2개사 이상 필수
  const quotes = [1, 2, 3]
    .map((i) => ({
      vendor: String(formData.get(`vendor${i}`) ?? "").trim(),
      amount: parseWon(formData.get(`quote${i}`)),
    }))
    .filter((q) => q.vendor && q.amount > 0)
    .sort((a, b) => a.amount - b.amount); // 최저가가 선정 업체
  if (cls.context === "direct" && quotes.length < 2)
    return {
      error:
        "수의계약은 2개사 이상의 견적이 필요합니다 (사업자 선정지침). 견적 업체와 금액을 입력해 주세요.",
    };

  if (rateLimit(`gian:${tenantId}`, DAILY_LIMIT, 24 * 60 * 60 * 1000) <= 0)
    return {
      error: `오늘 생성 한도(${DAILY_LIMIT}건)에 도달했습니다. 내일 다시 시도해 주세요.`,
    };

  // 결재선 미리보기 스냅샷 — 상신(Phase 2)이 아니라 문서에 보여줄 예정 결재선.
  // 지금 초안을 만드는 사람이 기안자라 결재란 첫 칸에 선다(상신 때와 같은 재료).
  const { internal, external } = await approvalLineFor(tenantId, session.userId);
  const { steps, missing } = buildApprovalSteps(cls, internal, external);

  let draft: GianDraft;
  try {
    draft = await generateDraft({
      cls,
      form: { work, location, why, schedule, quotes },
      tenantName: tenant.name,
      directorLimitClause: tenant.directorLimitClause,
    });
  } catch (e) {
    console.error("gian generate failed:", e);
    return { error: "초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  // 결정적 유의사항이 항상 앞 — LLM이 빠뜨려도 법적 경고는 나간다
  const legalNotices = [...new Set([...legalNoticesFor(cls), ...draft.legalNotices])];
  const needsClarification = [...draft.needsClarification];
  if (steps.length === 0)
    needsClarification.push(
      "결재선이 비어 있습니다 — 설정 > 결재선에서 결재자를 지정해야 상신할 수 있습니다. (문서의 결재란은 공란으로 인쇄됩니다)",
    );
  if (missing.length > 0)
    needsClarification.push(
      `결재선에 ${missing.map((r) => externalRoleLabels[r]).join("·")}이(가) 등록되지 않았습니다 — 설정 > 결재선에서 등록해야 상신할 수 있습니다.`,
    );

  const doc = await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    // 채번은 상신 때 — 올리지 않고 버린 초안이 결번을 남기지 않게
    numberOnSubmit: true,
    type: cls.docType === "gian" ? "gian" : "approval",
    title: draft.title,
    content: toPlainText(draft),
    meta: {
      form: {
        work,
        location,
        why,
        schedule,
        amount: amountRaw,
        vatIncluded,
        fund,
        budgeted,
      },
      quotes,
      cls,
      draft: { ...draft, legalNotices, needsClarification },
      plannedSteps: steps,
    },
    status: "draft",
    createdById: session.userId,
  });

  redirect(`/modules/approvals/${doc.id}`);
}
