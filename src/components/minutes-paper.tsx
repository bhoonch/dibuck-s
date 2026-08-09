import type { Attendee, MinutesAgenda } from "@/lib/minutes";
import { ymdhmKst } from "@/lib/utils";

/** 서명 진행 스텝 — 참석자 배열과 order(1부터)로 짝짓는다 */
export type MinutesSignStep = {
  order: number;
  status: string; // "pending" | "approved" | ...
  actedAt: Date | null;
  name: string;
};

const line = "border border-[var(--gian-doc-line)]";
const th = `${line} bg-[var(--gian-paper)] px-[2mm] py-[1.2mm] text-center text-[10pt] font-bold whitespace-nowrap`;
const td = `${line} px-[2.5mm] py-[1.2mm] text-[10.5pt]`;
const th2 = `${line} bg-[var(--gian-paper)] px-[2mm] py-[1mm] text-center text-[8.5pt] font-bold whitespace-nowrap`;
const td2 = `${line} px-[2.5mm] py-[1mm] text-[8.5pt]`;

/**
 * 회의록 A4 렌더러 — 책상 증빙 문서라 기안서 축(본문 11.5pt), gian-paper 괘선 문법.
 * 정보 표 → 안건별(제목·논의 요지·의결 결과) → 참석자 서명 표 순서.
 * 서명 표는 steps로 채운다: approved 행은 "전자서명 YYYY-MM-DD HH:mm",
 * 나머지는 빈칸(자필란) — Task 6 전에는 steps가 항상 빈 배열이라 전부 자필란이다.
 */
export function MinutesPaper({
  docNo,
  meetingNo,
  meetingAt,
  place,
  attendees,
  agendas,
  steps = [],
  id = "a4-sheet",
}: {
  docNo: string;
  meetingNo: number;
  /** "YYYY년 M월 D일 HH:mm" — 표시용으로 이미 포맷된 값 (convocation-paper와 동일 계약) */
  meetingAt: string;
  place: string;
  attendees: Attendee[];
  agendas: MinutesAgenda[];
  steps?: MinutesSignStep[];
  id?: string;
}) {
  const present = attendees.filter((a) => a.present);

  return (
    <article
      id={id}
      className="flex w-full max-w-[210mm] shrink-0 flex-col bg-[var(--gian-card)] px-[16mm] pt-[18mm] pb-[12mm] text-[11.5pt] leading-[1.5] text-[var(--gian-ink)] shadow-[var(--gian-shadow)] lg:min-h-[297mm] lg:w-[210mm] [border:1.5px_solid_var(--gian-doc-line)] print:min-h-0 print:border-0 print:p-0 print:shadow-none print:[zoom:var(--print-fit,1)]"
    >
      <h2 className="mb-1.5 text-center text-[17pt] font-extrabold tracking-[.2em] indent-[.2em] text-balance">
        제{meetingNo}차 입주자대표회의 회의록
      </h2>
      <div className="mx-auto mb-[5mm] h-[2.5px] w-[120px] bg-[var(--gian-ink)]" />

      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th className={`${th} w-[22mm]`}>문서번호</th>
            <td className={td}>{docNo}</td>
            <th className={`${th} w-[16mm]`}>회차</th>
            <td className={td}>제{meetingNo}차</td>
          </tr>
          <tr>
            <th className={th}>일　　시</th>
            <td className={td}>{meetingAt}</td>
            <th className={th}>장　　소</th>
            <td className={td}>{place || "미정"}</td>
          </tr>
          <tr>
            <th className={th}>참　　석</th>
            <td className={td} colSpan={3}>
              재적 {attendees.length}명 중 {present.length}명
            </td>
          </tr>
        </tbody>
      </table>

      <section className="mt-[6mm] space-y-[5mm]">
        {agendas.map((a) => (
          <div key={a.order} className="break-inside-avoid">
            <p className="mb-1 font-extrabold">
              {a.order}. {a.title}
            </p>
            <div className="pl-4">
              {a.discussion.length > 0 ? (
                a.discussion.map((l, j) => (
                  <p key={j} className="-indent-[1.2em] pl-[1.2em]">
                    ㆍ {l}
                  </p>
                ))
              ) : (
                <p className="text-[var(--gian-ink-soft)]">논의 요지 없음</p>
              )}
              {a.decision !== "없음" && (
                <p className="mt-1 font-bold">
                  {a.decision}
                  {(a.votesFor !== null || a.votesAgainst !== null) &&
                    ` (찬성 ${a.votesFor ?? 0}, 반대 ${a.votesAgainst ?? 0})`}
                </p>
              )}
            </div>
          </div>
        ))}
        {agendas.length === 0 && (
          <p className="text-[var(--gian-ink-soft)]">등록된 안건이 없습니다.</p>
        )}
      </section>

      <div className="flex-1" />

      <section className="mt-[6mm] break-inside-avoid">
        <h3 className="mb-[1.5mm] text-[12pt] font-extrabold">
          참석자 서명{" "}
          <span className="font-normal">(총 {present.length}명)</span>
        </h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-[34mm]`}>직함</th>
              <th className={`${th} w-[26mm]`}>성명</th>
              <th className={th}>서명</th>
            </tr>
          </thead>
          <tbody>
            {present.map((a, i) => {
              const step = steps.find((s) => s.order === i + 1);
              const signed = step?.status === "approved" && step.actedAt;
              return (
                <tr key={i} className="break-inside-avoid">
                  <td className={td}>{a.label}</td>
                  <td className={td}>{a.name}</td>
                  <td
                    className={`${line} h-[9mm] px-[2.5mm] text-center text-[9pt] text-[var(--gian-ink-soft)]`}
                  >
                    {signed ? `전자서명 ${ymdhmKst(step!.actedAt!)}` : ""}
                  </td>
                </tr>
              );
            })}
            {present.length === 0 && (
              <tr>
                <td className={`${td} text-center`} colSpan={3}>
                  참석자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* 전자서명 증적 표 — 자필란만 있으면(전원 자필) 무의미하므로 1건 이상일 때만 */}
      {steps.some((s) => s.status === "approved") && (
        <section className="mt-[4mm] break-inside-avoid text-[var(--gian-ink-soft)]">
          <p className="mb-[1mm] text-[9pt] font-bold">전자서명 기록</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th2} w-[26mm]`}>성명</th>
                <th className={`${th2} w-[34mm]`}>일시</th>
                <th className={th2}>방식</th>
              </tr>
            </thead>
            <tbody>
              {steps
                .filter((s) => s.status === "approved")
                .map((s) => (
                  <tr key={s.order}>
                    <td className={td2}>{s.name}</td>
                    <td className={td2}>{s.actedAt ? ymdhmKst(s.actedAt) : ""}</td>
                    <td className={td2}>전자(링크)</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}
