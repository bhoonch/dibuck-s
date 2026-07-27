import type { GianDraft } from "@/lib/gian/claude";
import { ymdKst } from "@/lib/utils";

const KO = "가나다라마바사아자차카타파하";

export type PaperStep = {
  order: number;
  label: string; // 직책·역할 (담당 이름 또는 "입주자대표회장")
  status?: string; // waiting | pending | approved | rejected
  name?: string;
  actedAt?: Date | null;
};

/**
 * 기안·품의 A4 렌더러 — 모듈 문서 화면과 외부 서명 페이지가 공유한다.
 * 결재란은 스냅샷(steps) 기준: 승인된 칸에 서명(이름+일자)이 찍힌다.
 */
export function GianPaper({
  draft,
  steps,
  id = "a4-sheet",
}: {
  draft: GianDraft;
  steps: PaperStep[];
  id?: string;
}) {
  return (
    <div
      id={id}
      className="w-full max-w-[210mm] shrink-0 border bg-white p-[12mm] font-serif text-[15px] leading-relaxed text-black shadow-sm lg:w-[210mm]"
    >
      {/* 결재란 */}
      <table className="mb-6 ml-auto border-collapse text-center text-[13px]">
        <tbody>
          <tr>
            <td rowSpan={2} className="w-7 border border-black px-1 py-1 leading-4">
              결<br />재
            </td>
            {steps.map((s) => (
              <td key={s.order} className="w-20 border border-black px-2 py-1">
                {s.label}
              </td>
            ))}
          </tr>
          <tr>
            {steps.map((s) => (
              <td key={s.order} className="h-14 border border-black align-middle">
                {s.status === "approved" && (
                  <span className="text-[12px]">
                    {s.name}
                    <br />
                    {s.actedAt ? ymdKst(s.actedAt) : ""}
                  </span>
                )}
                {s.status === "rejected" && (
                  <span className="text-[12px] text-red-700">반려</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div className="space-y-4">
        <div>
          <p className="font-semibold">1. 관련근거</p>
          {draft.legalBasis.map((b, i) => (
            <p key={i} className="pl-4">
              {KO[i] ?? "•"}. {b}
            </p>
          ))}
        </div>
        <p className="font-semibold">2. 제&nbsp;&nbsp;목: {draft.title}</p>
        {draft.sections.map((sec, i) => (
          <div key={i}>
            <p className="font-semibold">
              {i + 3}. {sec.heading}
            </p>
            {sec.lines.map((line, j) => (
              <p
                key={j}
                className={/^\d+\)/.test(line.trim()) ? "pl-8" : "pl-4"}
              >
                {line}
              </p>
            ))}
          </div>
        ))}
        <div className="pt-4">
          {draft.attachments.map((a, i) => (
            <p key={i}>
              {i === 0 ? "붙  임: " : "       "}
              {draft.attachments.length > 1 ? `${i + 1}. ` : ""}
              {a}
              {i === draft.attachments.length - 1 ? ".  끝." : ""}
            </p>
          ))}
          {draft.attachments.length === 0 && <p>끝.</p>}
        </div>
      </div>
    </div>
  );
}

/** 인쇄 시 A4 시트만 보이게 — 문서 페이지들이 공유하는 스타일 */
export function PrintStyle({
  target = "a4-sheet",
  /** 용지 여백. 공고문처럼 자체 여백을 가진 문서는 "0"으로 넘긴다 */
  margin = "18mm 16mm",
}: {
  target?: string;
  margin?: string;
}) {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden; }
        #${target}, #${target} * { visibility: visible; }
        #${target} { position: absolute; inset: 0; width: 100%; margin: 0; border: 0; box-shadow: none; padding: 0; }
      }
      @page { size: A4; margin: ${margin}; }
    `}</style>
  );
}
