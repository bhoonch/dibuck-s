import { db } from "@/lib/db";
import { setInquiryStatus } from "../actions";
import { PageTitle, Pill, btnRow, tableHead, tableRow } from "../ui";
import { ymd } from "../metrics";

const COLS = "160px 1fr 110px 100px 100px 110px";

export default async function AdminSupportPage() {
  const inquiries = await db.inquiry.findMany({
    // "open" > "answered" — 답변 대기가 위로
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: { tenant: { select: { name: true } } },
  });
  const open = inquiries.filter((q) => q.status === "open").length;

  return (
    <>
      <PageTitle
        title="고객 문의"
        description={
          open > 0
            ? `답변 대기 ${open}건입니다.`
            : "답변 대기 중인 문의가 없습니다."
        }
      />

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className={tableHead} style={{ gridTemplateColumns: COLS }}>
          <span>단지</span>
          <span>문의 내용</span>
          <span>유형</span>
          <span>상태</span>
          <span>접수</span>
          <span />
        </div>
        {inquiries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            접수된 문의가 없습니다.
          </p>
        ) : (
          inquiries.map((q) => {
            const answered = q.status === "answered";
            const isTrial = !q.tenant;
            return (
              <div
                key={q.id}
                className={tableRow}
                style={{ gridTemplateColumns: COLS }}
              >
                <span className="truncate text-sm font-medium">
                  {q.tenant?.name ?? q.title}
                </span>
                <span className="truncate text-sm text-gray-600">
                  {isTrial ? `무료 체험 신청 · ${q.contact ?? "연락처 없음"}` : q.title}
                </span>
                <span>
                  {isTrial ? (
                    <Pill tone="info">체험 신청</Pill>
                  ) : (
                    <span className="text-xs text-gray-500">{q.category}</span>
                  )}
                </span>
                <span>
                  {answered ? (
                    <Pill tone="success">답변 완료</Pill>
                  ) : (
                    <Pill tone="danger">답변 대기</Pill>
                  )}
                </span>
                <span className="font-mono text-xs text-gray-500">
                  {ymd(q.createdAt)}
                </span>
                <span>
                  <form action={setInquiryStatus}>
                    <input type="hidden" name="id" value={q.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={answered ? "open" : "answered"}
                    />
                    <button type="submit" className={btnRow}>
                      {answered ? "재오픈" : "답변 완료"}
                    </button>
                  </form>
                </span>
              </div>
            );
          })
        )}
      </section>

      <p className="mt-3 text-xs text-gray-500">
        단지 화면의 문의 등록 UI는 아직 없습니다 — 지금은 접수된 문의의 처리
        상태만 관리합니다.
      </p>
    </>
  );
}
