/**
 * 문서 사진대지 순수 로직 — 공지문·교육일지가 같이 쓴다.
 * 클라이언트 폼이 직접 import하므로 db를 물면 안 된다(브라우저 번들 사고).
 * 검증은 `npx tsx notice-post.test.ts`.
 */

/** A4 사진대지에 말이 되는 상한 — 문서당 9장(기안 첨부)과 다르다. 2열 55mm 칸으로 두 줄 */
export const MAX_DOC_PHOTOS = 4;
/** 캡션은 사진대지 칸의 한 줄 — 길면 배치가 깨진다. 서버 액션이 이 길이로 자른다 */
export const PHOTO_CAPTION_MAX = 60;

/**
 * A4 사진대지 배치 입력 — 첨부 목록과 meta.captions 맵을 렌더 행으로 만든다.
 * 사진의 진실은 DocumentAttachment이고 captions는 부가정보다: 삭제된 사진의
 * 죽은 캡션 키는 여기서 자연히 걸러지고, 이미지 아닌 mime·상한 초과분도 잘린다.
 */
export function docPhotoRows(
  attachments: { id: string; mime: string }[],
  captions?: Record<string, string>,
): { id: string; caption: string }[] {
  return attachments
    .filter((a) => a.mime.startsWith("image/"))
    .slice(0, MAX_DOC_PHOTOS)
    .map((a) => ({ id: a.id, caption: (captions?.[a.id] ?? "").trim() }));
}
