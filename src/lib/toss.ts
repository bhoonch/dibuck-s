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

async function call(path: string, body: unknown) {
  if (!SECRET) throw new TossError("NO_KEY", "결제가 설정되지 않았습니다.");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      // 시크릿 키 뒤 콜론까지 포함해서 base64 — 콜론을 빼면 401이 난다
      Authorization: `Basic ${Buffer.from(`${SECRET}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
  receipt?: { url?: string };
};

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
