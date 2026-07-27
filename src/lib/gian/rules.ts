/**
 * 기안·품의 법률 규칙 엔진 — 전부 결정적 코드, LLM 아님.
 * 금액 비교·환산·결재선·문서 분류처럼 틀리면 안 되는 판정은 여기서 끝낸다.
 * LLM(초안 생성)은 분류 결과를 입력으로 받을 뿐 스스로 판정하지 않는다.
 *
 * 법적 근거:
 * - 수의계약 한도 500만 원(VAT 제외): 주택관리업자 및 사업자 선정지침 [별표 2],
 *   국토교통부 고시 제2023-293호. 수의계약 시 2인 이상 견적 필요.
 * - 초과 시: 입주자대표회의 의결 + K-apt 전자입찰.
 * - 장기수선계획 대상 공사를 수선유지비로 집행하면 과태료 위험 (공동주택관리법 제29·30조).
 * - 결재선 단수: S-APT 공용서식 기준 — 일반 3단 / 지출 품의 4단(+회장) / 장충금 공사 5단(+감사+회장).
 */

/** 수의계약 한도 (VAT 제외 원) — 선정지침 [별표 2] */
export const DIRECT_CONTRACT_LIMIT = 5_000_000;

/** 장기수선계획 대상 가능성 키워드 — 공사명·위치·사유 전 텍스트에서 검사 */
export const LTP_KEYWORDS = [
  "승강기",
  "엘리베이터",
  "배관",
  "급수",
  "옥상",
  "방수",
  "외벽",
  "도장 공사",
  "소방",
  "발전기",
  "놀이터",
  "보안등",
  "전면 교체",
];

export type ContractContext = "none" | "direct" | "bid";
export type DocType = "gian" | "pumui" | "ltp_work"; // 기안서 / 품의서 / 공사 추진 기안서(장충금)
export type ExternalRole = "CHAIR" | "AUDITOR";

export type Classification = {
  docType: DocType;
  /** none=예산 없음 / direct=수의계약(2인 견적) / bid=입대의 의결+K-apt 전자입찰 */
  context: ContractContext;
  amountRaw: number;
  vatIncluded: boolean;
  /** VAT 제외 환산액 — 500만 비교는 반드시 이 값으로 */
  vatExcluded: number;
  isLtp: boolean;
  /** 내부 결재선 뒤에 붙는 외부 결재자, 결재 순서대로 (감사 → 회장) */
  externalApprovers: ExternalRole[];
};

/** VAT 포함 입력을 제외액으로 환산 — 포함가로 비교하면 455만~500만 구간이 오판정된다 */
export const vatExcludedOf = (amountRaw: number, vatIncluded: boolean) =>
  vatIncluded ? Math.round(amountRaw / 1.1) : amountRaw;

/** 예산·본문 텍스트로 문서 유형·계약 방식·결재선을 판정한다 */
export function classify(input: {
  amountRaw: number;
  vatIncluded: boolean;
  /** 공사명·위치·사유 등 사용자 입력 전체 — 합쳐서 장충금 키워드를 검사한다 */
  texts: string[];
}): Classification {
  const amountRaw = Math.max(0, Math.floor(input.amountRaw) || 0);
  const vatExcluded = vatExcludedOf(amountRaw, input.vatIncluded);
  const hasBudget = amountRaw > 0;
  const all = input.texts.join(" ");
  const isLtp = LTP_KEYWORDS.some((k) => all.includes(k));

  const context: ContractContext = !hasBudget
    ? "none"
    : vatExcluded <= DIRECT_CONTRACT_LIMIT
      ? "direct"
      : "bid";

  // 장충금 공사는 예산이 있어야 5단이다 — 예산 없는 장충금 언급은 일반 기안 + 경고만
  const docType: DocType =
    hasBudget && isLtp ? "ltp_work" : hasBudget ? "pumui" : "gian";

  const externalApprovers: ExternalRole[] =
    docType === "ltp_work"
      ? ["AUDITOR", "CHAIR"] // 서식 9: 담당→과장→소장→감사→회장
      : docType === "pumui"
        ? ["CHAIR"] // 서식 5·6·7·8: +회장
        : [];

  return {
    docType,
    context,
    amountRaw,
    vatIncluded: input.vatIncluded,
    vatExcluded,
    isLtp,
    externalApprovers,
  };
}

/**
 * 4,500,000 → "금사백오십만원", 10,000,000 → "금일천만원" (공문서 한글 금액 병기).
 * 변조 방지 관행에 따라 1도 생략하지 않는다 — 일십·일백·일천.
 */
export function toKoreanMoney(n: number): string {
  if (!n || n <= 0) return "";
  const digits = "일이삼사오육칠팔구";
  const small = ["", "십", "백", "천"];
  const big = ["", "만", "억", "조"];
  let s = String(Math.floor(n));
  let out = "";
  let gi = 0;
  while (s.length > 0) {
    const chunk = s.slice(-4);
    s = s.slice(0, -4);
    let part = "";
    for (let i = 0; i < chunk.length; i++) {
      const d = +chunk[chunk.length - 1 - i];
      if (d === 0) continue;
      part = digits[d - 1] + small[i] + part;
    }
    if (part) out = part + big[gi] + out;
    gi++;
  }
  return "금" + out + "원";
}

/** 공문서 금액 표기: "금 4,500,000원 (금사백오십만원 / VAT 포함)" */
export const formatMoney = (n: number, vatIncluded: boolean) =>
  `금 ${n.toLocaleString("ko-KR")}원 (${toKoreanMoney(n)} / VAT ${vatIncluded ? "포함" : "별도"})`;

export type ExternalApprover = {
  role: ExternalRole;
  name: string;
  phone?: string;
  email?: string;
};

export const externalRoleLabels: Record<ExternalRole, string> = {
  CHAIR: "입주자대표회장",
  AUDITOR: "감사",
};

/**
 * 상신 시 ApprovalStep 스냅샷 재료를 만든다.
 * 내부 결재선(Tenant.approvalLine 순서) 뒤에 분류가 요구하는 외부 결재자를 붙인다.
 * 요구되는 외부 결재자가 단지에 등록돼 있지 않으면 missing으로 알려 상신을 막는다.
 */
export function buildApprovalSteps(
  cls: Classification,
  internal: { userId: string; name: string }[],
  external: ExternalApprover[],
): {
  steps: {
    order: number;
    userId?: string;
    externalRole?: ExternalRole;
    name: string;
  }[];
  missing: ExternalRole[];
} {
  const steps = internal.map((u, i) => ({
    order: i + 1,
    userId: u.userId,
    name: u.name,
  }));
  const missing: ExternalRole[] = [];
  let order = steps.length;
  const result: {
    order: number;
    userId?: string;
    externalRole?: ExternalRole;
    name: string;
  }[] = [...steps];
  for (const role of cls.externalApprovers) {
    const person = external.find((e) => e.role === role && e.name);
    if (!person) {
      missing.push(role);
      continue;
    }
    order += 1;
    result.push({ order, externalRole: role, name: person.name });
  }
  return { steps: result, missing };
}
