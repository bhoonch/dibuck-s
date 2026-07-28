import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getModulesForTenant } from "@/lib/modules";
import { getModuleIcon } from "@/lib/module-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubscribeButton } from "./subscribe-button";

/* 모듈 선택만 여기서. 카드·청구·결제 내역은 설정 > 결제(/settings/billing) */
export default async function SubscriptionsPage() {
  const session = await requireSession();
  const modules = await getModulesForTenant(session.tenantId!);
  const subscribed = modules.filter((m) => m.subscribed);
  const trialing = subscribed.filter((m) => m.trialEndsAt);
  // 체험 중인 모듈은 요금이 발생하지 않는다
  const monthlyTotal = subscribed.reduce(
    (sum, m) => (m.trialEndsAt ? sum : sum + m.price),
    0,
  );
  const isDirector = session.role === "DIRECTOR";
  const now = new Date();
  const dday = (d: Date) =>
    Math.ceil((d.getTime() - now.getTime()) / 86400000);

  return (
    <div className="space-y-6">
      <Card className="flex-row items-baseline gap-3 p-4">
        <span className="text-muted-foreground">이번 달 구독료</span>
        <span className="font-mono text-2xl font-semibold tracking-tight">
          {monthlyTotal.toLocaleString()}원
        </span>
        <span className="text-sm text-muted-foreground">
          / 모듈 {subscribed.length}개 사용 중
          {trialing.length > 0 && ` (무료 체험 ${trialing.length}개 제외)`}
        </span>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const Icon = getModuleIcon(m.icon);
          return (
            <div
              key={m.id}
              className={`flex flex-col rounded-lg border p-4 ${
                m.subscribed ? "bg-card" : "bg-background"
              }`}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  className={`flex size-9 items-center justify-center rounded-lg ${
                    m.subscribed
                      ? "bg-blue-50 text-blue-700"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                    m.trialExpired
                      ? "bg-red-50 text-red-700"
                      : m.trialEndsAt
                        ? "bg-amber-50 text-amber-700"
                        : m.subscribed
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {m.trialExpired
                    ? "체험 종료"
                    : m.trialEndsAt
                      ? `무료 체험 D-${dday(m.trialEndsAt)}`
                      : m.retired
                        ? "판매 중단"
                        : m.subscribed
                          ? "사용 중"
                          : "미구독"}
                </span>
              </div>
              <p
                className={`text-base font-semibold ${
                  m.subscribed ? "" : "text-gray-500"
                }`}
              >
                {m.name}
              </p>
              <p className="mt-1 flex-1 text-xs text-gray-500">
                {m.description}
                {/* 판매 중단 = 신규 구독만 막힌 상태. 쓰던 단지는 계속 쓰고 해지도 된다 */}
                {m.retired && (
                  <span className="mt-1 block text-gray-400">
                    신규 판매가 중단된 모듈입니다. 지금 구독은 그대로 유지되지만,
                    해지하면 다시 구독할 수 없습니다.
                  </span>
                )}
              </p>
              <div className="mt-3 flex items-center border-t border-gray-100 pt-3">
                <span className="font-mono text-sm font-semibold">
                  {m.price.toLocaleString()}원
                  <span className="ml-0.5 font-sans text-xs font-normal text-gray-500">
                    /월
                  </span>
                </span>
                {m.trialExpired ? (
                  // 체험이 끝났는데 카드가 없다 — 카드를 넣으면 결제로 이어지며 바로 풀린다
                  <Button asChild variant="outline" className="ml-auto">
                    <Link href="/settings/billing">카드 등록</Link>
                  </Button>
                ) : (
                  isDirector && (
                    <span className="ml-auto">
                      <SubscribeButton
                        moduleId={m.id}
                        moduleName={m.name}
                        price={m.price}
                        subscribed={m.subscribed}
                        trialEligible={!m.everSubscribed && m.trialDays > 0}
                        trialDays={m.trialDays}
                      />
                    </span>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!isDirector && (
        <p className="text-sm text-muted-foreground">
          구독 변경은 마스터만 할 수 있습니다.
        </p>
      )}
    </div>
  );
}
