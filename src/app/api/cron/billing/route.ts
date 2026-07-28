import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { RENEWAL_NOTICE_DAYS, daysBetween, dunningAction } from "@/lib/billing";
import { chargeTenant, suspendTenant } from "@/lib/billing-run";
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
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const result = { charged: 0, failed: 0, suspended: 0, mails: 0, purged: 0 };

  // ── 0. 탈퇴 유예가 끝난 단지 삭제 ──────────────────────────
  // 청구보다 먼저 — 지워질 단지에 결제를 걸지 않는다
  result.purged = await purgeExpiredTenants(now);

  // ── 1. 청구·재시도·정지 ────────────────────────────────────
  const billings = await db.billing.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] }, billingKey: { not: null } },
  });
  for (const b of billings) {
    const action = dunningAction(b, now);
    if (action === "none") continue;
    if (action === "suspend") {
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
    if (b.status !== "ACTIVE" || !b.nextBillingAt || b.cancelRequestedAt) continue;
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
      tenant: { select: { id: true, billing: { select: { billingKey: true } } } },
    },
  });
  const byTenant = new Map<string, { ending: string[]; expired: string[] }>();
  for (const t of trials) {
    if (t.tenant.billing?.billingKey) continue; // 카드 있음 → 안내 불필요
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
