import type { GianDraft } from "@/lib/gian/claude";
import type { DocType } from "@/lib/gian/rules";
import { ymdKst } from "@/lib/utils";

export type PaperStep = {
  order: number;
  label: string; // 직책·역할 (담당 이름 또는 "입주자대표회장")
  status?: string; // waiting | pending | approved | rejected
  name?: string;
  actedAt?: Date | null;
};

/** 공문 마무리 문구 — 지출을 수반하면 "품의", 아니면 "시행" */
const footText = (docType?: DocType) =>
  docType === "gian"
    ? "위와 같이 검토하였으니 시행하고자 재가하여 주시기 바랍니다."
    : "위와 같이 검토하여 품의하오니 재가하여 주시기 바랍니다.";

/** 공문서 날짜 표기 "2026. 07. 28." */
const docDate = (d: Date) => `${ymdKst(d).replace(/-/g, ". ")}.`;

/**
 * 기안·품의 문서 렌더러 — 올림 목업(ollim-mvp-mockup.html)의 `.doc` 양식.
 * 모듈 문서 화면과 외부 서명 페이지가 공유한다.
 *
 * 구성: 문서번호·시행일자·수신 / 결재란 → 중앙 대제목 + 밑줄 → 1. 관련 근거
 * → LLM이 만든 절들 → 붙임·끝. → 마무리 문구 + 명의
 * 결재란은 스냅샷(steps) 기준: 승인된 칸에 서명(이름+일자)이 찍힌다.
 */
export function GianPaper({
  draft,
  steps,
  docNo,
  office,
  docType,
  createdAt,
  id = "a4-sheet",
}: {
  draft: GianDraft;
  steps: PaperStep[];
  docNo?: string | null;
  office?: string; // "행복아파트 관리사무소"
  docType?: DocType;
  createdAt?: Date;
  id?: string;
}) {
  return (
    <article
      id={id}
      className="w-full max-w-[210mm] shrink-0 bg-[var(--gian-card)] px-[38px] pt-[34px] pb-[40px] text-[14.5px] leading-[1.6] text-[var(--gian-ink)] shadow-[var(--gian-shadow)] lg:w-[210mm] [border:1.5px_solid_var(--gian-doc-line)]"
    >
      {/* 문서 머리 — 좌: 문서번호·시행일자·수신 / 우: 결재란 */}
      <div className="flex items-start justify-between gap-4">
        <div className="text-[12.5px] leading-[1.9] text-[var(--gian-ink-soft)]">
          문서번호 : <span className="font-mono">{docNo ?? "(채번 전)"}</span>
          <br />
          시행일자 :{" "}
          <span className="font-mono">{docDate(createdAt ?? new Date())}</span>
          <br />
          수&nbsp;&nbsp;&nbsp;&nbsp;신 : 내부결재
        </div>

        <table className="border-collapse">
          <caption className="[caption-side:left] pr-1.5 text-[11px] tracking-[.3em] text-[var(--gian-ink-soft)] [writing-mode:vertical-rl]">
            결재
          </caption>
          <tbody>
            <tr>
              {steps.map((s) => (
                <th
                  key={s.order}
                  className="min-w-[60px] border border-[var(--gian-doc-line)] bg-[var(--gian-paper)] px-1.5 py-[3px] text-center text-[11.5px] font-semibold"
                >
                  {s.label}
                </th>
              ))}
            </tr>
            <tr>
              {steps.map((s) => (
                <td
                  key={s.order}
                  className="h-[60px] border border-[var(--gian-doc-line)] text-center align-bottom"
                >
                  {s.status === "approved" ? (
                    <span className="block pb-[3px] text-[10.5px] text-[var(--gian-ink-soft)]">
                      {s.name}
                      <br />
                      <span className="font-mono">
                        {s.actedAt ? ymdKst(s.actedAt).slice(2) : ""}
                      </span>
                    </span>
                  ) : s.status === "rejected" ? (
                    <span className="block pb-[3px] text-[10.5px] font-semibold text-[var(--gian-stamp)]">
                      반려
                    </span>
                  ) : (
                    <span className="mx-[5px] block border-t border-dashed border-[var(--gian-line-strong)] pt-0.5 text-[9.5px] text-[#9aa3ad]">
                      .&nbsp;&nbsp;.&nbsp;&nbsp;.
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 대제목 + 밑줄 */}
      <h2 className="mt-[30px] mb-1.5 text-center text-[21px] font-extrabold tracking-[.02em] text-balance">
        {draft.title}
      </h2>
      <div className="mx-auto mb-[28px] h-[2.5px] w-[120px] bg-[var(--gian-ink)]" />

      <section className="mb-5">
        <h3 className="mb-1.5 text-[15px] font-extrabold">1. 관련 근거</h3>
        <ul className="list-disc pl-[18px]">
          {draft.legalBasis.map((b, i) => (
            <li key={i} className="mb-[3px]">
              {b}
            </li>
          ))}
        </ul>
      </section>

      {draft.sections.map((sec, i) => (
        <section key={i} className="mb-5">
          <h3 className="mb-1.5 text-[15px] font-extrabold">
            {i + 2}. {sec.heading}
          </h3>
          {sec.lines.map((line, j) => (
            <p
              key={j}
              className={/^\d+\)/.test(line.trim()) ? "pl-8" : "pl-4"}
            >
              {/* 개조식 "가.·나." 표기는 LLM 출력 그대로 살린다 */}
              {line}
            </p>
          ))}
        </section>
      ))}

      <div className="mt-6">
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

      <div className="mt-[30px] text-center text-[13px] text-[var(--gian-ink-soft)]">
        {footText(docType)}
        <div className="mt-1 text-[16px] font-extrabold tracking-[.4em] text-[var(--gian-ink)]">
          {office ?? ""}
        </div>
      </div>
    </article>
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
