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
import {
  TossError,
  chargeBilling,
  settledPayment,
  type TossPayment,
} from "@/lib/toss";
import {
  sendPaymentFailed,
  sendPaymentSuccess,
  sendSuspended,
  trySend,
} from "@/lib/mailer";

export type ChargeResult =
  | { ok: true; amount: number }
  | { ok: false; reason: string };

/** 청구 안내를 받을 사람 = 그 단지 마스터. 없으면 아무나 한 명(계정이 하나뿐인 초기 단지) */
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
 * 마지막 시도가 사실은 승인됐는지 토스에 물어보고, 그랬으면 기록을 사실에 맞춘다.
 *
 * 우리 쪽 FAILED는 "승인 실패"일 수도 있지만 "응답 유실"일 수도 있다. 후자를 그대로
 * 두면 다음 시도가 새 주문번호로 같은 기간을 한 번 더 결제한다 — 이중 출금이다.
 * PENDING은 승인 직후·기록 전에 프로세스가 죽은 흔적이다 — 호출 전에 적어 둔 이 행이
 * 주문번호를 아는 유일한 단서라, 여기서 실제 결과(PAID/FAILED)로 닫는다.
 * chargeTenant는 실패 직후에도 대사하지만, 그 조회마저 실패할 수 있어서 다음 시도
 * 입구에서 한 번 더 본다.
 *
 * `lookup`은 테스트에서 갈아 끼우는 자리다(네트워크 없이 검증).
 */
export async function reconcileLastFailure(
  tenantId: string,
  lookup: (orderId: string) => Promise<TossPayment | null> = settledPayment,
) {
  const last = await db.payment.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (last?.status !== "FAILED" && last?.status !== "PENDING") return null;

  const paid = await lookup(last.orderId);
  if (!paid) {
    // 승인 내역이 없는 PENDING은 실패로 닫는다 — 영원히 "진행 중"으로 남으면
    // 이력이 거짓말이 되고, 마지막 행을 보는 이 함수도 계속 여기 걸린다
    if (last.status === "PENDING")
      await db.payment.update({
        where: { id: last.id },
        data: {
          status: "FAILED",
          failCode: "ABORTED",
          failReason: "결제 진행 중 중단 — 승인 내역 없음",
        },
      });
    return null;
  }

  const [payment] = await db.$transaction([
    db.payment.update({
      where: { id: last.id },
      data: {
        status: "PAID",
        paymentKey: paid.paymentKey,
        receiptUrl: paid.receipt?.url,
        paidAt: new Date(),
        failCode: null,
        failReason: null,
      },
    }),
    // 낸 기간은 그때 계산한 periodEnd까지다 — 오늘을 기준으로 다시 잡으면 하루씩 밀린다
    db.billing.update({
      where: { tenantId },
      data: {
        status: "ACTIVE",
        nextBillingAt: last.periodEnd,
        pastDueSince: null,
      },
    }),
  ]);

  // 실패 안내를 이미 받은 사람들이다 — 사실은 결제됐다고 정정해 준다
  const contact = await billingContact(tenantId);
  if (contact)
    await trySend(() =>
      sendPaymentSuccess(
        contact.email,
        contact.name,
        payment.amount,
        last.periodEnd,
        paid.receipt?.url,
      ),
    );
  return payment;
}

/**
 * 한 단지를 청구한다.
 *
 * - 청구할 모듈이 없으면(전부 해지·체험 중) 결제하지 않고 다음 달로 미룬다
 * - 해지 예약이 걸려 있으면 결제 대신 실제 해지를 수행한다
 * - 실패하면 PAST_DUE로 내리고 유예 안에서는 매일 다시 불린다
 * - 단, 실패로 적기 전에 주문번호로 대사한다 — 승인은 됐는데 응답만 유실된 건을
 *   실패로 적으면 다음 시도가 같은 기간을 한 번 더 결제한다(reconcileLastFailure)
 */
export async function chargeTenant(tenantId: string): Promise<ChargeResult> {
  const now = new Date();
  const billing = await db.billing.findUnique({ where: { tenantId } });
  if (!billing?.billingKey) return { ok: false, reason: "카드가 등록되지 않았습니다." };

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, deleteRequestedAt: true },
  });
  if (!tenant) return { ok: false, reason: "단지를 찾을 수 없습니다." };

  // 결제 전에 대사부터 — 지난 실패(FAILED)가 사실은 승인이었거나, 지난 시도가
  // 기록 전에 죽어 PENDING으로 남았다면 오늘 결제할 게 아니라 기록을 고칠 차례다.
  // 아래 입구 검사보다 먼저 하는 이유: 죽은 시도는 이미 청구일을 다음 달로 밀어 놨을
  // 수 있어(자리 잡기 후 사망), 입구 검사가 먼저면 다음 달까지 기록이 안 고쳐진다.
  // 마지막 행이 PAID면(정상 상태) 조회 한 번으로 바로 빠져나온다.
  const settled = await reconcileLastFailure(tenantId);
  if (settled) return { ok: true, amount: settled.amount };

  // 지금 결제할 차례인가 — 크론은 dunningAction으로 거르지만, 카드 변경 콜백과
  // 오래된 탭의 "지금 결제하기"도 같은 함수를 타므로 검사는 입구에 있어야 한다.
  // 이 검사가 없으면 이미 결제한 기간을 그대로 한 번 더 결제한다.
  if (
    billing.status === "ACTIVE" &&
    billing.nextBillingAt &&
    kstMidnight(billing.nextBillingAt) > kstMidnight(now)
  )
    return { ok: true, amount: 0 };

  // 해지 예약 — 이미 낸 기간이 끝났으니 여기서 실제로 끊는다.
  // 탈퇴 신청도 같다: 지워질 단지에 새 결제를 걸면 안 되고, 이 검사가 여기(입구)에
  // 있어야 크론·"지금 결제하기"·카드 변경 콜백이 전부 걸러진다. 별도 플래그를
  // 복제하지 않고 tenant.deleteRequestedAt 원본을 읽는다 — 탈퇴를 취소하면
  // (청구일이 아직 안 지났다면) 아무 일도 없었던 것이 된다.
  if (billing.cancelRequestedAt || tenant.deleteRequestedAt) {
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
  // 상태(PAST_DUE·SUSPENDED)는 건드리지 않는다 — 상태를 올리는 건 성공한 결제뿐이다.
  // 여기서 ACTIVE로 되돌리면 "모듈 전부 해지 → 지금 결제하기(0원) → 죽은 카드로
  // 재구독"으로 연체·정지를 무한히 세탁해 매달 공짜로 쓸 수 있다.
  if (amount === 0) {
    const nextTrialEnd = subs
      .filter((s) => s.status === "ACTIVE" && s.trialEndsAt && s.trialEndsAt > now)
      .map((s) => s.trialEndsAt!)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    await db.billing.update({
      where: { tenantId },
      data: { nextBillingAt: nextTrialEnd ? kstMidnight(nextTrialEnd) : next },
    });
    return { ok: true, amount: 0 };
  }

  // 동시 요청(크론과 "지금 결제하기"의 경합, 더블클릭)이 같은 기간을 두 번 결제하지
  // 않도록, 읽어 둔 상태 그대로일 때만 자리를 잡는다 — 밀린 쪽은 결제 없이 빠진다.
  // ponytail: 자리만 잡고 서버가 죽으면 이번 달 청구가 건너뛰어진다(다음 달 자동 복구).
  const claimed = await db.billing.updateMany({
    where: {
      tenantId,
      status: billing.status,
      nextBillingAt: billing.nextBillingAt,
      pastDueSince: billing.pastDueSince,
    },
    data: { nextBillingAt: next },
  });
  if (claimed.count === 0)
    return { ok: false, reason: "결제가 이미 진행 중입니다. 잠시 후 새로고침해 확인해 주세요." };

  const contact = await billingContact(tenantId);
  const order = orderId(tenantId, now);
  const orderName =
    items.length === 1 ? items[0].name : `${items[0].name} 외 ${items.length - 1}건`;

  // 토스를 부르기 전에 PENDING 행부터 적는다 — 승인 직후·기록 전에 죽으면 이 행의
  // 주문번호가 대사(reconcileLastFailure)의 유일한 단서다. 응답이 오면 아래에서
  // 이 행을 PAID/FAILED로 닫는다(새 행을 만들지 않는다).
  const pending = await db.payment.create({
    data: {
      tenantId,
      orderId: order,
      amount,
      status: "PENDING",
      items,
      periodStart: now,
      periodEnd: next,
      attempt: daysBetween(billing.pastDueSince ?? now, now) + 1,
    },
  });

  let paid: TossPayment;
  try {
    paid = await chargeBilling(billing.billingKey, {
      customerKey: billing.customerKey,
      amount,
      orderId: order,
      orderName: `디벅 ${orderName}`,
      customerEmail: contact?.email,
      customerName: contact?.name,
    });
  } catch (err) {
    // 실패로 보이지만 승인은 끝나고 응답만 유실됐을 수 있다(타임아웃·5xx).
    // 주문번호로 확인하지 않고 FAILED로 적으면 내일 새 주문번호로 또 결제한다.
    const settled = await settledPayment(order);
    if (!settled) {
      const reason =
        err instanceof TossError ? err.message : "결제 처리 중 오류가 발생했습니다.";
      const code = err instanceof TossError ? err.code : "UNKNOWN";
      // 첫 실패에만 유예 시작 시각을 찍는다 — 재시도마다 갱신하면 유예가 영원히 안 끝난다
      const pastDueSince = billing.pastDueSince ?? now;

      await db.$transaction([
        db.payment.update({
          where: { id: pending.id },
          data: { status: "FAILED", failCode: code, failReason: reason },
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
    console.warn("[billing] 응답은 실패였지만 승인은 됐다 — 대사로 복구", order);
    paid = settled;
  }

  await db.$transaction([
    db.payment.update({
      where: { id: pending.id },
      data: {
        status: "PAID",
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
