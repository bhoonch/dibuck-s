import type { NoticeDoc } from "@/lib/gian/notice";

/**
 * 입주민 공고문 A4 렌더러 (210×297mm) — 실제 관리사무소 게시물 양식.
 * 3분할 헤더 → 청색 괘선 → 대제목 → 인사 → "- 아 래 -" → 정보표 → ▶유의사항
 * → (여백) → 굵은 청색선 → 명의+직인 → TEL/FAX
 */
export function NoticePaper({
  notice,
  docNo,
  office,
  tel,
  sealImage,
  logoImage,
  id = "a4-sheet",
}: {
  notice: NoticeDoc;
  docNo: string;
  office: string;
  tel?: string;
  sealImage?: string | null;
  /** 아파트 로고 — 하단 명의의 단지명 앞에 찍힌다 (설정 > 단지 정보) */
  logoImage?: string | null;
  id?: string;
}) {
  const th =
    "w-[16mm] border border-[#2456A6] bg-[#EAF0FA] px-[1.8mm] py-[1mm] text-center font-bold whitespace-nowrap text-[#16324F]";
  const td = "border border-[#2456A6] px-[1.8mm] py-[1mm]";

  return (
    <div
      id={id}
      className="flex w-full max-w-[210mm] shrink-0 flex-col border bg-white px-[15mm] pt-[14mm] pb-[12mm] text-[12pt] leading-[1.65] text-[#111] shadow-sm lg:min-h-[297mm] lg:w-[210mm] print:border-0 print:shadow-none"
    >
      {/* 3분할 헤더 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[5mm]">
        <table className="w-full max-w-[52mm] border-collapse text-[8.5pt]">
          <tbody>
            <tr>
              <th className={th}>문서번호</th>
              <td className={`${td} font-mono`}>{docNo}</td>
            </tr>
            <tr>
              <th className={th}>게시장소</th>
              <td className={td}>{notice.place}</td>
            </tr>
          </tbody>
        </table>
        <div className="text-center text-[25pt] font-extrabold tracking-[.5em] indent-[.5em] whitespace-nowrap">
          {notice.kind}
        </div>
        <table className="ml-auto w-full max-w-[52mm] border-collapse text-[8.5pt]">
          <tbody>
            <tr>
              <th className={th}>게 시 일</th>
              <td className={td}>{notice.postFrom} 부터</td>
            </tr>
            <tr>
              <th className={th}>게시기간</th>
              <td className={td}>{notice.postTo} 까지</td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr className="mt-[4mm] mb-[9mm] border-0 border-t-2 border-[#2456A6]" />

      <h2 className="mb-[8mm] text-center text-[19pt] font-extrabold tracking-[.02em] text-[#2456A6]">
        {notice.title}
      </h2>
      <p className="mb-[5mm] indent-[2ch]">{notice.intro}</p>
      <p className="my-[5mm] text-center text-[12.5pt] font-bold tracking-[1.1em] indent-[1.1em]">
        - 아 래 -
      </p>

      <table className="mb-[6mm] w-full border-collapse text-[11.5pt]">
        <tbody>
          {notice.rows.map((r) => (
            <tr key={r.k}>
              <th className="w-[34mm] border border-[#333] bg-[#DCE8F8] px-[3.5mm] py-[2.6mm] text-center font-bold tracking-[.25em] whitespace-nowrap">
                {r.k}
              </th>
              <td
                className={`border border-[#333] px-[3.5mm] py-[2.6mm] text-left ${
                  r.red ? "font-extrabold text-[#C22A21]" : ""
                }`}
              >
                {r.v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {notice.notes.length > 0 && (
        <ul className="mb-[4mm] text-[10.5pt]">
          {notice.notes.map((n, i) => (
            <li
              key={i}
              className={`relative mb-[1.2mm] pl-[5mm] before:absolute before:left-0 before:text-[8.5pt] before:text-[#2456A6] before:content-['▶'] ${
                n.red ? "font-semibold text-[#C22A21]" : ""
              }`}
            >
              {n.text}
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1" />

      <hr className="mb-[5mm] border-0 border-t-[3px] border-[#2456A6]" />
      <div className="flex items-center justify-center gap-[4mm]">
        {logoImage && (
          // eslint-disable-next-line @next/next/no-img-element -- data URI라 next/image 최적화 대상이 아니다
          <img
            src={logoImage}
            alt="아파트 로고"
            className="size-[12mm] shrink-0 object-contain"
          />
        )}
        <span className="text-[17pt] font-extrabold tracking-[.06em] whitespace-nowrap">
          {office}
          {!sealImage && (
            <span className="ml-2 text-[10pt] font-semibold tracking-normal text-[#444]">
              (직인생략)
            </span>
          )}
        </span>
        {sealImage && (
          // eslint-disable-next-line @next/next/no-img-element -- data URI라 next/image 최적화 대상이 아니다
          <img
            src={sealImage}
            alt="직인"
            className="-ml-[3mm] size-[17mm] shrink-0 object-contain"
          />
        )}
      </div>
      {tel && (
        <p className="mt-[2.5mm] text-center text-[10pt] text-[#222]">{tel}</p>
      )}
    </div>
  );
}
