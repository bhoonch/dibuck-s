import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminActions, type AdminAction } from "@/lib/admin-log";
import { PageTitle, Pill, tableHead, tableRow } from "../ui";
import { ymdhmKst } from "@/lib/utils";

const COLS = "150px 130px 160px 1fr 110px";

/** 되돌릴 수 없거나 민감한 것은 눈에 띄게 */
function tone(a: string) {
  if (a === "tenant_status" || a === "password_reset") return "danger" as const;
  if (a.startsWith("impersonate")) return "warn" as const;
  return "info" as const;
}

export default async function AdminLogsPage() {
  await requireAdmin();
  const logs = await db.adminLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // 단지명은 기록 시점 값이 없을 수 있다(구독 변경 등) — 지금 이름으로 채워 보여준다.
  // 이미 삭제된 단지는 이름이 안 나오지만 tenantId는 로그에 남아 있다.
  const names = new Map(
    (
      await db.tenant.findMany({
        where: { id: { in: logs.map((l) => l.tenantId).filter(Boolean) as string[] } },
        select: { id: true, name: true },
      })
    ).map((t) => [t.id, t.name]),
  );

  return (
    <>
      <PageTitle
        title="작업 이력"
        description="운영자가 가입 단지에 한 작업 기록입니다. 최근 200건."
      />

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className={tableHead} style={{ gridTemplateColumns: COLS }}>
          <span>시각</span>
          <span>작업</span>
          <span>단지</span>
          <span>내용</span>
          <span>운영자</span>
        </div>
        {logs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            아직 기록된 작업이 없습니다.
          </p>
        ) : (
          logs.map((l) => {
            const name = l.tenantName ?? (l.tenantId ? names.get(l.tenantId) : null);
            return (
              <div key={l.id} className={tableRow} style={{ gridTemplateColumns: COLS }}>
                <span className="font-mono text-xs text-gray-500">
                  {ymdhmKst(l.createdAt)}
                </span>
                <span>
                  <Pill tone={tone(l.action)}>
                    {adminActions[l.action as AdminAction] ?? l.action}
                  </Pill>
                </span>
                <span className="truncate text-sm">
                  {l.tenantId ? (
                    <Link
                      href={`/admin/tenants/${l.tenantId}`}
                      className="text-blue-700 hover:underline"
                    >
                      {name ?? "삭제된 단지"}
                    </Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </span>
                <span className="truncate text-sm text-gray-600">
                  {l.detail ?? ""}
                </span>
                <span className="truncate text-sm text-gray-600">{l.adminName}</span>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
