import type { DunningLetter } from "@/lib/dunning";

/**
 * 독촉장 A4 렌더러 — 세대당 1장, 회차 전체를 break-after-page로 일괄 인쇄.
 * 활자가 공고문(14pt)보다 작은 이유: 공고문은 1m 밖에서 서서 읽는 게시물이고
 * 이건 손에 들고 30cm에서 읽는 우편물이다. 기안서와 같은 11.5pt 기준.
 */
export function DunningSheets({
  letters,
  docNo,
  sentDate,
  office,
  tel,
  sealImage,
  logoImage,
}: {
  letters: DunningLetter[];
  docNo: string;
  sentDate: string; // "2026년 8월 1일"
  office: string;
  tel?: string | null;
  sealImage?: string | null;
  logoImage?: string | null;
}) {
  return (
    <div id="dunning-sheets" className="space-y-6 print:space-y-0">
      {letters.map((letter, i) => (
        <div
          key={i}
          className="flex w-full max-w-[210mm] shrink-0 break-after-page flex-col border bg-white px-[20mm] py-[18mm] text-[11.5pt] leading-[1.8] text-[#111] shadow-sm lg:min-h-[297mm] lg:w-[210mm] print:min-h-0 print:border-0 print:p-0 print:shadow-none"
        >
          {/* 문서번호·발송일 — 우편물이라 게시표(3분할 헤더)가 아니라 소자 한 줄 */}
          <div className="flex justify-between text-[9pt] text-[#555]">
            <span>문서번호: {docNo}</span>
            <span>발송일: {sentDate}</span>
          </div>

          <h1 className="mt-[6mm] mb-[5mm] text-center text-[20pt] font-extrabold tracking-[.4em] indent-[.4em]">
            {letter.kind}
          </h1>

          {/* 내용증명(3단계)만 — 우체국 요건인 발신·수신 기재 */}
          {letter.proof && (
            <table className="mb-[4mm] w-full border-collapse text-[10.5pt]">
              <tbody>
                {(
                  [
                    ["발신인", letter.proof.sender, letter.proof.senderAddr],
                    ["수신인", letter.proof.receiver, letter.proof.receiverAddr],
                  ] as const
                ).map(([role, name, addr]) => (
                  <tr key={role}>
                    <th className="w-[18mm] border border-[#333] bg-[#F3F4F6] px-[2mm] py-[1.6mm] text-center font-bold">
                      {role}
                    </th>
                    <td className="border border-[#333] px-[3mm] py-[1.6mm]">
                      {name}
                      {addr && (
                        <span className="block text-[9.5pt] text-[#444]">
                          {addr}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="mb-[3mm] font-bold">받는 분: {letter.recipient}</p>
          {letter.paragraphs.map((p, j) => (
            <p key={j} className="mb-[1mm] indent-[2ch]">
              {p}
            </p>
          ))}

          <table className="my-[3mm] w-full border-collapse text-[11pt]">
            <tbody>
              {letter.table.map((r) => (
                <tr key={r.k}>
                  <th className="w-[32mm] border border-[#333] bg-[#F3F4F6] px-[3mm] py-[2mm] text-center font-bold tracking-[.2em] whitespace-nowrap">
                    {r.k}
                  </th>
                  <td
                    className={`border border-[#333] px-[3mm] py-[2mm] ${
                      r.k === "미납 금액" ? "font-extrabold text-[#C22A21]" : ""
                    }`}
                  >
                    {r.v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {letter.notes.length > 0 && (
            <ul className="mb-[2mm] text-[10pt] text-[#333]">
              {letter.notes.map((n, j) => (
                <li key={j} className="relative mb-[1.2mm] pl-[4mm] before:absolute before:left-0 before:content-['※']">
                  {n}
                </li>
              ))}
            </ul>
          )}

          <div className="flex-1" />

          <p className="mb-[6mm] text-center text-[11pt]">{sentDate}</p>
          <div className="flex items-center justify-center gap-[4mm]">
            {logoImage && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI라 next/image 최적화 대상이 아니다
              <img src={logoImage} alt="아파트 로고" className="size-[10mm] shrink-0 object-contain" />
            )}
            <span className="text-[15pt] font-extrabold tracking-[.06em] whitespace-nowrap">
              {office}
              {!sealImage && (
                <span className="ml-2 text-[9pt] font-semibold tracking-normal text-[#444]">
                  (직인생략)
                </span>
              )}
            </span>
            {sealImage && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI라 next/image 최적화 대상이 아니다
              <img src={sealImage} alt="직인" className="-ml-[3mm] size-[15mm] shrink-0 object-contain" />
            )}
          </div>
          {tel && <p className="mt-[2mm] text-center text-[9.5pt] text-[#222]">{tel}</p>}
        </div>
      ))}
    </div>
  );
}
