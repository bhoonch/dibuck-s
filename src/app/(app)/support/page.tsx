import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ymdKst } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InquiryForm } from "./inquiry-form";
import { InquiriesTable, type InquiryRow } from "./inquiries-table";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; from?: string }>;
}) {
  const session = await requireTenantSession();
  const { category, from } = await searchParams;
  const inquiries = await db.inquiry.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const rows: InquiryRow[] = inquiries.map((q) => ({
    id: q.id,
    category: q.category,
    title: q.title,
    userName: q.userName,
    createdAt: ymdKst(q.createdAt),
    status: q.status,
    answer: q.answer,
    answeredAt: q.answeredAt ? ymdKst(q.answeredAt) : null,
  }));

  return (
    <>
      <PageHeader
        title="고객 문의"
        description="남기신 문의와 운영팀 답변을 여기서 주고받습니다."
      />

      {/* 폼과 문의 내역이 좌우 끝을 공유한다 */}
      <Card className="mb-8 p-6">
        <InquiryForm defaultCategory={category} fromPath={from} />
      </Card>

      <h2 className="mb-3 text-lg font-semibold tracking-tight">문의 내역</h2>
      <InquiriesTable rows={rows} />
    </>
  );
}
