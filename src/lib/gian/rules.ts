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

/** 집행 재원 — 입대의 의결 여부를 가르는 가장 큰 변수라 사용자가 직접 고른다 */
export type FundSource = "maintenance" | "ltp" | "misc";

export const fundLabels: Record<FundSource, string> = {
  maintenance: "수선유지비 (관리비)",
  ltp: "장기수선충당금",
  misc: "잡수입",
};

export type Classification = {
  docType: DocType;
  /** none=예산 없음 / direct=수의계약(2인 견적) / bid=입대의 의결+K-apt 전자입찰 */
  context: ContractContext;
  amountRaw: number;
  vatIncluded: boolean;
  /** VAT 제외 환산액 — 500만 비교는 반드시 이 값으로 */
  vatExcluded: number;
  isLtp: boolean;
  /** 사용자가 고른 재원. 예전 문서에는 없다(그때는 키워드로 추측했다) */
  fund?: FundSource;
  /** 연간 관리비 예산에 반영된 집행인가. false면 예산 외 집행 */
  budgeted?: boolean;
  /** 관리규약의 소장 전결 한도 이하라 회장(입대의) 결재를 뺐는가 */
  withinDirectorLimit: boolean;
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
  /** 공사명·위치·사유 등 사용자 입력 전체 — 재원을 안 고른 경우의 장충금 추측용 */
  texts: string[];
  /** 사용자가 고른 집행 재원. 주면 키워드 추측을 대신한다 */
  fund?: FundSource;
  /** 연간 예산에 반영된 집행인가 (기본 true — 예전 문서는 이 값이 없다) */
  budgeted?: boolean;
  /** 관리규약의 소장 전결 한도(VAT 제외, 원). 0·미설정이면 적용하지 않는다 */
  directorLimit?: number;
}): Classification {
  const amountRaw = Math.max(0, Math.floor(input.amountRaw) || 0);
  const vatExcluded = vatExcludedOf(amountRaw, input.vatIncluded);
  const hasBudget = amountRaw > 0;
  const all = input.texts.join(" ");
  // 사용자가 재원을 고르면 그게 사실이다 — 키워드는 고르지 않았을 때의 추측일 뿐.
  // 키워드만 보면 "소방 점검 안내"도 장충금으로 잡히는 오탐이 난다.
  const isLtp = input.fund
    ? input.fund === "ltp"
    : LTP_KEYWORDS.some((k) => all.includes(k));

  const context: ContractContext = !hasBudget
    ? "none"
    : vatExcluded <= DIRECT_CONTRACT_LIMIT
      ? "direct"
      : "bid";

  // 장충금 공사는 예산이 있어야 5단이다 — 예산 없는 장충금 언급은 일반 기안 + 경고만
  const docType: DocType =
    hasBudget && isLtp ? "ltp_work" : hasBudget ? "pumui" : "gian";

  /*
   * 소장 전결: 관리규약이 정한 한도 이하이고 예산에 반영된 집행이면 입대의(회장)
   * 결재 없이 관리주체가 집행한다. 장충금은 한도와 무관 — 사용계획 의결이 필수다.
   * 한도를 설정하지 않은 단지는 예전처럼 지출이면 무조건 회장이 붙는다.
   */
  const limit = Math.max(0, Math.floor(input.directorLimit ?? 0) || 0);
  const withinDirectorLimit =
    docType === "pumui" &&
    limit > 0 &&
    vatExcluded <= limit &&
    input.budgeted !== false;

  const externalApprovers: ExternalRole[] =
    docType === "ltp_work"
      ? ["AUDITOR", "CHAIR"] // 서식 9: 담당→과장→소장→감사→회장
      : docType === "pumui" && !withinDirectorLimit
        ? ["CHAIR"] // 서식 5·6·7·8: +회장
        : [];

  return {
    docType,
    context,
    amountRaw,
    vatIncluded: input.vatIncluded,
    vatExcluded,
    isLtp,
    fund: input.fund,
    budgeted: input.budgeted,
    withinDirectorLimit,
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

/** 분류에서 나오는 결정적 법적 유의사항 — LLM 출력과 병합하되 이쪽이 항상 포함된다 */
export function legalNoticesFor(cls: Classification): string[] {
  const notices: string[] = [];
  if (cls.context === "direct")
    notices.push(
      "수의계약 대상 (추정가격 500만 원 이하, VAT 제외) — 2인 이상의 견적서를 확보해야 합니다 (주택관리업자 및 사업자 선정지침 [별표 2]).",
    );
  if (cls.context === "bid")
    notices.push(
      "추정가격 500만 원(VAT 제외) 초과 — 입주자대표회의 의결 후 K-apt 전자입찰로 사업자를 선정해야 합니다.",
    );
  // 예산이 있을 때만 — 지출이 없는 문서(점검 안내 등)에 "집행하면 과태료"는 오탐이고,
  // 무의미한 경고가 쌓이면 정작 필요한 경고까지 무시하게 된다
  if (cls.docType === "ltp_work")
    notices.push(
      "장기수선계획 대상 공사일 수 있습니다 — 수선유지비로 집행하면 과태료 위험이 있습니다 (공동주택관리법 제29·30조). 장기수선충당금 사용계획과 입주자대표회의 의결 여부를 확인하세요.",
    );
  // 예산 외 집행은 금액이 작아도 의결 대상인 단지가 많다 — 전결 한도로 넘기지 않는다
  if (cls.amountRaw > 0 && cls.budgeted === false)
    notices.push(
      "연간 관리비 예산에 반영되지 않은 집행입니다 — 예산 외 집행이 입주자대표회의 의결 대상인지 관리규약에서 확인하세요.",
    );
  if (cls.fund === "misc")
    notices.push(
      "잡수입 집행입니다 — 잡수입의 사용은 관리규약이 정한 절차(의결·공개)를 따라야 합니다.",
    );
  return notices;
}

export type ExternalApprover = {
  /**
   * 저장된 값은 회장·감사 말고 "ETC"(이사·동대표 등 자유 등록)도 있다.
   * 결재선에 자동으로 붙는 건 CHAIR·AUDITOR뿐이라 `Classification.externalApprovers`는
   * 좁은 채로 두고, **저장 모양인 이쪽만** 실제와 맞춘다.
   */
  role: ExternalRole | "ETC";
  /** ETC의 역할명 (예: 이사, 동대표). 고정 역할은 externalRoleLabels가 이름을 갖는다 */
  label?: string;
  name: string;
  phone?: string;
  email?: string;
  /**
   * 상시 열람 링크 토큰 — 문서별 서명 토큰(ApprovalStep.token, 7일 만료)과 다르다.
   * 서명 토큰은 그 문서 한 건에만 쓰이고 만료되므로, 회장이 **지난 결재 건을 다시 볼**
   * 방법이 없었다. 이 토큰 하나로 `/approve/inbox/[token]`에서 자기 결재 목록을 연다.
   * 형식은 `<tenantId>.<랜덤>` — 앞부분으로 단지를 인덱스 조회하고 전체를 대조한다
   * (JSON 안을 검색하지 않아도 O(1)이다).
   */
  token?: string;
};

export const externalRoleLabels: Record<ExternalRole, string> = {
  CHAIR: "입주자대표회장",
  AUDITOR: "감사",
};

/** 등록된 외부 결재자의 표시 이름 — ETC는 직접 적은 역할명, 없으면 "위원" */
export const approverRoleLabel = (e: Pick<ExternalApprover, "role" | "label">) =>
  e.role === "ETC"
    ? e.label?.trim() || "위원"
    : externalRoleLabels[e.role];

/**
 * 상신 시 ApprovalStep 스냅샷 재료를 만든다.
 * 내부 결재선(Tenant.approvalLine 순서) 뒤에 분류가 요구하는 외부 결재자를 붙인다.
 * 요구되는 외부 결재자가 단지에 등록돼 있지 않으면 missing으로 알려 상신을 막는다.
 */
/**
 * 목록에 보여줄 "누구 차례" — 외부 결재자는 이름 대신 직함(문서 결재란과 같은 규칙).
 * 결재 중이 아닌 문서는 null이라 아무것도 그리지 않는다.
 */
export const waitingOnLabel = (
  step?: { name: string; externalRole?: string | null } | null,
): string | null =>
  step
    ? step.externalRole
      ? (externalRoleLabels[step.externalRole as ExternalRole] ?? step.name)
      : step.name
    : null;

/**
 * 결재란 첫 칸(담당)은 기안자다 — 기안 행위 자체가 그 칸의 서명이라 결재를 다시 받지 않는다.
 * 설정 결재선(단지 공통 명단)에 기안자가 들어 있어도 첫 칸으로 당기고 뒤 중복은 지운다.
 * 기안자를 모르는 문서(파생·시스템 생성)는 설정 결재선 그대로.
 */
export const orderInternalLine = (
  lineIds: string[],
  drafterId?: string | null,
): string[] =>
  drafterId
    ? [drafterId, ...lineIds.filter((id) => id !== drafterId)]
    : lineIds;

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
