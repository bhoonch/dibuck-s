import type { NoticeKind, NoticePostDraft } from "@/lib/notice-catalog";

/**
 * 사진대지 칸 — 공문서 관행 그대로: 실선 테두리 박스, 캡션은 박스 안 하단
 * 구분선 아래. 캡션 없는 사진은 캡션 칸 자체가 없다. 2열 칸은 cover로 꽉
 * 채운다 — 비율이 다른 사진끼리 여백이 제각각 생기지 않게, 대신 칸 비율과
 * 다른 사진은 가장자리가 잘린다. 1장짜리만 자연 비율(잘림 없음).
 */
function PhotoBox({
  photo,
  single,
}: {
  photo: { id: string; caption: string };
  single: boolean;
}) {
  return (
    <figure
      // 0.3mm(≈1.1px): 한 장 맞춤 축소가 걸려도 1px 미만 헤어라인으로 끊기지 않는 굵기
      className={`flex flex-col border-[0.3mm] border-solid border-[#333] ${single ? "mx-auto w-[100mm]" : "w-[calc(50%-2mm)]"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 첨부 라우트 원본이라 next/image 최적화 대상이 아니다 */}
      <img
        src={`/api/attachments/${photo.id}`}
        alt={photo.caption || "첨부 사진"}
        className={
          single
            ? "max-h-[80mm] w-full object-contain"
            : // grow: 옆 칸만 캡션이 있어도 행 높이를 이미지가 채워 두 박스가 나란하다
              "h-[55mm] w-full grow object-cover"
        }
      />
      {photo.caption && (
        <figcaption className="shrink-0 border-t-[0.3mm] border-solid border-[#333] px-[2mm] py-[1mm] text-center text-[10.5pt]">
          {photo.caption}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * 공지문 모듈 A4 렌더러 (210×297mm) — 결재 파생 공고문(notice-paper.tsx)과 같은
 * 서식 언어: 3분할 헤더(문서번호·게시장소 / 큰 격 이름 / 게시일·게시기간) → 청색 괘선
 * → 대제목. 본문만 두 격으로 갈린다: 안내문 = 인사 → 개요 표 → ▶협조 사항 → 맺음 /
 * 공고문 = 도입 → 개요 표 → 개조식.
 *
 * 활자 14pt 기준 — 게시물은 승강기 벽에서 1m 밖에서 읽는다(기안서 11.5pt와 다른 거리).
 */
export function NoticePostPaper({
  draft,
  kind,
  docNo,
  place,
  postFrom,
  postTo,
  office,
  tel,
  sealImage,
  logoImage,
  photos = [],
  id = "a4-sheet",
}: {
  draft: NoticePostDraft;
  kind: NoticeKind;
  docNo: string;
  /** 게시장소·게시기간 — 게시 설정 카드에서 고친다 (결재 파생 공고문과 같은 실무) */
  place: string;
  postFrom: string;
  postTo: string;
  /** 하단 명의 (예: "행복아파트 관리사무소장") */
  office: string;
  tel?: string | null;
  sealImage?: string | null;
  logoImage?: string | null;
  /** 사진대지 — noticePhotos()가 만든 렌더 행. 없으면 A4는 사진 이전과 동일 */
  photos?: { id: string; caption: string }[];
  id?: string;
}) {
  const th =
    "w-[16mm] border border-[#2456A6] bg-[#EAF0FA] px-[1.8mm] py-[1mm] text-center font-bold whitespace-nowrap text-[#16324F]";
  const td = "border border-[#2456A6] px-[1.8mm] py-[1mm]";

  // 2장씩 한 행 — 홀수 마지막 행은 왼쪽 1장
  const photoRows: (typeof photos)[] = [];
  for (let i = 0; i < photos.length; i += 2)
    photoRows.push(photos.slice(i, i + 2));

  return (
    <div
      id={id}
      className="flex w-full max-w-[210mm] shrink-0 flex-col border bg-white px-[15mm] pt-[14mm] pb-[12mm] text-[14pt] leading-[1.65] text-[#111] shadow-sm lg:min-h-[297mm] lg:w-[210mm] print:border-0 print:shadow-none print:[zoom:var(--print-fit,1)]"
    >
      {/* 3분할 헤더 — notice-paper.tsx와 같은 규격 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[5mm]">
        <table className="w-full max-w-[52mm] border-collapse text-[8.5pt]">
          <tbody>
            <tr>
              <th className={th}>문서번호</th>
              {/* 채번에 한글이 섞여("공지-2026-0003") mono는 글리프가 없다 — 폰트만 튄다 */}
              <td className={td}>{docNo}</td>
            </tr>
            <tr>
              <th className={th}>게시장소</th>
              <td className={td}>{place}</td>
            </tr>
          </tbody>
        </table>
        <div className="text-center text-[25pt] font-extrabold tracking-[.5em] indent-[.5em] whitespace-nowrap">
          {kind === "official" ? "공 고 문" : "안 내 문"}
        </div>
        <table className="ml-auto w-full max-w-[52mm] border-collapse text-[8.5pt]">
          <tbody>
            <tr>
              <th className={th}>게 시 일</th>
              <td className={td}>{postFrom} 부터</td>
            </tr>
            <tr>
              <th className={th}>게시기간</th>
              <td className={td}>{postTo} 까지</td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr className="mt-[4mm] mb-[9mm] border-0 border-t-2 border-[#2456A6]" />

      <h2 className="mb-[8mm] text-center text-[21pt] font-extrabold tracking-[.02em] text-[#2456A6]">
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

      {/* 맺음말 아래·명의 위 — 1장은 폭 100mm 중앙, 2장 이상은 2장씩 행.
          grid가 아니라 블록 행인 이유: 인쇄 엔진이 flex·grid 안의 break-inside를
          무시해서 박스가 페이지 경계선에 걸쳐 잘렸다 — 행 단위로 통째 넘긴다.
          내용이 한 장을 넘치면 PrintFitOnePage가 인쇄만 축소해 한 장에 맞춘다 */}
      {photos.length > 0 && (
        <div className="mt-[5mm]">
          {photoRows.map((row, i) => (
            <div
              key={i}
              className="mb-[4mm] flex gap-[4mm] break-inside-avoid last:mb-0"
            >
              {row.map((p) => (
                <PhotoBox key={p.id} photo={p} single={photos.length === 1} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* 괘선·명의·전화는 한 덩어리로만 페이지를 넘긴다 — 내용이 한 장을 살짝
          넘치면 전화번호 줄만 홀로 다음 페이지로 떨어졌다 */}
      <div className="break-inside-avoid">
        {/* 위 간격은 고정 — flex-1 스페이서는 내용이 길면 0으로 접혀 사진 박스가 괘선에 붙었다 */}
        <hr className="mt-[5mm] mb-[5mm] border-0 border-t-[3px] border-[#2456A6]" />
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
          <p className="mt-[2.5mm] text-center text-[11pt] text-[#222]">
            {tel}
          </p>
        )}
      </div>
    </div>
  );
}
