import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 이메일은 저장·조회 전에 반드시 이걸 통과시킨다.
 * Postgres의 @unique는 대소문자를 구분해서, 정규화하지 않으면 `Kim@x.com`으로 가입한
 * 사람이 `kim@x.com`으로 로그인하지 못하고 카카오 이메일 매칭도 어긋난다.
 */
export const normalizeEmail = (v: unknown) => String(v ?? "").trim().toLowerCase()

/* ── 날짜: 사용자도 서버도 한국이다. UTC로 자르면 오전 9시 이전엔 하루가 밀린다 ── */

const KST_OFFSET = 9 * 60 * 60 * 1000

/** KST 기준 "YYYY-MM-DD" */
export const ymdKst = (d: Date) =>
  new Date(d.getTime() + KST_OFFSET).toISOString().slice(0, 10)

/** KST 기준 "MM-DD" */
export const mdKst = (d: Date) => ymdKst(d).slice(5)

/** KST 기준 요일 인덱스 (0=일) */
export const dayKst = (d: Date) => new Date(d.getTime() + KST_OFFSET).getUTCDay()

/** "YYYY-MM-DD" → 그날 KST 00:00:00 */
export const kstDayStart = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`)

/** "YYYY-MM-DD" → 그날 KST 23:59:59.999 (게시 종료일이 당일 오전에 끝나지 않게) */
export const kstDayEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+09:00`)
