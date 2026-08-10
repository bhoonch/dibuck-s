/**
 * 소집 통지문 A4 렌더러 — 게시판에 붙이는 문서라 notice-paper와 같은 축(14pt).
 * 결재문서보다 활자가 큰 이유는 notice-paper와 동일: 승강기 벽 게시물은 1m 밖에서 읽는다.
 */
export function ConvocationPaper({
  meetingNo,
  meetingAt,
  place,
  agenda,
  signerName,
  docNo,
  issuedDate,
  id = "a4-sheet",
}: {
  meetingNo: number;
  /** "YYYY년 M월 D일 HH:mm" — 표시용으로 이미 포맷된 값 */
  meetingAt: string;
  place: string;
  agenda: string[];
  /** "입주자대표회의 회장 ○○○" 또는 "관리사무소장" */
  signerName: string;
  docNo: string;
  /** 작성일(오늘) — "YYYY년 M월 D일" */
  issuedDate: string;
  id?: string;
}) {
  const th =
    "w-[34mm] border border-[#333] bg-[#DCE8F8] px-[3.5mm] py-[2.6mm] text-center font-bold tracking-[.25em] whitespace-nowrap";
  const td = "border border-[#333] px-[3.5mm] py-[2.6mm] text-left";

  return (
    <div
      id={id}
      className="mx-auto flex w-full max-w-[210mm] shrink-0 flex-col border bg-white px-[15mm] pt-[14mm] pb-[12mm] text-[14pt] leading-[1.65] text-[#111] shadow-sm lg:min-h-[297mm] lg:w-[210mm] print:border-0 print:shadow-none"
    >
      <div className="text-right text-[10.5pt] text-[#444]">{docNo}</div>

      <h2 className="mt-[6mm] mb-[9mm] text-center text-[21pt] font-extrabold tracking-[.06em] text-[#2456A6]">
        제{meetingNo}차 입주자대표회의 소집 통지
      </h2>

      <p className="mb-[6mm] indent-[2ch]">
        공동주택관리법 및 관리규약에 따라 다음과 같이 회의를 소집하오니
        참석하여 주시기 바랍니다.
      </p>

      <table className="mb-[8mm] w-full border-collapse text-[13.5pt]">
        <tbody>
          <tr>
            <th className={th}>일 시</th>
            <td className={td}>{meetingAt}</td>
          </tr>
          <tr>
            <th className={th}>장 소</th>
            <td className={td}>{place || "미정"}</td>
          </tr>
        </tbody>
      </table>

      <div className="mb-[8mm]">
        <p className="mb-[2mm] font-bold tracking-[.1em]">안 건</p>
        {agenda.length > 0 ? (
          <ol className="space-y-[1.2mm]">
            {agenda.map((title, i) => (
              <li key={i}>
                {i + 1}. {title}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[#666]">등록된 안건이 없습니다.</p>
        )}
      </div>

      {/* 방청 안내 — 준칙(경기 제25조)이 공개 항목에 방청방법을 요구한다.
          신청 기한·방법은 규약마다 달라(서울 1일 전 서면·유선 / 경기 시작 전) 명시하지 않는다 */}
      <p className="mb-[3mm] text-[12pt] text-[#333]">
        본 회의는 입주자등이 방청할 수 있습니다. 방청 신청은 관리사무소로
        문의해 주시기 바랍니다.
      </p>
      <p className="text-[12pt] text-[#333]">
        본 회의는 공동주택관리법 및 관리규약에 따라 소집합니다.
      </p>

      <div className="flex-1" />

      <p className="mb-[3mm] text-right">{issuedDate}</p>
      <p className="text-center text-[17pt] font-extrabold tracking-[.06em]">
        {signerName}
      </p>
    </div>
  );
}
