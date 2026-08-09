import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  GUIDE_COMMON,
  GUIDE_START,
  MODULE_GUIDES,
  type GuideSection,
} from "@/lib/guide";
import { PageHeader } from "@/components/ui/page-header";
import { GuideBrowser } from "./guide-browser";

/**
 * 사용법 — 구독 여부와 무관하게 전 모듈의 쓰는 순서를 한 곳에서 보여 준다.
 * 미구독 모듈 항목도 보인다: 뭘 해주는 모듈인지 아는 것이 구독 판단의 재료다.
 * (항목 안 [바로 가기]는 미구독이면 기존 규칙대로 구독 화면으로 안내된다)
 */
export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  await requireTenantSession();
  const { m } = await searchParams;

  // 레지스트리의 isActive 모듈 중 guide 데이터가 있는 것만 — 데이터가 없는
  // 모듈은 목록에서 자동으로 빠져 빈 항목이 노출될 일이 없다
  const modules = await db.module.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const sections: GuideSection[] = [
    GUIDE_START,
    ...modules
      .filter((m) => MODULE_GUIDES[m.id])
      .map((m) => ({ id: m.id, ...MODULE_GUIDES[m.id] })),
    GUIDE_COMMON,
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="사용법"
        description="어떤 업무를 어느 모듈로, 어떤 순서로 하는지 모았습니다. 왼쪽에서 항목을 고르면 그 순서만 보여 드립니다."
      />
      <GuideBrowser
        sections={sections}
        initialId={sections.some((s) => s.id === m) ? m! : sections[0].id}
      />
    </div>
  );
}
