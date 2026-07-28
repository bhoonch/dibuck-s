import { db } from "@/lib/db";
import { answerInquiry, setInquiryStatus } from "../actions";
import { PageTitle, Pill, btnRow, tableHead, tableRow } from "../ui";
import { ymd } from "../metrics";
import { requireAdmin } from "@/lib/auth";

const COLS = "160px 1fr 110px 100px 100px";

export default async function AdminSupportPage() {
  await requireAdmin();
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
              // 답변 대기는 펼친 채로 연다 — 열자마자 바로 답을 쓸 수 있게
              <details
                key={q.id}
                open={!answered && !isTrial}
                className="border-b last:border-0"
              >
                <summary className={`${tableRow} cursor-pointer border-0 hover:bg-gray-50`} style={{ gridTemplateColumns: COLS }}>
                  <span className="truncate text-sm font-medium">
                    {q.tenant?.name ?? q.title}
                  </span>
                  <span className="truncate text-sm text-gray-600">
                    {isTrial ? "무료 체험 신청" : q.title}
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
                </summary>

                <div className="grid max-w-3xl gap-3 bg-gray-50 px-4 py-4">
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                      문의 내용
                    </p>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap">
                      {q.title}
                    </p>
                    {q.fromPath && (
                      <p className="mt-1.5 font-mono text-xs text-gray-500">
                        문의한 화면: {q.fromPath}
                      </p>
                    )}
                  </div>

                  {isTrial ? (
                    <p className="text-sm text-gray-500">
                      가입 전 접수분이라 알림을 보낼 대상이 없습니다.
                    </p>
                  ) : (
                    <form action={answerInquiry} className="grid gap-2">
                      <input type="hidden" name="id" value={q.id} />
                      <label
                        htmlFor={`answer-${q.id}`}
                        className="text-xs font-semibold tracking-wider text-gray-500 uppercase"
                      >
                        답변
                      </label>
                      <textarea
                        id={`answer-${q.id}`}
                        name="answer"
                        rows={5}
                        maxLength={2000}
                        defaultValue={q.answer ?? ""}
                        placeholder="사용자가 문의 내역에서 펼쳐 읽습니다. 저장하면 알림이 갑니다."
                        className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-offset-1 focus:outline-2 focus:outline-primary"
                        required
                      />
                      <div className="flex items-center gap-2">
                        <button type="submit" className={btnRow}>
                          {answered ? "답변 수정" : "답변 등록"}
                        </button>
                        {q.answeredAt && (
                          <span className="font-mono text-xs text-gray-500">
                            {ymd(q.answeredAt)} 답변
                          </span>
                        )}
                      </div>
                    </form>
                  )}

                  {answered && (
                    <form action={setInquiryStatus}>
                      <input type="hidden" name="id" value={q.id} />
                      <input type="hidden" name="status" value="open" />
                      <button type="submit" className={btnRow}>
                        답변 대기로 되돌리기
                      </button>
                    </form>
                  )}
                </div>
              </details>
            );
          })
        )}
      </section>

      <p className="mt-3 text-xs text-gray-500">
        문의는 단지 화면의 &ldquo;고객 문의&rdquo;(/support)에서 접수됩니다. 전화 응대는
        하지 않습니다 — 여기서 답변을 저장하면 접수한 단지 직원에게 알림이 가고,
        사용자는 문의 내역에서 답변을 펼쳐 읽습니다.
      </p>
    </>
  );
}
