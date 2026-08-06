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

/**
 * 입력칸 — **프로젝트 표준 Input(shadcn)과 같은 토큰**(테두리 border-input,
 * 배경 background, 포커스 ring). 예전엔 목업의 종이색+navy 포커스를 썼는데
 * 다른 모듈 폼과 색이 달라 통일했다(2026-08-07 사용자 지시). 높이를 안 박는
 * 이유: 이 클래스는 textarea에도 붙는다.
 */
export const fieldInput =
  "w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** 라벨 — 공용 Label(shadcn)과 같은 굵기(font-medium) */
export const fieldLabel = "mb-1.5 flex items-baseline gap-2 text-sm font-medium";
