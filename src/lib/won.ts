/**
 * "39,000" 처럼 천단위 콤마·공백이 섞인 금액 입력을 정수 원으로 바꾼다.
 * Number("39,000")은 NaN이라, 안 걷어내면 가격이 조용히 0원으로 저장된다.
 */
export const parseWon = (v: unknown) =>
  Math.max(0, Number(String(v ?? "").replace(/[^0-9]/g, "")) || 0);
