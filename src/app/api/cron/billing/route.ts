import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { RENEWAL_NOTICE_DAYS, daysBetween, dunningAction } from "@/lib/billing";
import {
  chargeTenant,
  reconcileLastFailure,
  suspendTenant,
} from "@/lib/billing-run";
import {
  sendRenewalNotice,
  sendTrialEndingSoon,
  sendTrialExpired,
  trySend,
} from "@/lib/mailer";
import { billableItems, totalAmount } from "@/lib/billing";
import { purgeExpiredTenants } from "@/lib/tenant-deletion";

/**
 * 하루 한 번 도는 청구·안내 배치.
 *
 * Next.js에는 상주 프로세스가 없어서 크론을 앱 안에 둘 수 없다. 대신 이 라우트를
 * 밖에서 때리게 하고 `CRON_SECRET`으로 잠갔다 — Vercel Cron이든 다른 스케줄러든
 * 같은 방식으로 붙으므로 배포처를 먼저 정하지 않아도 된다.
 *
 *   0 3 * * *  curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/billing
 *
 * 하루에 두 번 돌아도 안전하다: 결제는 nextBillingAt 도래분만 걸고, 성공하면 다음 달로
 * 밀리므로 같은 날 두 번 청구되지 않는다. 안내 메일만 중복될 수 있다.
 *
 * GET·POST 둘 다 받는다 — Vercel Cron과 curl 기본값은 GET이고, POST만 열어 두면
 * 매일 405만 나며 청구가 조용히 전면 중단된다.
 */
async function run(req: NextRequest) {
  if (!cronAuthorized(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const result = { charged: 0, failed: 0, suspended: 0, mails: 0, purged: 0 };

  // ── 0. 탈퇴 유예가 끝난 단지 삭제 ──────────────────────────
  // 청구보다 먼저 — 지워질 단지에 결제를 걸지 않는다
  result.purged = await purgeExpiredTenants(now);

  // 접속기록 파기 — 보관 의무(1년 이상)를 채운 지난 기록. 2년 경과분을 지운다
  await db.accessLog.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 2 * 365 * 86400000) } },
  });

  // ── 1. 청구·재시도·정지 ────────────────────────────────────
  // SUSPENDED도 포함한다 — 해지 예약·탈퇴 신청은 정지 상태에서도 실행돼야 한다.
  // 빼면 그 단지는 "해지될 예정" 안내만 뜬 채 빌링키를 영원히 쥐고 있게 된다.
  const billings = await db.billing.findMany({
    where: {
      status: { in: ["ACTIVE", "PAST_DUE", "SUSPENDED"] },
      billingKey: { not: null },
    },
    include: { tenant: { select: { deleteRequestedAt: true } } },
  });
  for (const b of billings) {
    // 탈퇴 신청도 해지 예약과 같은 신호다 — chargeTenant가 결제 대신 해지한다
    const action = dunningAction(
      { ...b, cancelRequestedAt: b.cancelRequestedAt ?? b.tenant.deleteRequestedAt },
      now,
    );
    if (action === "none") continue;
    if (action === "suspend") {
      // 잠그기 전에 대사 — 마지막 시도가 사실은 승인됐는데 응답만 유실된 것이면
      // 돈은 받고 서비스는 잠그는 셈이 된다. 재시도 경로는 chargeTenant 입구에서
      // 이미 보지만, 정지는 chargeTenant를 타지 않아 여기서 따로 본다.
      if (await reconcileLastFailure(b.tenantId)) {
        result.charged++;
        continue;
      }
      await suspendTenant(b.tenantId);
      result.suspended++;
      continue;
    }
    const charged = await chargeTenant(b.tenantId);
    if (charged.ok) result.charged++;
    else result.failed++;
  }

  // ── 2. 갱신 예고 (D-7 / D-1) ───────────────────────────────
  for (const b of billings) {
    // 탈퇴 신청 단지도 뺀다 — 그날 결제되는 게 아니라 해지되므로 예고가 거짓말이 된다
    if (
      b.status !== "ACTIVE" ||
      !b.nextBillingAt ||
      b.cancelRequestedAt ||
      b.tenant.deleteRequestedAt
    )
      continue;
    const left = daysBetween(now, b.nextBillingAt);
    if (!RENEWAL_NOTICE_DAYS.includes(left)) continue;

    const subs = await db.tenantModule.findMany({
      where: { tenantId: b.tenantId },
      include: { module: { select: { name: true, price: true } } },
    });
    const amount = totalAmount(
      billableItems(
        subs.map((s) => ({
          id: s.moduleId,
          name: s.module.name,
          price: s.module.price,
          status: s.status,
          trialEndsAt: s.trialEndsAt,
        })),
        now,
      ),
    );
    if (amount === 0) continue;

    const to = await director(b.tenantId);
    if (!to) continue;
    await trySend(() =>
      sendRenewalNotice(to.email, to.name, amount, b.nextBillingAt!, left),
    );
    result.mails++;
  }

  // ── 3. 체험 D-7 / 만료 안내 ────────────────────────────────
  // 카드가 등록된 단지는 체험이 끝나도 자동 결제로 이어지므로 알릴 게 없다.
  const trials = await db.tenantModule.findMany({
    where: { status: "ACTIVE", trialEndsAt: { not: null } },
    include: {
      module: { select: { name: true } },
      tenant: {
        select: {
          id: true,
          deleteRequestedAt: true,
          billing: { select: { billingKey: true } },
        },
      },
    },
  });
  const byTenant = new Map<string, { ending: string[]; expired: string[] }>();
  for (const t of trials) {
    if (t.tenant.billing?.billingKey) continue; // 카드 있음 → 안내 불필요
    if (t.tenant.deleteRequestedAt) continue; // 떠나는 단지에 카드 등록을 권하지 않는다
    const left = daysBetween(now, t.trialEndsAt!);
    const bucket =
      left === 7 ? "ending" : left === 0 ? "expired" : null;
    if (!bucket) continue;
    const entry = byTenant.get(t.tenant.id) ?? { ending: [], expired: [] };
    entry[bucket].push(t.module.name);
    byTenant.set(t.tenant.id, entry);
  }
  for (const [tenantId, { ending, expired }] of byTenant) {
    const to = await director(tenantId);
    if (!to) continue;
    if (expired.length)
      await trySend(() => sendTrialExpired(to.email, to.name, expired.join(", ")));
    if (ending.length)
      await trySend(() => sendTrialEndingSoon(to.email, to.name, ending.join(", "), 7));
    result.mails++;
  }

  return NextResponse.json(result);
}

export { run as GET, run as POST };

async function director(tenantId: string) {
  return (
    (await db.user.findFirst({
      where: { tenantId, role: "DIRECTOR" },
      select: { email: true, name: true },
    })) ??
    (await db.user.findFirst({
      where: { tenantId },
      select: { email: true, name: true },
    }))
  );
}
