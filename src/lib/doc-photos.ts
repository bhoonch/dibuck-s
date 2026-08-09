import crypto from "node:crypto";
import { db } from "@/lib/db";
import { MAX_FILE_BYTES } from "@/lib/gian/attachments";
import { MAX_DOC_PHOTOS, PHOTO_CAPTION_MAX } from "@/lib/photo-sheet";

/**
 * 문서 사진 서버 코어 — 공지문·교육일지 액션이 같이 쓴다.
 * 소유권·상태(폐기 전 + 작성자/마스터) 검사는 각 모듈 액션이 자기 입구에서 하고,
 * 여기는 파일 내용 검증과 저장만 한다.
 */

/** 업로드 — mime·크기·장수 검증 후 저장. 브라우저가 줄여 보내지만 여기가 신뢰 경계다 */
export async function addDocPhoto(docId: string, file: unknown) {
  if (!(file instanceof File) || file.size === 0)
    return { error: "사진을 선택해 주세요." };
  // A4에 <img>로 찍혀야 한다 — PDF는 종이에 못 싣는다
  if (!file.type.startsWith("image/"))
    return { error: "사진(이미지 파일)만 실을 수 있습니다." };
  if (file.size > MAX_FILE_BYTES)
    return {
      error:
        "3MB 이하만 올릴 수 있습니다. 폰으로 찍은 사진은 자동으로 줄어듭니다.",
    };

  const count = await db.documentAttachment.count({
    where: { documentId: docId },
  });
  if (count >= MAX_DOC_PHOTOS)
    return { error: `사진은 ${MAX_DOC_PHOTOS}장까지 실을 수 있습니다.` };

  const buf = Buffer.from(await file.arrayBuffer());
  await db.documentAttachment.create({
    data: {
      documentId: docId,
      name: file.name,
      mime: file.type,
      size: buf.byteLength,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      data: buf,
    },
  });
  return undefined;
}

/** 캡션 저장 — 사진의 진실은 첨부 행이고 meta.captions는 조회용 부가정보다 */
export async function setDocPhotoCaption(
  doc: { id: string; meta: unknown },
  attachmentId: string,
  caption: string,
) {
  const meta = (doc.meta ?? {}) as { captions?: Record<string, string> };
  const captions = {
    ...meta.captions,
    [attachmentId]: caption.trim().slice(0, PHOTO_CAPTION_MAX),
  };
  await db.document.update({
    where: { id: doc.id },
    data: { meta: { ...(doc.meta as object), captions } },
  });
  return undefined;
}
