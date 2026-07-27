/**
 * 실제 청구 실행 — 크론과 "지금 결제하기"(셀프 재결제)가 같은 함수를 쓴다.
 * 두 경로가 갈라지면 한쪽만 상태 전이가 틀리는 사고가 난다.
 */
import { db } from "@/lib/db";
import {
  GRACE_DAYS,
  billableItems,
  daysBetween,
  kstMidnight,
  nextBillingDate,
  orderId,
  totalAmount,
} from "@/lib/billing";
import { ymdKst } from "@/lib/utils";
import { TossError, chargeBilling } from "@/lib/toss";
import {
  sendPaymentFailed,
  sendPaymentSuccess,
  sendSuspended,
  trySend,
} from "@/lib/mailer";

export type ChargeResult =
  | { ok: true; amount: number }
  | { ok: false; reason: string };

/** 청구 안내를 받을 사람 = 그 단지 소장. 없으면 아무나 한 명(계정이 하나뿐인 초기 단지) */
async function billingContact(tenantId: string) {
  return (
    (await db.user.findFirst({
      where: { tenantId, role: "DIRECTOR" },
      select: { email: true, name: true },
    })) ??
    db.user.findFirst({
      where: { tenantId },
      select: { email: true, name: true },
    })
  );
}

/**
 * 한 단지를 청구한다.
 *
 * - 청구할 모듈이 없으면(전부 해지·체험 중) 결제하지 않고 다음 달로 미룬다
 * - 해지 예약이 걸려 있으면 결제 대신 실제 해지를 수행한다
 * - 실패하면 PAST_DUE로 내리고 유예 안에서는 매일 다시 불린다
 */
export async function chargeTenant(tenantId: string): Promise<ChargeResult> {
  const now = new Date();
  const billing = await db.billing.findUnique({ where: { tenantId } });
  if (!billing?.billingKey) return { ok: false, reason: "카드가 등록되지 않았습니다." };

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  if (!tenant) return { ok: false, reason: "단지를 찾을 수 없습니다." };

  // 해지 예약 — 이미 낸 기간이 끝났으니 여기서 실제로 끊는다
  if (billing.cancelRequestedAt) {
    await db.$transaction([
      db.tenantModule.updateMany({
        where: { tenantId, status: "ACTIVE" },
        data: { status: "CANCELED" },
      }),
      db.billing.update({
        where: { tenantId },
        data: {
          status: "NONE",
          nextBillingAt: null,
          billingKey: null, // 더 청구하지 않으므로 카드 정보도 들고 있지 않는다
          cardCompany: null,
          cardNumber: null,
          pastDueSince: null,
        },
      }),
    ]);
    return { ok: true, amount: 0 };
  }

  const subs = await db.tenantModule.findMany({
    where: { tenantId },
    include: { module: { select: { name: true, price: true } } },
  });
  const items = billableItems(
    subs.map((s) => ({
      id: s.moduleId,
      name: s.module.name,
      price: s.module.price,
      status: s.status,
      trialEndsAt: s.trialEndsAt,
    })),
    now,
  );
  const amount = totalAmount(items);
  // 청구 기준일은 첫 유료 결제 때 한 번 정해지고 이후 바뀌지 않는다 —
  // 매번 "그날의 일"로 갱신하면 1/31 → 2/28 → 3/28처럼 날짜가 앞으로 밀린다
  const day = billing.billingDay ?? Number(ymdKst(now).slice(8));
  const next = nextBillingDate(now, day);

  // 청구할 게 없다 — 결제를 걸지 않는다. 아직 체험 중인 모듈이 있으면
  // 그중 가장 이른 체험 종료일이 첫 청구일이 된다(체험이 공짜로 길어지지 않게).
  if (amount === 0) {
    const nextTrialEnd = subs
      .filter((s) => s.status === "ACTIVE" && s.trialEndsAt && s.trialEndsAt > now)
      .map((s) => s.trialEndsAt!)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    await db.billing.update({
      where: { tenantId },
      data: {
        nextBillingAt: nextTrialEnd ? kstMidnight(nextTrialEnd) : next,
        status: "ACTIVE",
        pastDueSince: null,
      },
    });
    return { ok: true, amount: 0 };
  }

  const contact = await billingContact(tenantId);
  const order = orderId(tenantId, now);
  const orderName =
    items.length === 1 ? items[0].name : `${items[0].name} 외 ${items.length - 1}건`;

  try {
    const paid = await chargeBilling(billing.billingKey, {
      customerKey: billing.customerKey,
      amount,
      orderId: order,
      orderName: `디벅 ${orderName}`,
      customerEmail: contact?.email,
      customerName: contact?.name,
    });

    await db.$transaction([
      db.payment.create({
        data: {
          tenantId,
          orderId: order,
          amount,
          status: "PAID",
          items,
          periodStart: now,
          periodEnd: next,
          paymentKey: paid.paymentKey,
          receiptUrl: paid.receipt?.url,
          paidAt: now,
        },
      }),
      db.billing.update({
        where: { tenantId },
        data: {
          status: "ACTIVE",
          nextBillingAt: next,
          pastDueSince: null,
          billingDay: day, // 첫 유료 결제에서 확정, 이후 같은 값이 다시 들어간다
        },
      }),
    ]);

    if (contact)
      await trySend(() =>
        sendPaymentSuccess(contact.email, contact.name, amount, next, paid.receipt?.url),
      );
    return { ok: true, amount };
  } catch (err) {
    const reason =
      err instanceof TossError ? err.message : "결제 처리 중 오류가 발생했습니다.";
    const code = err instanceof TossError ? err.code : "UNKNOWN";
    // 첫 실패에만 유예 시작 시각을 찍는다 — 재시도마다 갱신하면 유예가 영원히 안 끝난다
    const pastDueSince = billing.pastDueSince ?? now;

    await db.$transaction([
      db.payment.create({
        data: {
          tenantId,
          orderId: order,
          amount,
          status: "FAILED",
          items,
          periodStart: now,
          periodEnd: next,
          failCode: code,
          failReason: reason,
          attempt: daysBetween(pastDueSince, now) + 1,
        },
      }),
      db.billing.update({
        where: { tenantId },
        data: { status: "PAST_DUE", pastDueSince },
      }),
    ]);

    if (contact)
      await trySend(() =>
        sendPaymentFailed(
          contact.email,
          contact.name,
          reason,
          Math.max(0, GRACE_DAYS - daysBetween(pastDueSince, now)),
        ),
      );
    return { ok: false, reason };
  }
}

/** 유예 초과 — 전 모듈 잠금. 데이터는 지우지 않는다(재결제하면 그대로 복구) */
export async function suspendTenant(tenantId: string) {
  await db.billing.update({
    where: { tenantId },
    data: { status: "SUSPENDED" },
  });
  const contact = await billingContact(tenantId);
  if (contact)
    await trySend(() => sendSuspended(contact.email, contact.name));
}
