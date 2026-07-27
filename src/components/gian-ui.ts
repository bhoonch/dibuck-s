/**
 * 기안·품의 모듈 공용 클래스 — 올림 목업(ollim-mvp-mockup.html)의 박스·버튼 스타일.
 * 컴포넌트를 새로 만들지 않고 클래스 문자열만 공유한다(쓰는 곳이 서버·클라이언트 양쪽).
 * 색은 globals.css의 `--gian-*` 토큰.
 */

/** 목업 `.panel` — 사이드 패널 박스 */
export const panel =
  "rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] px-[18px] py-4";

/** 목업 `.panel h4` — 패널 제목(대문자 자간) */
export const panelTitle =
  "mb-2.5 text-[12px] font-bold uppercase tracking-[.12em] text-[var(--gian-ink-soft)]";

/** 목업 `.panel li` — 항목 사이 실선 구분 */
export const panelItem =
  "flex items-start gap-2 py-[5px] text-[13.5px] [&+&]:border-t [&+&]:border-[var(--gian-line)]";

/** 목업 `.act-btn` — 결과 화면 액션 버튼 */
export const actBtn =
  "inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--gian-line-strong)] bg-[var(--gian-card)] px-3.5 py-2 text-[13.5px] font-semibold text-[var(--gian-ink)] transition-colors hover:border-[var(--gian-navy)] hover:text-[var(--gian-navy)] disabled:opacity-60";

/** 목업 `.act-btn.primary` */
export const actBtnPrimary =
  "inline-flex items-center gap-1.5 rounded-[5px] border border-[var(--gian-navy)] bg-[var(--gian-navy)] px-3.5 py-2 text-[13.5px] font-semibold text-[var(--gian-paper)] transition-colors hover:bg-[var(--gian-navy-deep)] disabled:opacity-60";

/** 목업 `.gen-btn` — 폼 주요 액션(전폭) */
export const genBtn =
  "mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--gian-navy)] p-[13px] text-[15.5px] font-bold text-[var(--gian-paper)] transition-colors hover:bg-[var(--gian-navy-deep)] disabled:cursor-wait disabled:opacity-65";

/** 목업 `.field input` — 입력칸 */
export const fieldInput =
  "w-full rounded-[5px] border border-[var(--gian-line-strong)] bg-[var(--gian-paper)] px-3 py-2.5 text-[15px] text-[var(--gian-ink)] outline-offset-1 focus:outline-2 focus:outline-[var(--gian-navy)]";

/** 목업 `.field label` */
export const fieldLabel =
  "mb-1.5 flex items-baseline gap-[7px] text-[13.5px] font-bold";
