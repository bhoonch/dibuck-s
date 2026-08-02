/**
 * 로그인·가입 같은 자격증명 경로의 시도 횟수 제한.
 *
 * ponytail: 프로세스 메모리 고정 윈도우 — 인스턴스를 여러 개 띄우면 인스턴스당 한도가 되고
 * 재시작하면 초기화된다. 단일 인스턴스에서 무제한 대입만 막는 게 목적이다.
 * 다중 인스턴스로 가면 Redis(또는 DB 테이블)로 옮길 것.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** 오래된 버킷 청소 — 맵이 무한히 자라지 않게 (호출 때마다 조금씩) */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

/**
 * @returns 0이면 **이번 시도가 한도를 넘은 것** — 차단해야 한다. 양수면 이번 시도까지
 * 포함해 앞으로 쓸 수 있는 횟수. 한도 N이면 정확히 N번 통과한다 —
 * "10분 3회" 같은 안내 문구와 실제 허용 횟수가 1 어긋나지 않게.
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return limit;
  }
  b.count++;
  return Math.max(0, limit - b.count + 1);
}

/** 성공하면 카운터를 지운다 — 정상 사용자가 다음 로그인에서 막히지 않게 */
export function rateLimitReset(key: string) {
  buckets.delete(key);
}
