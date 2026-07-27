/**
 * 기안·품의 모듈 공용 클래스 — 올림 목업의 박스 구성을 쓰되,
 * **글자 크기는 프로젝트 공용 타이포 체계**(text-sm/text-xs)를 따른다.
 * 목업에서 가져오는 것은 레이아웃·색(`--gian-*`)이고 px 폰트는 가져오지 않는다.
 * 버튼은 공용 `Button`(buttonVariants)을 쓴다 — 여기에 버튼 클래스는 없다.
 */

/** 목업 `.panel` — 사이드 패널 박스 */
export const panel =
  "rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] px-4 py-4";

/** 목업 `.panel h4` — 패널 제목 */
export const panelTitle =
  "mb-2.5 text-xs font-bold uppercase tracking-[.12em] text-[var(--gian-ink-soft)]";

/** 목업 `.panel li` — 항목 사이 실선 구분 */
export const panelItem =
  "flex items-start gap-2 py-1.5 text-sm [&+&]:border-t [&+&]:border-[var(--gian-line)]";

/** 목업 `.field input` — 입력칸 (공용 타이포) */
export const fieldInput =
  "w-full rounded-md border border-[var(--gian-line-strong)] bg-[var(--gian-paper)] px-3 py-2 text-sm text-[var(--gian-ink)] outline-offset-1 focus:outline-2 focus:outline-[var(--gian-navy)]";

/** 목업 `.field label` */
export const fieldLabel = "mb-1.5 flex items-baseline gap-2 text-sm font-bold";
