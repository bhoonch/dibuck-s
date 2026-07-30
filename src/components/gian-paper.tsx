import { Fragment } from "react";
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
/** "가. 공 사 명: 값" → [_, "가", "공 사 명", "값"] — 항목 기호까지 살려 개조식을 유지한다 */
const LABELED = /^\s*([가-힣])\.\s*([^:：]{2,20})\s*[:：]\s*(.+)$/;

/**
 * 붙임이 없으면 "끝."은 본문 마지막 글자 뒤 두 칸에 붙는다(공문 규칙).
 * 예전엔 왼쪽 끝 별도 줄로 떨어져 서식이 어긋났고, 그 한 줄이 A4 한 장을 넘기기도 했다.
 * 붙임이 있으면 붙임 마지막 항목이 ".　　끝."으로 문서를 닫으므로 여기서는 손대지 않는다.
 */
export const closeInline = (draft: Pick<GianDraft, "sections" | "attachments">) =>
  draft.attachments.length === 0 && (draft.sections.at(-1)?.lines.length ?? 0) > 0;

/** 마지막 절의 마지막 줄 뒤에 "　　끝."을 붙인 사본 */
export const withClosing = (sections: GianDraft["sections"]) =>
  sections.map((sec, i) =>
    i < sections.length - 1
      ? sec
      : {
          ...sec,
          lines: sec.lines.map((l, j) =>
            j === sec.lines.length - 1 ? `${l.replace(/\s+$/, "")}　　끝.` : l,
          ),
        },
  );

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
  waiver,
  foot,
  id = "a4-sheet",
}: {
  draft: GianDraft;
  steps: PaperStep[];
  docNo?: string | null;
  office?: string; // "행복아파트 관리사무소"
  docType?: DocType;
  createdAt?: Date;
  /** 견적서 미첨부 사유 한 줄 — 종이만 보는 감사에 대응한다 */
  waiver?: string | null;
  /** 맺음말 직접 지정 — 완료보고·지출결의처럼 서식이 제 문구를 가진 문서용 */
  foot?: string;
  id?: string;
}) {
  const boxes = steps.length > 0 ? steps : EMPTY_STEPS;

  const inlineEnd = closeInline(draft);
  const sections = inlineEnd ? withClosing(draft.sections) : draft.sections;

  return (
    <article
      id={id}
      // min-h 297mm: 내용이 짧아도 종이는 A4 한 장 (인쇄는 @page 담당이라 강제하지 않는다).
      // flex-col + 스페이서로 맺음말·명의 두 줄을 용지 맨 아래에 앉힌다 — notice-paper와 같은 방식
      className="flex w-full max-w-[210mm] shrink-0 flex-col bg-[var(--gian-card)] px-[16mm] py-[14mm] text-[11.5pt] leading-[1.6] whitespace-pre-wrap text-[var(--gian-ink)] shadow-[var(--gian-shadow)] lg:min-h-[297mm] lg:w-[210mm] [border:1.5px_solid_var(--gian-doc-line)] print:min-h-0 print:border-0 print:p-0 print:shadow-none"
    >
      {/* 문서 머리 — 좌: 문서번호·시행일자·수신 / 우: 결재란 */}
      <div className="flex items-start justify-between gap-4">
        <div className="text-[9.5pt] leading-[1.9] text-[var(--gian-ink-soft)]">
          {/* 채번이 "기안-2026-0001"이라 한글이 섞인다 — mono는 글리프가 없어 무효고 폰트만 튄다.
              시행일자도 같은 이유로 본문 폰트: 머리줄 세 줄 중 하나만 mono면 그 줄만 튄다 */}
          문서번호 : {docNo ?? "(채번 전)"}
          <br />
          시행일자 : {docDate(createdAt ?? new Date())}
          <br />
          수　　신 : 내부결재
        </div>

        <table className="border-collapse">
          <tbody>
            <tr>
              {/* S-APT 원문의 결/재 세로 칸 — 표 밖 글자가 아니라 결재란의 첫 칸이다 */}
              <th
                rowSpan={2}
                className="w-[7mm] border border-[var(--gian-doc-line)] bg-[var(--gian-paper)] px-1.5 text-center text-[8.5pt] leading-[1.5] font-semibold"
              >
                결<br />재
              </th>
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
      <h2 className="mt-[9mm] mb-1.5 text-center text-[17pt] font-extrabold tracking-[.02em] text-balance">
        {draft.title}
      </h2>
      <div className="mx-auto mb-[8mm] h-[2.5px] w-[120px] bg-[var(--gian-ink)]" />

      <section className="mb-[5mm]">
        <h3 className="mb-1 text-[12pt] font-extrabold">1. 관련 근거</h3>
        {/* 항목 기호는 본문이 "가. 나. 다."로 갖고 있다 — 불릿까지 찍으면 마커가 겹친다 */}
        <div className="pl-4">
          {draft.legalBasis.map((b, i) => (
            <p key={i}>{b}</p>
          ))}
        </div>
      </section>

      {sections.map((sec, i) => (
        <Section key={i} index={i + 2} heading={sec.heading} lines={sec.lines} />
      ))}

      {/*
        미첨부 사유는 붙임 **위**에 — 붙임 마지막 항목이 ".　　끝."으로 문서를 닫으므로
        그 뒤에 무엇을 적으면 공문서 형식이 깨진다.
      */}
      {waiver && (
        <p className="mt-[8mm] text-[10.5pt] text-[var(--gian-stamp)]">
          {waiver}
        </p>
      )}

      {/* 붙임 — 번호 시작 위치를 라벨 오른쪽에 맞춰 정렬(한 줄이 길어져도 유지) */}
      {!inlineEnd && (
        <div className="mt-[6mm]">
          {draft.attachments.length > 0 ? (
            <div className="flex gap-3">
              <span className="shrink-0 tracking-[.5em]">붙임</span>
              <ol className="flex-1">
                {draft.attachments.map((a, i) => (
                  <li key={i} className="-indent-5 pl-5">
                    {draft.attachments.length > 1 ? `${i + 1}. ` : ""}
                    {/* 마지막 항목은 제 마침표를 떼고 "끝."의 마침표를 쓴다 — "1부..  끝." 방지 */}
                    {i === draft.attachments.length - 1
                      ? `${a.replace(/\.+\s*$/, "")}.　　끝.`
                      : a}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p>끝.</p>
          )}
        </div>
      )}

      {/* 맺음말·명의는 내용이 짧아도 용지 맨 아래 — 여백이 위가 아니라 가운데로 간다 */}
      <div className="flex-1" />
      <div className="mt-[10mm] text-center text-[10pt] text-[var(--gian-ink-soft)]">
        {foot ?? footText(docType)}
        <div className="mt-1 text-[13pt] font-extrabold tracking-[.4em] text-[var(--gian-ink)]">
          {office ?? ""}
        </div>
      </div>
    </article>
  );
}

/**
 * 값 안에 섞여 오는 "※ 단서"를 줄을 바꿔 아래로 내린다.
 * 계약방식 문구는 "수의계약 (…) ※ 추정가격 500만 원 이하…"처럼 한 문자열로 오는데,
 * 한 줄에 이어 붙으면 본문과 단서가 구분되지 않는다.
 */
function Note({ text }: { text: string }) {
  const [head, ...notes] = text.split(/\s*※\s*/);
  return (
    <>
      {head.trim()}
      {notes.map((n, i) => (
        <span
          key={i}
          className="mt-0.5 block text-[10pt] text-[var(--gian-ink-soft)]"
        >
          ※ {n.trim()}
        </span>
      ))}
    </>
  );
}

/**
 * 본문 한 절. "가. 라벨: 값" 형태가 3줄 이상이면 목업의 정보표(.kv)로 그린다 —
 * 개요·지출 항목은 표가 훨씬 읽기 쉽고, 그 외 서술형 절은 개조식 그대로 둔다.
 */
function Section({
  index,
  heading,
  lines: raw,
}: {
  index: number;
  heading: string;
  lines: string[];
}) {
  /*
   * 한 줄 안에 줄바꿈이 들어오는 경우가 있다 — LLM이 "마. 계약방식: …\n  ※ 추정가격 …"을
   * 한 항목으로 내보내면 정규식이 통째로 실패해서 그 줄만 정렬에서 빠졌다(볼드도 안 걸린다).
   * 먼저 줄 단위로 펴고 나서 라벨을 찾는다.
   */
  const lines = raw.flatMap((l) => l.split(/\r?\n/)).filter((l) => l.trim());
  const parsed = lines.map((l) => LABELED.exec(l));
  // 라벨 줄이 2줄 이상이면 칸을 맞춰 세운다 — 테두리는 치지 않는다.
  // 표를 치면 개요·견적·일정이 전부 상자가 되어 한 장에 상자 서너 개가 쌓인다.
  // 격자로 폭만 맞춰도 콜론과 값이 한 줄에 서고, 종이는 개조식 그대로 남는다.
  const aligned = parsed.filter(Boolean).length >= 2;

  /*
   * 견적 비교 절만 예외로 괘선 표 — S-APT 서식 5 원문이 유일하게 표로 그리는 절이다
   * (구분 | 업체A | 업체B, 견적금액 행). 업체가 열로 서야 금액 비교가 한눈에 된다.
   * 제목에 "견적"이 없거나 라벨 줄이 2개 미만이면 아래 일반 렌더로 떨어진다.
   */
  const quoteEntries = /견적/.test(heading)
    ? (parsed.filter(Boolean) as RegExpExecArray[])
    : [];
  if (quoteEntries.length >= 2) {
    const cell = "border border-[var(--gian-doc-line)] px-2 py-[1.4mm]";
    return (
      <section className="mb-[5mm]">
        <h3 className="mb-1 text-[12pt] font-extrabold">
          {index}. {heading}
        </h3>
        <table className="ml-4 w-[calc(100%-1rem)] border-collapse text-center">
          <thead>
            <tr>
              <th
                className={`${cell} w-[26mm] bg-[var(--gian-paper)] font-bold tracking-[.3em]`}
              >
                구분
              </th>
              {quoteEntries.map((m, j) => (
                <th key={j} className={`${cell} bg-[var(--gian-paper)] font-bold`}>
                  {m[2].trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className={`${cell} bg-[var(--gian-paper)] font-bold`}>
                견적금액
              </th>
              {quoteEntries.map((m, j) => (
                <td
                  key={j}
                  className={`${cell} ${m[3].includes("선정") ? "font-bold" : ""}`}
                >
                  <Note text={m[3]} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {/* 라벨 형태가 아닌 줄(※ 단서 등)은 표 아래 딸린 말로 */}
        {lines
          .filter((_, j) => !parsed[j])
          .map((line, j) => (
            <p key={j} className="pl-4 text-[10pt] text-[var(--gian-ink-soft)]">
              {line.trim()}
            </p>
          ))}
      </section>
    );
  }

  return (
    <section className="mb-[6mm]">
      <h3 className="mb-1 text-[12pt] font-extrabold">
        {index}. {heading}
      </h3>
      {aligned ? (
        <div className="grid grid-cols-[max-content_1fr] gap-x-3 pl-4">
          {lines.map((line, j) => {
            const m = parsed[j];
            // 하위 항목·※ 단서는 앞 줄에 딸린 말이라 값 칸(둘째 칸)에 붙인다 —
            // 두 칸을 가로지르면 라벨 왼쪽까지 튀어나와 딸린 줄로 안 보인다
            if (!m)
              return (
                <p
                  key={j}
                  className={
                    line.trim().startsWith("※")
                      ? "col-start-2 text-[10pt] text-[var(--gian-ink-soft)]"
                      : "col-start-2"
                  }
                >
                  {line.trim()}
                </p>
              );
            return (
              <Fragment key={j}>
                {/* 라벨 칸은 격자가 가장 긴 라벨에 맞춰 잡는다 → 콜론이 한 줄에 선다 */}
                <span className="flex min-w-[28mm] justify-between gap-3 font-bold whitespace-nowrap">
                  <span>
                    {m[1]}. {m[2].trim()}
                  </span>
                  <span>:</span>
                </span>
                <span>
                  <Note text={m[3]} />
                </span>
              </Fragment>
            );
          })}
        </div>
      ) : (
        lines.map((line, j) => (
          <p key={j} className={/^\s*\d+\)/.test(line) ? "pl-8" : "pl-4"}>
            <Note text={line} />
          </p>
        ))
      )}
    </section>
  );
}

/** 인쇄 시 지정한 시트만 보이게 — 문서 페이지들이 공유하는 스타일 */
export function PrintStyle({
  target = "a4-sheet",
  /** 용지 여백. 공고문처럼 자체 여백(mm)을 가진 문서는 "0"으로 넘긴다.
   *  기본값은 화면 용지의 안쪽 여백(px-16mm py-14mm)과 같다 — 다르면 인쇄에서만 본문이 넘친다 */
  margin = "14mm 16mm",
}: {
  target?: string;
  margin?: string;
}) {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden; }
        #${target}, #${target} * { visibility: visible; }
        /* 위치만 잡는다 — 안쪽 여백은 각 문서가 자기 인쇄 규칙(print:*)으로 정한다.
           bottom을 묶지 않는다(inset:0 금지): 용지 높이가 내용이 아니라 페이지 상자에
           고정되면 넘친 꼬리가 상자 밖으로 새서 페이지 나눔이 예측 불가가 된다.
           min-height로 짧은 문서만 한 장을 채운다. */
        #${target} { position: absolute; top: 0; left: 0; right: 0; min-height: 100%; margin: 0; }
      }
      @page { size: A4; margin: ${margin}; }
    `}</style>
  );
}
