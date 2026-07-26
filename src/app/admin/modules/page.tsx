import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { saveModulePrice } from "../actions";
import { PageTitle, Pill, btnPrimary, btnRow, tableHead, tableRow } from "../ui";
import { PriceInput } from "./price-input";

const COLS = "60px 1fr 150px 110px 100px 110px";

export default async function AdminModulesPage() {
  const modules = await db.module.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } },
    },
  });

  return (
    <>
      <PageTitle title="모듈 관리 · 가격 설정">
        <Link href="/admin/modules/new" className={btnPrimary}>
          <Plus className="size-4" /> 새 모듈 등록
        </Link>
      </PageTitle>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className={tableHead} style={{ gridTemplateColumns: COLS }}>
          <span>코드</span>
          <span>모듈</span>
          <span>월 가격 (단지)</span>
          <span>구독 단지</span>
          <span>상태</span>
          <span />
        </div>
        {modules.map((m) => (
          <form
            key={m.id}
            action={saveModulePrice}
            className={tableRow}
            style={{ gridTemplateColumns: COLS }}
          >
            <input type="hidden" name="id" value={m.id} />
            <span className="font-mono text-xs text-gray-600">
              {String(m.sortOrder).padStart(2, "0")}
            </span>
            <Link href={`/admin/modules/${m.id}`} className="block min-w-0">
              <span className="block truncate text-sm font-medium hover:underline">
                {m.name}
              </span>
              <span className="block truncate text-xs text-gray-400">
                {m.description}
              </span>
            </Link>
            <PriceInput defaultValue={m.price} />
            <span className="font-mono text-sm text-gray-600">
              {m._count.subscriptions}
            </span>
            <span>
              {m.isActive ? (
                <Pill tone="success">판매중</Pill>
              ) : (
                <Pill tone="muted">비활성</Pill>
              )}
            </span>
            <span>
              <button type="submit" className={btnRow}>
                가격 저장
              </button>
            </span>
          </form>
        ))}
      </section>

      <p className="mt-3 text-xs text-gray-500">
        가격 변경은 저장 즉시 반영되며, 이미 구독 중인 단지의 구독 상태에는
        영향을 주지 않습니다. 모듈명·아이콘·라우트 등 나머지 항목은 모듈명을
        눌러 수정합니다.
      </p>
    </>
  );
}
