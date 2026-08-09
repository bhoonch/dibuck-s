/**
 * 폰으로 찍은 사진(5MB급)을 올리기 전에 브라우저에서 줄인다 — 장변 maxPx WebP.
 * 라이브러리 없이 canvas만. 클라이언트 컴포넌트 전용(DOM API).
 *
 * maxPx 기준: 2000px ≈ A4 171DPI — 견적서·성적서 표의 작은 글씨까지 읽힌다.
 * 1200px ≈ 인쇄 300DPI — 공지문에 싣는 장면 사진이면 넉넉하고 용량이 1/3이다.
 */

/** 디코드 실패(HEIC 등)·이미지 아님이면 null — A4에 찍어야 하는 호출자는 거부한다 */
export async function tryShrinkImage(
  file: File,
  maxPx = 2000,
): Promise<File | null> {
  if (!file.type.startsWith("image/")) return null;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return null;
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 500 * 1024) return file; // 이미 작으면 그대로
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/webp", 0.8),
  );
  if (!blob) return file; // 디코드는 됐으니 렌더는 된다 — 인코딩 실패만 원본으로
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
    type: "image/webp",
  });
}

/** 실패하면 원본 그대로 — 다운로드형 첨부(견적서·성적서)용. 서버 3MB 상한이 최종선이다 */
export async function shrinkImage(file: File, maxPx = 2000): Promise<File> {
  return (await tryShrinkImage(file, maxPx)) ?? file;
}
