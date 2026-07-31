import Link from "next/link";
import { AlertTriangle, CreditCard } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { GRACE_DAYS, billableItems, daysBetween, totalAmount } from "@/lib/billing";
import { tossEnabled } from "@/lib/toss";
import { ymdKst } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { RegisterCardButton } from "./register-card-button";
import { RegistrationToast } from "./registration-toast";
import { CancelButton, PayNowButton } from "./billing-actions";

const won = (n: number) => `${n.toLocaleString()}원`;
const date = (d: Date) => ymdKst(d).replace(/-/g, ".");

export default async function BillingPage() {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  const isDirector = session.role === "DIRECTOR";

  const [billing, subs, payments, me] = await Promise.all([
    db.billing.findUnique({ where: { tenantId } }),
    db.tenantModule.findMany({
      where: { tenantId },
      include: { module: { select: { name: true, price: true } } },
    }),
    db.payment.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true },
    }),
  ]);

  const now = new Date();
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
  const trialing = subs.filter(
    (s) => s.status === "ACTIVE" && s.trialEndsAt && s.trialEndsAt > now,
  );
  const hasCard = !!billing?.billingKey;

  if (!tossEnabled())
    return (
      <Card className="p-6">
        <p className="text-lg font-semibold">결제 준비 중입니다</p>
        <p className="mt-2 text-sm text-muted-foreground">
          카드 자동 결제는 아직 열리지 않았습니다. 유료 전환이 필요하시면{" "}
          <Link href="/support?category=구독" className="font-semibold text-primary underline">
            고객 문의
          </Link>
          로 알려 주세요.
        </p>
      </Card>
    );

  return (
    <div className="space-y-6">
      {/* 카드 등록 결제창에서 돌아온 결과 안내 — 콜백이 쿼리로 실어 보낸다 */}
      <RegistrationToast />
      {/* ── 상태 배너 ────────────────────────────────── */}
      {billing?.status === "SUSPENDED" && (
        <Card className="gap-2 border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-red-700">
            <AlertTriangle className="size-4" />
            결제가 되지 않아 서비스가 일시 정지되었습니다
          </p>
          <p className="text-sm text-red-700/80">
            데이터는 그대로 보관되어 있습니다. 카드를 확인하고 결제하시면 즉시 다시
            사용하실 수 있습니다.
          </p>
          {isDirector && <PayNowButton />}
        </Card>
      )}
      {billing?.status === "PAST_DUE" && billing.pastDueSince && (
        <Card className="gap-2 border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-800">
            <AlertTriangle className="size-4" />
            결제에 실패했습니다 — {Math.max(0, GRACE_DAYS - daysBetween(billing.pastDueSince, now))}일 뒤 정지됩니다
          </p>
          <p className="text-sm text-amber-800/80">
            매일 자동으로 다시 시도합니다. 카드 한도·유효기간을 확인하시거나 다른 카드로
            바꿔 주세요.
          </p>
          {isDirector && <PayNowButton />}
        </Card>
      )}
      {billing?.cancelRequestedAt && billing.nextBillingAt && (
        <Card className="gap-1 border-gray-300 bg-muted/50 p-4">
          <p className="font-semibold">
            {date(billing.nextBillingAt)}에 모든 구독이 해지될 예정입니다
          </p>
          <p className="text-sm text-muted-foreground">
            그때까지는 지금처럼 사용하실 수 있습니다.
          </p>
        </Card>
      )}

      {/* ── 이번 청구 ────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-muted-foreground">다음 결제 예정 금액</span>
          <span className="font-mono text-2xl font-semibold tracking-tight">
            {won(amount)}
          </span>
          {billing?.nextBillingAt && !billing.cancelRequestedAt && (
            <span className="text-sm text-muted-foreground">
              / {date(billing.nextBillingAt)} 결제
            </span>
          )}
        </div>
        {items.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
            {items.map((i) => (
              <li key={i.moduleId} className="flex justify-between">
                <span className="text-muted-foreground">{i.name}</span>
                <span className="font-mono">{won(i.price)}</span>
              </li>
            ))}
          </ul>
        )}
        {trialing.length > 0 && (
          <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
            무료 체험 중인 {trialing.length}개 모듈은 이번 청구에서 빠집니다 — 체험이
            끝나는 날부터 요금이 발생합니다.
          </p>
        )}
      </Card>

      {/* ── 결제 수단 ────────────────────────────────── */}
      <Card className="gap-3 p-4">
        <p className="text-lg font-semibold">결제 수단</p>
        {hasCard ? (
          <>
            <p className="flex items-center gap-2 font-mono text-sm">
              <CreditCard className="size-4 text-muted-foreground" />
              {billing.cardCompany} {billing.cardNumber}
            </p>
            {isDirector && (
              <div className="flex flex-wrap items-center gap-2">
                <RegisterCardButton
                  clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!}
                  customerName={me?.name ?? ""}
                  customerEmail={me?.email ?? ""}
                  label="카드 변경하기"
                />
                <CancelButton requested={!!billing.cancelRequestedAt} />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              등록된 카드가 없습니다. 카드를 등록하시면 무료 체험이 끝나는 날부터 자동으로
              결제되어 모듈이 잠기지 않습니다.
            </p>
            {isDirector && (
              <RegisterCardButton
                clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!}
                customerName={me?.name ?? ""}
                customerEmail={me?.email ?? ""}
              />
            )}
          </>
        )}
        {!isDirector && (
          <p className="text-sm text-muted-foreground">
            결제 수단 변경은 마스터만 할 수 있습니다.
          </p>
        )}
      </Card>

      {/* ── 결제 내역 ────────────────────────────────── */}
      <Card className="gap-3 p-4">
        <p className="text-lg font-semibold">결제 내역</p>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 결제 내역이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">결제일</th>
                <th className="py-2 text-left font-medium">내역</th>
                <th className="py-2 text-right font-medium">금액</th>
                <th className="py-2 text-right font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{date(p.createdAt)}</td>
                  <td className="py-2 text-muted-foreground">
                    {(p.items as { name: string }[]).map((i) => i.name).join(", ")}
                  </td>
                  <td className="py-2 text-right font-mono">{won(p.amount)}</td>
                  <td className="py-2 text-right">
                    {p.status === "PAID" ? (
                      p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noopener"
                          className="text-primary underline"
                        >
                          영수증
                        </a>
                      ) : (
                        <span className="text-green-700">완료</span>
                      )
                    ) : (
                      <span className="text-red-600" title={p.failReason ?? ""}>
                        실패
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
