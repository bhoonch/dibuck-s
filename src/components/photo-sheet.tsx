/**
 * A4 사진대지 — 공문서 관행 그대로: 실선 테두리 박스, 캡션은 박스 안 하단
 * 구분선 아래. 캡션 없는 사진은 캡션 칸 자체가 없다. 공지문·교육일지 용지가
 * 같이 쓴다.
 *
 * 2열 칸은 cover로 꽉 채운다 — 비율이 다른 사진끼리 여백이 제각각 생기지
 * 않게, 대신 칸 비율과 다른 사진은 가장자리가 잘린다. 1장짜리만 자연 비율.
 * grid가 아니라 2장씩 블록 행인 이유: 인쇄 엔진이 flex·grid 안의
 * break-inside를 무시해서 박스가 페이지 경계선에 걸쳐 잘렸다 — 행 단위로
 * 통째 넘긴다.
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

/** 1장은 폭 100mm 중앙, 2장 이상은 2장씩 행(홀수 마지막 행은 왼쪽 1장) */
export function PhotoSheet({
  photos,
}: {
  photos: { id: string; caption: string }[];
}) {
  if (photos.length === 0) return null;
  const rows: (typeof photos)[] = [];
  for (let i = 0; i < photos.length; i += 2) rows.push(photos.slice(i, i + 2));
  return (
    <div className="mt-[5mm]">
      {rows.map((row, i) => (
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
  );
}
