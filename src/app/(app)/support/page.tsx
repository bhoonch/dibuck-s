import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { InquiryForm } from "./inquiry-form";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await requireSession();
  const { category } = await searchParams;
  const inquiries = await db.inquiry.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">고객 문의</h2>
        <p className="mt-1 text-sm text-gray-500">
          구독·계정·기능 관련 문의를 남기면 운영팀이 확인 후 연락드립니다.
        </p>
      </div>

      <Card className="max-w-2xl p-6">
        <InquiryForm defaultCategory={category} />
      </Card>

      {inquiries.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-semibold tracking-tight">문의 내역</h3>
          <div className="divide-y divide-gray-100 rounded-lg border bg-card">
            {inquiries.map((q) => (
              <div key={q.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {q.category}
                </span>
                <span className="min-w-0 flex-1 text-sm text-gray-700">
                  {q.title}
                  <span className="mt-0.5 block font-mono text-xs text-gray-400">
                    {q.createdAt.toLocaleDateString("ko-KR")}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    q.status === "answered"
                      ? "bg-green-50 text-green-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {q.status === "answered" ? "답변 완료" : "답변 대기"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
