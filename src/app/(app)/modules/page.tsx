import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getModulesForTenant } from "@/lib/modules";
import { getModuleIcon } from "@/lib/module-icons";

export default async function ModuleLauncherPage() {
  const session = await requireSession();
  const modules = await getModulesForTenant(session.tenantId!);
  const subscribedCount = modules.filter((m) => m.subscribed).length;

  return (
    <>
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-tight">모듈 런처</h2>
        <p className="mt-1 text-sm text-gray-500">
          구독 중인 모듈 {subscribedCount}개 · 미구독{" "}
          {modules.length - subscribedCount}개. 모듈은 계속 추가됩니다.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((m) => {
          const Icon = getModuleIcon(m.icon);
          const href = m.subscribed ? m.route : "/settings/subscriptions";
          return (
            <Link
              key={m.id}
              href={href}
              className={`block rounded-lg border p-4 transition-all hover:border-gray-300 hover:shadow-sm ${
                m.subscribed ? "bg-card" : "bg-background"
              }`}
            >
              <span className="mb-3 flex items-center gap-2.5">
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
                    m.subscribed
                      ? "bg-green-50 text-green-700"
                      : m.trialExpired
                        ? "bg-red-50 text-red-700"
                        : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {m.subscribed ? "구독중" : m.trialExpired ? "체험 종료" : "잠금"}
                </span>
              </span>
              <span
                className={`block text-base font-semibold ${
                  m.subscribed ? "" : "text-gray-500"
                }`}
              >
                {m.name}
              </span>
              <span className="mt-1 block min-h-9 text-xs text-gray-500">
                {m.description}
              </span>
              <span className="mt-2 block border-t border-gray-100 pt-2 font-mono text-xs text-gray-400">
                월 {m.price.toLocaleString()}원 · 단지 단위
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
