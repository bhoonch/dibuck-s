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

/** "가. 공 사 명: 지하주차장 …" → 라벨/값 분리 (개요 절을 표로 그리기 위한 판정) */
const LABELED = /^\s*[가-힣]\.\s*([^:：]{2,20})\s*[:：]\s*(.+)$/;

/** 결재선 미설정 문서도 결재란은 있어야 한다 — 공란 3칸(담당·검토·결재)이 기본 */
const EMPTY_STEPS: PaperStep[] = [
  { order: 1, label: "담당" },
  { order: 2, label: "검토" },
  { order: 3, label: "결재" },
];

/**
 * 기안·품의 문서 렌더러 — 올림 목업의 `.doc` 양식.
 * 모듈 문서 화면과 외부 서명 페이지가 공유한다.
 *
 * 인쇄 크기는 pt로 고정한다(화면 px가 아니라 종이 위 크기가 기준). 본문 11.5pt는
 * 공문서 관행(11~12pt)에 맞춘 값이고, 인쇄 여백은 페이지의 `@page`가 담당하므로
 * 화면용 안쪽 여백은 인쇄 때 제거한다(print:p-0).
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
  const boxes = steps.length > 0 ? steps : EMPTY_STEPS;

  return (
    <article
      id={id}
      className="w-full max-w-[210mm] shrink-0 bg-[var(--gian-card)] px-[16mm] py-[14mm] text-[11.5pt] leading-[1.6] whitespace-pre-wrap text-[var(--gian-ink)] shadow-[var(--gian-shadow)] lg:w-[210mm] [border:1.5px_solid_var(--gian-doc-line)] print:border-0 print:p-0 print:shadow-none"
    >
      {/* 문서 머리 — 좌: 문서번호·시행일자·수신 / 우: 결재란 */}
      <div className="flex items-start justify-between gap-4">
        <div className="text-[9.5pt] leading-[1.9] text-[var(--gian-ink-soft)]">
          {/* 채번이 "기안-2026-0001"이라 한글이 섞인다 — mono는 글리프가 없어 무효고 폰트만 튄다 */}
          문서번호 : {docNo ?? "(채번 전)"}
          <br />
          시행일자 :{" "}
          <span className="font-mono">{docDate(createdAt ?? new Date())}</span>
          <br />
          수　　신 : 내부결재
        </div>

        <table className="border-collapse">
          <caption className="pr-1.5 text-[8pt] tracking-[.3em] text-[var(--gian-ink-soft)] [caption-side:left] [writing-mode:vertical-rl]">
            결재
          </caption>
          <tbody>
            <tr>
              {boxes.map((s) => (
                <th
                  key={s.order}
                  className="min-w-[16mm] border border-[var(--gian-doc-line)] bg-[var(--gian-paper)] px-1.5 py-0.5 text-center text-[8.5pt] font-semibold"
                >
                  {s.label}
                </th>
              ))}
            </tr>
            <tr>
              {boxes.map((s) => (
                <td
                  key={s.order}
                  className="h-[16mm] border border-[var(--gian-doc-line)] text-center align-bottom"
                >
                  {s.status === "approved" ? (
                    <span className="block pb-0.5 text-[8pt] text-[var(--gian-ink-soft)]">
                      {s.name}
                      <br />
                      <span className="font-mono">
                        {s.actedAt ? ymdKst(s.actedAt).slice(2) : ""}
                      </span>
                    </span>
                  ) : s.status === "rejected" ? (
                    <span className="block pb-0.5 text-[8pt] font-semibold text-[var(--gian-stamp)]">
                      반려
                    </span>
                  ) : (
                    <span className="mx-1 block border-t border-dashed border-[var(--gian-line-strong)] pt-0.5 text-[7pt] text-[#9aa3ad]">
                      .　.　.
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 대제목 + 밑줄 */}
      <h2 className="mt-[12mm] mb-1.5 text-center text-[17pt] font-extrabold tracking-[.02em] text-balance">
        {draft.title}
      </h2>
      <div className="mx-auto mb-[10mm] h-[2.5px] w-[120px] bg-[var(--gian-ink)]" />

      <section className="mb-[6mm]">
        <h3 className="mb-1 text-[12pt] font-extrabold">1. 관련 근거</h3>
        <ul className="list-disc pl-[18px]">
          {draft.legalBasis.map((b, i) => (
            <li key={i} className="mb-0.5">
              {b}
            </li>
          ))}
        </ul>
      </section>

      {draft.sections.map((sec, i) => (
        <Section key={i} index={i + 2} heading={sec.heading} lines={sec.lines} />
      ))}

      {/* 붙임 — 번호 시작 위치를 라벨 오른쪽에 맞춰 정렬(한 줄이 길어져도 유지) */}
      <div className="mt-[8mm]">
        {draft.attachments.length > 0 ? (
          <div className="flex gap-3">
            <span className="shrink-0 tracking-[.5em]">붙임</span>
            <ol className="flex-1">
              {draft.attachments.map((a, i) => (
                <li key={i} className="-indent-5 pl-5">
                  {draft.attachments.length > 1 ? `${i + 1}. ` : ""}
                  {a}
                  {i === draft.attachments.length - 1 ? ".　　끝." : ""}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p>끝.</p>
        )}
      </div>

      <div className="mt-[12mm] text-center text-[10pt] text-[var(--gian-ink-soft)]">
        {footText(docType)}
        <div className="mt-1 text-[13pt] font-extrabold tracking-[.4em] text-[var(--gian-ink)]">
          {office ?? ""}
        </div>
      </div>
    </article>
  );
}

/**
 * 본문 한 절. "가. 라벨: 값" 형태가 3줄 이상이면 목업의 정보표(.kv)로 그린다 —
 * 개요·지출 항목은 표가 훨씬 읽기 쉽고, 그 외 서술형 절은 개조식 그대로 둔다.
 */
function Section({
  index,
  heading,
  lines,
}: {
  index: number;
  heading: string;
  lines: string[];
}) {
  const parsed = lines.map((l) => LABELED.exec(l));
  const asTable = parsed.filter(Boolean).length >= 3;

  return (
    <section className="mb-[6mm]">
      <h3 className="mb-1 text-[12pt] font-extrabold">
        {index}. {heading}
      </h3>
      {asTable ? (
        <>
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, j) => {
                const m = parsed[j];
                if (!m) return null;
                return (
                  <tr key={j}>
                    <th className="w-[38mm] border border-[var(--gian-doc-line)] bg-[var(--gian-paper)] px-3 py-1.5 text-left font-bold whitespace-nowrap">
                      {m[1].trim()}
                    </th>
                    <td className="border border-[var(--gian-doc-line)] px-3 py-1.5">
                      {m[2]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* 표에 안 들어가는 줄(하위 항목·※ 단서)은 표 아래에 그대로 둔다 */}
          {lines.map((line, j) =>
            parsed[j] ? null : (
              <p
                key={j}
                className={
                  line.trim().startsWith("※")
                    ? "mt-1 pl-4 text-[10pt] text-[var(--gian-ink-soft)]"
                    : "mt-1 pl-8"
                }
              >
                {line.trim()}
              </p>
            ),
          )}
        </>
      ) : (
        lines.map((line, j) => (
          <p key={j} className={/^\s*\d+\)/.test(line) ? "pl-8" : "pl-4"}>
            {line}
          </p>
        ))
      )}
    </section>
  );
}

/** 인쇄 시 지정한 시트만 보이게 — 문서 페이지들이 공유하는 스타일 */
export function PrintStyle({
  target = "a4-sheet",
  /** 용지 여백. 공고문처럼 자체 여백(mm)을 가진 문서는 "0"으로 넘긴다 */
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
        /* 위치만 잡는다 — 안쪽 여백은 각 문서가 자기 인쇄 규칙(print:*)으로 정한다 */
        #${target} { position: absolute; inset: 0; width: 100%; margin: 0; }
      }
      @page { size: A4; margin: ${margin}; }
    `}</style>
  );
}
