import { NextResponse, type NextRequest } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { chargeTenant } from "@/lib/billing-run";
import { TossError, issueBillingKey } from "@/lib/toss";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/billing?${q}`, req.url));

/**
 * 카드 등록 결제창에서 돌아오는 자리. 여기서 일회성 authKey를 영구 빌링키로 바꾼다.
 *
 * customerKey는 쿼리로 오지만 믿지 않는다 — 세션의 단지에 저장된 값과 대조해야
 * 남의 customerKey를 붙여 넣어 빌링키를 가로채는 걸 막을 수 있다.
 * 카드 등록·즉시 정산은 마스터의 일이다 — 결제 화면·액션과 같은 경계(DIRECTOR)를
 * 콜백 입구에도 건다. 검사를 호출자(결제창을 연 화면)에게만 맡기면 이 URL을 직접
 * 친 다른 권한의 계정이 그대로 통과한다.
 */
export async function GET(req: NextRequest) {
  const session = await requireRole(Role.DIRECTOR);
  if (!session.tenantId) return back(req, "error=no_tenant");

  const authKey = req.nextUrl.searchParams.get("authKey");
  const customerKey = req.nextUrl.searchParams.get("customerKey");
  if (!authKey || !customerKey) return back(req, "error=canceled");

  const billing = await db.billing.findUnique({
    where: { tenantId: session.tenantId },
  });
  if (!billing || billing.customerKey !== customerKey)
    return back(req, "error=mismatch");

  try {
    const issued = await issueBillingKey(authKey, customerKey);
    await db.billing.update({
      where: { tenantId: session.tenantId },
      data: {
        billingKey: issued.billingKey,
        cardCompany: issued.card?.company ?? null,
        cardNumber: issued.card?.number ?? null,
        cancelRequestedAt: null, // 카드를 새로 넣었으면 해지 예약은 철회로 본다
      },
    });
    // 상태를 ACTIVE로 올리는 건 성공한 결제뿐이다(billing-run.ts) — 여기서 무조건
    // 올리면 chargeTenant 입구 검사(status ACTIVE + 청구일 미래)가 통과해 버려,
    // 연체·정지 단지가 카드 교체만으로 결제 없이 풀린다. 카드 첫 등록(NONE)만 승격.
    await db.billing.updateMany({
      where: { tenantId: session.tenantId, status: "NONE" },
      data: { status: "ACTIVE" },
    });
  } catch (err) {
    console.error("[billing] 빌링키 발급 실패", err);
    return back(req, `error=issue&message=${encodeURIComponent(
      err instanceof TossError ? err.message : "카드 등록에 실패했습니다.",
    )}`);
  }

  // 등록 즉시 정산한다 — 체험이 끝나 잠긴 모듈이 있으면 여기서 결제되며 바로 풀리고,
  // 아직 전부 체험 중이면 결제 없이 체험 종료일이 첫 청구일로 잡힌다.
  // 정상 결제 중(다음 청구일이 미래)인 단지의 카드 변경이면 chargeTenant가
  // 입구에서 걸러 아무것도 결제하지 않는다.
  const result = await chargeTenant(session.tenantId);
  return back(req, result.ok ? "registered=1" : "error=charge");
}
