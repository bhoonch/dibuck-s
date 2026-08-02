import type { NoticeKind, NoticePostDraft } from "@/lib/notice-catalog";

/**
 * 공지문 모듈 A4 렌더러 (210×297mm) — 결재 파생 공고문(notice-paper.tsx)과 같은
 * 시각 언어(청색 괘선·표 헤더·명의+직인)를 쓰되, 서식은 두 격으로 갈린다:
 * 안내문 = 제목 → 인사 → 개요 표 → ▶협조 사항 → 맺음 / 공고문 = 공고 호수 → 제목 → 개조식.
 *
 * 활자 14pt 기준 — 게시물은 승강기 벽에서 1m 밖에서 읽는다(기안서 11.5pt와 다른 거리).
 */
export function NoticePostPaper({
  draft,
  kind,
  officialNo,
  postedDate,
  office,
  tel,
  sealImage,
  logoImage,
  id = "a4-sheet",
}: {
  draft: NoticePostDraft;
  kind: NoticeKind;
  /** 공고문 상단 "○○아파트 공고 제2026-7호" — officialNoOf()가 채번에서 유도 */
  officialNo: string;
  /** 게시일 한글 표기 (예: "2026년 8월 3일") */
  postedDate: string;
  /** 하단 명의 (예: "행복아파트 관리사무소장") */
  office: string;
  tel?: string | null;
  sealImage?: string | null;
  logoImage?: string | null;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="flex w-full max-w-[210mm] shrink-0 flex-col border bg-white px-[16mm] pt-[15mm] pb-[13mm] text-[14pt] leading-[1.65] text-[#111] shadow-sm lg:min-h-[297mm] lg:w-[210mm] print:border-0 print:shadow-none"
    >
      {kind === "official" && (
        <>
          {/* 호수는 채번에서 온 결정값 — 한글이 섞여 mono 금지 */}
          <p className="text-[12pt] font-bold">{officialNo}</p>
          <hr className="mt-[2.5mm] mb-[9mm] border-0 border-t-2 border-[#2456A6]" />
        </>
      )}

      <h2
        className={`mb-[8mm] text-center text-[21pt] font-extrabold tracking-[.02em] text-[#2456A6] ${
          kind === "guide" ? "mt-[6mm]" : ""
        }`}
      >
        {draft.title}
      </h2>

      {draft.intro && <p className="mb-[6mm] indent-[2ch]">{draft.intro}</p>}

      {draft.items.length > 0 && (
        <>
          {kind === "guide" && (
            <p className="my-[4mm] text-center text-[14.5pt] font-bold tracking-[1.1em] indent-[1.1em]">
              - 아 래 -
            </p>
          )}
          {/* 본문보다 0.5pt 작게 — 34mm 라벨 칸의 줄바꿈 한계선 (notice-paper와 동일) */}
          <table className="mb-[6mm] w-full border-collapse text-[13.5pt]">
            <tbody>
              {draft.items.map((r, i) => (
                <tr key={i}>
                  <th className="w-[34mm] border border-[#333] bg-[#DCE8F8] px-[3.5mm] py-[2.6mm] text-center font-bold tracking-[.25em] whitespace-nowrap">
                    {r.label}
                  </th>
                  <td className="border border-[#333] px-[3.5mm] py-[2.6mm] text-left">
                    {r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {draft.bodyLines.length > 0 &&
        (kind === "guide" ? (
          <ul className="mb-[4mm] text-[12.5pt]">
            {draft.bodyLines.map((n, i) => (
              <li
                key={i}
                className="relative mb-[1.6mm] pl-[5mm] before:absolute before:left-0 before:text-[9.5pt] before:text-[#2456A6] before:content-['▶']"
              >
                {n}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mb-[4mm]">
            {draft.bodyLines.map((n, i) => (
              // 개조식 기호(1. 가.)와 들여쓰기는 문안에 들어 있다 — 렌더러는 줄만 세운다
              <p key={i} className="mb-[1.6mm] whitespace-pre-wrap">
                {n}
              </p>
            ))}
          </div>
        ))}

      {draft.closing && <p className="indent-[2ch]">{draft.closing}</p>}

      <div className="flex-1" />

      <p className="mb-[7mm] text-center text-[14.5pt] font-bold">{postedDate}</p>

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
        <p className="mt-[2.5mm] text-center text-[11pt] text-[#222]">{tel}</p>
      )}
    </div>
  );
}
