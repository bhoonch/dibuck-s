/**
 * 법정 점검·검사 실시 기록 A4 렌더러 — 결정적 코드, LLM 없음.
 * 값을 채우는 정형 문서라 작문이 필요 없다. 책상 증빙 문서 — 활자는 기안서 축
 * (본문 11.5pt), gian-paper 괘선 문법 재사용.
 */

import { RESULT_HINT } from "@/lib/inspection/catalog";
import { followupOf } from "@/lib/inspection/schedule";

/** 공문서 날짜 표기 "2026. 08. 05." */
const paperDate = (ymd: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.replace(/-/g, ". ")}.` : ymd;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export type InspectionPaperData = {
  docNo: string;
  itemName: string;
  legalBasis: string;
  /** 실시일자 YYYY-MM-DD */
  doneAt: string;
  /** 수행 — "자체" 또는 업체·기관명 */
  performedBy: string;
  /** 대표 판정 — 기구별 판정이 있으면 그중 가장 나쁜 것 */
  result: string;
  /** 놀이기구별 판정(어린이놀이시설). 비어 있으면 대표 판정만 찍는다 */
  units?: { name: string; result: string }[];
  /** 이용금지 기구의 물리적 차단 조치 완료 여부 */
  barrier?: boolean;
  /** 법이 정한 점검 범위 문구 — 있으면 결과 절 아래에 찍는다 */
  scope?: string;
  findings: string;
  actions: string;
  cost: number;
  /** 실제 첨부파일 이름만 — 파일에 없는 문서가 종이에 실리면 종이가 거짓말을 한다 */
  attachmentNames: string[];
  /** 작성자 이름 */
  author: string;
  /** 하단 확인란 명의 (예: "행복아파트 관리사무소장") */
  office: string;
};

export function InspectionPaper({
  data,
  id = "a4-sheet",
}: {
  data: InspectionPaperData;
  id?: string;
}) {
  const line = "border border-[var(--gian-doc-line)]";
  const th = `${line} bg-[var(--gian-paper)] px-[2mm] py-[1.6mm] text-center text-[10pt] font-bold whitespace-nowrap`;
  const td = `${line} px-[2.5mm] py-[1.6mm] text-[10.5pt]`;

  // 개조식 — 줄 단위. 사용자가 "1. ..." 기호를 직접 넣었으면 그대로 둔다
  const listOf = (text: string) => text.split(/\r?\n/).filter((l) => l.trim());

  const units = (data.units ?? []).filter((u) => u.name.trim());
  const followup = followupOf(data.result, data.doneAt);

  return (
    <article
      id={id}
      className="flex w-full max-w-[210mm] shrink-0 flex-col bg-[var(--gian-card)] px-[16mm] pt-[18mm] pb-[12mm] text-[11.5pt] leading-[1.6] text-[var(--gian-ink)] shadow-[var(--gian-shadow)] lg:min-h-[297mm] lg:w-[210mm] [border:1.5px_solid_var(--gian-doc-line)] print:min-h-0 print:border-0 print:p-0 print:shadow-none"
    >
      <h2 className="mb-1.5 text-center text-[17pt] font-extrabold tracking-[.2em] indent-[.2em] text-balance">
        법정 점검·검사 실시 기록
      </h2>
      <div className="mx-auto mb-[5mm] h-[2.5px] w-[120px] bg-[var(--gian-ink)]" />

      {/* 정보 표 — 문서번호 / 점검 항목 / 근거 법령 / 실시일자 / 수행 / 비용 */}
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th className={`${th} w-[26mm]`}>문서번호</th>
            <td className={td}>{data.docNo}</td>
            <th className={`${th} w-[26mm]`}>실시일자</th>
            <td className={`${td} w-[40mm]`}>{paperDate(data.doneAt)}</td>
          </tr>
          <tr>
            <th className={th}>점검 항목</th>
            <td className={td} colSpan={3}>
              {data.itemName}
            </td>
          </tr>
          <tr>
            <th className={th}>근거 법령</th>
            <td className={td} colSpan={3}>
              {data.legalBasis || "-"}
            </td>
          </tr>
          <tr>
            <th className={th}>수　　행</th>
            <td className={td}>{data.performedBy}</td>
            <th className={th}>비　　용</th>
            <td className={td}>{data.cost > 0 ? won(data.cost) : "-"}</td>
          </tr>
        </tbody>
      </table>

      {/* 결과 — 기구별 판정이 있으면 표가 대장의 본체다 */}
      <section className="mt-[6mm]">
        <h3 className="mb-[1.5mm] text-[12pt] font-extrabold">점검 결과</h3>
        {units.length > 0 ? (
          <>
            <table className="w-full border-collapse">
              <tbody>
                {units.map((u, i) => (
                  <tr key={i}>
                    <th className={`${th} w-[60mm] text-left`}>{u.name}</th>
                    <td className={`${td} font-bold`}>
                      {u.result}
                      {RESULT_HINT[u.result] && (
                        <span className="font-normal text-[9.5pt] text-[var(--gian-ink-soft)]">
                          {"  "}— {RESULT_HINT[u.result]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.barrier && (
              <p className="mt-[2mm] pl-4">
                이용금지 기구는 안전선·이용금지 표지판을 설치하여 이용을 차단하였음.
              </p>
            )}
          </>
        ) : (
          <p className="pl-4 font-bold">
            {data.result === "지적사항"
              ? "지적사항 있음"
              : data.result === "정상"
                ? "정상 (지적사항 없음)"
                : data.result}
          </p>
        )}
        {data.findings && (
          <div className="mt-[2mm] pl-4">
            <p className="font-bold">지적 내용</p>
            <div className="pl-4">
              {listOf(data.findings).map((l, i) => (
                <p key={i} className="-indent-[1.6em] pl-[1.6em] whitespace-pre-wrap">
                  {l}
                </p>
              ))}
            </div>
          </div>
        )}
        {data.actions && (
          <div className="mt-[2mm] pl-4">
            <p className="font-bold">조치 계획</p>
            <div className="pl-4">
              {listOf(data.actions).map((l, i) => (
                <p key={i} className="-indent-[1.6em] pl-[1.6em] whitespace-pre-wrap">
                  {l}
                </p>
              ))}
            </div>
          </div>
        )}
        {/* 법정 후속 조치 — 기한이 종이에 남아야 감사에서 증빙이 된다 */}
        {followup && (
          <div className="mt-[2mm] pl-4">
            <p className="font-bold">후속 조치</p>
            <p className="pl-4">
              {followup.title} 기한: {paperDate(followup.dueYmd)}
              {followup.legal && " (어린이놀이시설 안전관리법 제15조)"}
            </p>
          </div>
        )}
        {data.scope && (
          <p className="mt-[3mm] pl-4 text-[10pt] text-[var(--gian-ink-soft)]">
            ※ 점검 범위: {data.scope}
          </p>
        )}
      </section>

      {/* 첨부 — 실제 첨부파일만이 사실이다 (attachmentLines 원칙) */}
      {data.attachmentNames.length > 0 && (
        <section className="mt-[6mm]">
          <h3 className="mb-[1.5mm] text-[12pt] font-extrabold">첨부</h3>
          <ol className="pl-4">
            {data.attachmentNames.map((n, i) => (
              <li key={i}>
                {data.attachmentNames.length > 1 ? `${i + 1}. ` : ""}
                {n.replace(/\.[^.]+$/, "")} 1부.
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 확인란은 내용이 짧아도 용지 맨 아래 */}
      <div className="flex-1" />
      <div className="mt-[6mm] break-inside-avoid text-center">
        <p>위와 같이 법정 점검을 실시하였음.</p>
        <p className="mt-[2mm]">{paperDate(data.doneAt)}</p>
        <div className="mt-[3mm] ml-auto w-fit text-right">
          <p>
            작성자: {data.author}{" "}
            <span className="text-[var(--gian-ink-soft)]">(인)</span>
          </p>
          <p className="mt-1 font-bold">
            {data.office}{" "}
            <span className="font-normal text-[var(--gian-ink-soft)]">(인)</span>
          </p>
        </div>
      </div>
    </article>
  );
}
