import type { ContractContext } from "./rules";

/**
 * 견적서 첨부 정책 — 판정은 전부 여기(결정적 코드). rules.ts의 분류가 입력이다.
 * 수의계약(direct)은 비교표의 업체 전부에 실물 견적서가 붙어야 상신된다:
 * 일부만 증빙하면 나머지 줄은 검증되지 않은 숫자로 결재를 통과한다.
 */

/** 파일 하나 상한 — 이미지는 브라우저가 ~250KB로 줄여 오지만 서버가 최종선이다 */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_FILES_PER_QUOTE = 3;
export const MAX_FILES_PER_DOC = 9;

export const allowedMime = (mime: string) =>
  mime.startsWith("image/") || mime === "application/pdf";

/** 상신에 모자란 증빙 설명. null이면 충분하다 */
export function quoteFileGap(
  context: ContractContext,
  quotes: { vendor: string }[],
  files: { quoteIndex: number | null }[],
): string | null {
  if (context === "none") return null; // 예산 없는 문서는 강제하지 않는다
  if (context === "bid")
    // 전자입찰은 견적서를 받는 절차가 아니다 — 산출근거 등 아무 증빙 1장
    return files.length > 0
      ? null
      : "추정가격 산출근거 등 증빙 서류 1건이 필요합니다";
  // direct: 비교표에 실린 업체 전부 — 문서 단위 첨부는 업체 증빙을 대신하지 못한다
  const missing = quotes
    .map((q, i) => (files.some((x) => x.quoteIndex === i) ? null : q.vendor))
    .filter((v): v is string => !!v);
  return missing.length > 0
    ? `${missing.join("·")}의 견적서가 첨부되지 않았습니다`
    : null;
}

export type QuoteWaiver = { reason: string; byName: string; at: string };

/**
 * 화면·인쇄물에 찍는 미첨부 사유 한 줄. 증빙이 채워졌으면 null.
 * 문서 화면과 외부 결재자 서명 페이지가 같은 문장을 쓰도록 여기서만 만든다 —
 * 각자 포맷하면 두 화면의 결재자가 다른 것을 보게 된다.
 */
export function waiverNoteOf(
  context: ContractContext,
  quotes: { vendor: string }[],
  files: { quoteIndex: number | null }[],
  waiver?: QuoteWaiver | null,
): string | null {
  if (!waiver) return null;
  // 반려 후 파일을 채우면 사유는 낡은 값이 된다 — 지우지 않고 판정에서 뺀다
  return quoteFileGap(context, quotes, files)
    ? `※ 견적서 미첨부 — 사유: ${waiver.reason} (${waiver.at} ${waiver.byName})`
    : null;
}
