/**
 * 토스페이먼츠 자동결제(빌링) API.
 *
 * 카드번호는 우리 서버를 통과하지 않는다 — 결제창에서 인증받은 `authKey`를
 * 빌링키로 바꿔 저장하고, 이후 결제는 그 키로만 한다(PCI 범위 밖).
 *
 * 키가 없으면 결제 기능 전체가 꺼진 상태로 동작한다(카카오·SMTP와 같은 규칙).
 */
const SECRET = process.env.TOSS_SECRET_KEY;
const API = "https://api.tosspayments.com/v1";

/** 결제 기능이 켜져 있는가 — 화면과 크론이 이걸로 분기한다 */
export function tossEnabled() {
  return !!(SECRET && process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);
}

/** 토스가 돌려주는 실패 — code로 원인을 구분하고 message를 사용자에게 보여준다 */
export class TossError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 응답을 기다리는 한도. 승인은 카드사까지 다녀오느라 길다 — 짧게 끊으면 멀쩡한
 * 결제를 우리가 먼저 포기한다. 여기서 끊겨도 주문번호 대사(settledPayment)로
 * 복구되므로, 한도가 없어 크론이 영영 매달리는 쪽이 더 나쁘다.
 */
const TIMEOUT_MS = 30_000;

/** body가 있으면 POST, 없으면 GET */
async function call(path: string, body?: unknown) {
  if (!SECRET) throw new TossError("NO_KEY", "결제가 설정되지 않았습니다.");
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      // 시크릿 키 뒤 콜론까지 포함해서 base64 — 콜론을 빼면 401이 난다
      Authorization: `Basic ${Buffer.from(`${SECRET}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok)
    throw new TossError(json.code ?? "UNKNOWN", json.message ?? "결제 처리에 실패했습니다.");
  return json;
}

export type IssuedBilling = {
  billingKey: string;
  card?: { company?: string; number?: string };
};

/** 결제창 인증 성공으로 받은 authKey를 영구 빌링키로 교환 */
export function issueBillingKey(authKey: string, customerKey: string) {
  return call("/billing/authorizations/issue", {
    authKey,
    customerKey,
  }) as Promise<IssuedBilling>;
}

export type TossPayment = {
  paymentKey: string;
  orderId: string;
  totalAmount: number;
  /** READY·IN_PROGRESS·DONE·CANCELED·ABORTED… — 승인된 건 DONE 하나뿐이다 */
  status?: string;
  receipt?: { url?: string };
};

/**
 * 주문번호로 **승인된** 결제를 찾는다 — 대사(對査)용.
 *
 * 결제 요청이 실패로 보여도 승인은 끝나고 응답만 유실된 경우가 있다(타임아웃, 5xx).
 * 그대로 실패로 적으면 다음 시도가 새 주문번호로 한 번 더 결제해 이중 출금이 된다.
 *
 * "모르겠다"(네트워크 실패·키 없음·조회 자체 실패)는 null로 접는다 — 호출자는
 * 어차피 실패로 처리하고, 다음 시도 입구에서 같은 주문번호를 다시 대사한다.
 */
export async function settledPayment(orderId: string): Promise<TossPayment | null> {
  if (!SECRET) return null;
  try {
    const p = (await call(
      `/payments/orders/${encodeURIComponent(orderId)}`,
    )) as TossPayment;
    return p.status === "DONE" ? p : null;
  } catch (err) {
    // 애초에 승인이 없었으면 404 — 이건 정상적인 "아니오"다
    if (err instanceof TossError && err.code === "NOT_FOUND_PAYMENT") return null;
    console.error("[toss] 결제 대사 조회 실패", orderId, err);
    return null;
  }
}

/** 빌링키로 자동결제 승인. customerKey가 빌링키와 짝이 아니면 토스가 거부한다 */
export function chargeBilling(
  billingKey: string,
  args: {
    customerKey: string;
    amount: number;
    orderId: string;
    orderName: string;
    customerEmail?: string;
    customerName?: string;
  },
) {
  return call(`/billing/${billingKey}`, args) as Promise<TossPayment>;
}
