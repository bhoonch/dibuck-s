import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { saveModulePrice } from "../actions";
import { PageTitle, Pill, btnPrimary, btnRow, tableHead, tableRow } from "../ui";
import { PriceInput } from "./price-input";

const COLS = "60px 1fr 140px 110px 90px 90px 110px";

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
          <span>체험 기간</span>
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
            <label className="flex items-center gap-1">
              <input
                name="trialDays"
                type="number"
                min={0}
                max={365}
                defaultValue={m.trialDays}
                aria-label="체험 기간(일)"
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-right font-mono text-sm outline-none transition-colors focus-visible:border-ring"
              />
              <span className="shrink-0 text-xs text-gray-500">일</span>
            </label>
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
                저장
              </button>
            </span>
          </form>
        ))}
      </section>

      <p className="mt-3 text-xs text-gray-500">
        체험 기간은 새로 구독하는 모든 단지에 동일하게 적용됩니다(0 = 체험 없이
        바로 유료). 이미 진행 중인 체험에는 영향이 없고, 특정 단지만 예외로
        주려면 단지 상세에서 개별 지정하세요. 가격 변경도 저장 즉시 반영되며
        기존 구독 상태는 바뀌지 않습니다.
      </p>
    </>
  );
}
