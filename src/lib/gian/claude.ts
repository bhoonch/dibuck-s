import Anthropic from "@anthropic-ai/sdk";
import { type Classification, formatMoney } from "./rules";
import { LEGAL_SOURCES, canonical, verifyLegalBasis } from "./legal-sources";

/**
 * 기안·품의 초안 생성 — Claude API (structured outputs + 프롬프트 캐싱).
 *
 * 역할 분담(올림 설계 원칙): 금액 판정·결재선·계약 방식 같은 결정적 값은
 * rules.ts가 이미 끝냈고 여기서는 **주입만** 한다. LLM은 분류하지 않는다 —
 * 법적 근거 추론과 개조식 작문만 담당한다.
 *
 * ANTHROPIC_API_KEY가 없으면 모듈 화면이 "준비 중"으로 안내한다(SMTP·토스와 같은 규칙).
 */

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

/** 문서당 비용 통제 — 모델은 minutes 프로젝트에서 확정(Sonnet 5, ~15원/건) */
const MODEL = "claude-sonnet-5";

export type GianDraft = {
  title: string;
  legalBasis: string[];
  sections: { heading: string; lines: string[] }[];
  attachments: string[];
  legalNotices: string[];
  needsClarification: string[];
};

export type GianFormInput = {
  work: string; // 공사·사업명 (기안이면 안건명)
  location: string;
  why: string;
  schedule: string;
  quotes: { vendor: string; amount: number }[]; // 수의계약 견적 (최저가 선정)
};

/* 출력 스키마 — structured outputs가 강제하므로 파싱 실패가 없다 */
const DRAFT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string", description: "'~의 건'으로 끝나는 문서 제목" },
    legalBasis: {
      type: "array",
      items: { type: "string" },
      description: "관련근거 항목 — 법령 조항과 관리규약 조항",
    },
    sections: {
      type: "array",
      description:
        "제목·관련근거 다음의 본문 절들. heading은 '추진목적'처럼 번호 없이, lines는 '가.'로 시작하는 개조식 문장",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          lines: { type: "array", items: { type: "string" } },
        },
        required: ["heading", "lines"],
        additionalProperties: false,
      },
    },
    attachments: {
      type: "array",
      items: { type: "string" },
      description:
        "챙겨야 할 서류 목록 — 서류 하나당 한 항목 (예: '견적서 2부.', '사업자등록증 사본 1부.'). 인쇄물의 붙임에는 실리지 않는다(붙임은 실제 첨부파일로만 만든다) — 작성자에게 무엇을 첨부할지 알려주는 참고 목록이다",
    },
    legalNotices: {
      type: "array",
      items: { type: "string" },
      description: "작성자가 확인해야 할 법적 유의사항",
    },
    needsClarification: {
      type: "array",
      items: { type: "string" },
      description: "입력이 부족해 확인이 필요한 항목",
    },
  },
  required: [
    "title",
    "legalBasis",
    "sections",
    "attachments",
    "legalNotices",
    "needsClarification",
  ],
  additionalProperties: false,
};

/*
 * 시스템 프롬프트 + few-shot(S-APT 공용서식 원문 3종) — 고정부라 앞배치 + 캐싱.
 * 마지막 블록의 cache_control이 앞 블록 전체를 캐시한다 (Sonnet 5 최소 1,024토큰 충족).
 */
const SYSTEM = `당신은 아파트 관리사무소의 기안서·품의서 작성 전문가다. S-APT(서울시 공동주택 통합정보마당) 공용서식 규칙을 따른다.

## 작성 규칙
- 본문은 개조식: 절 안의 항목은 "가. 나. 다.", 세부 항목은 "1) 2) 3)"으로 시작한다. 문장은 "~함", "~임", "~하고자 함"으로 끝낸다.
- 관련근거는 **아래 "인용 가능한 법령" 목록에 있는 것만** 적는다. 목록에 없는 법령·조항은 아무리 관련이 있어 보여도 쓰지 않는다 — 대신 legalNotices에 "관련근거 확인 필요: ○○"으로 남긴다. **관리규약은 입력에 조항이 주어졌을 때만** 그 문자열 그대로 인용하고, 주어지지 않으면 규약 줄 자체를 쓰지 않는다 — "제○○조" 같은 빈칸을 결재 문서에 남기지 않는다.
- "주택관리업자 및 사업자 선정지침"은 **사업자를 선정·계약하는 문서에만** 인용한다. 지출이 없는 기안서(점검·행사·내부 방침)에는 넣지 않는다.
- 고시·지침의 **호수(제2023-○○○호)는 쓰지 않는다** — 개정되면 문서에 남은 호수가 틀린 근거가 된다. 이름만 인용한다.
- 제목은 반드시 "~의 건"으로 끝낸다.
- sections 순서: 기안서는 추진목적 → 주요 추진계획 → 소요예산 → 기대효과. 품의서는 품의목적 → 사업 및 지출개요 → 견적 비교(수의계약일 때) → 추진일정. 공사 추진 기안서는 추진배경 → 공사개요 및 추진계획 → 향후 추진일정(안).
- 소요예산·계약방식·계정과목이 입력에 제공되면 **제공된 문자열 그대로** 사용한다.

## 인용 가능한 법령 (관련근거는 이 목록 밖으로 나가지 않는다)
${LEGAL_SOURCES.map((s) => `- ${canonical(s)}`).join("\n")}

## 환각 금지 (가장 중요)
- 입력에 없는 수치·날짜·업체명·수량을 만들어내지 않는다. 필요한데 없으면 "○○" 또는 "(입력 필요)"로 표기하고 needsClarification에 무엇이 필요한지 적는다.
- 법령 조항은 위 목록에서만 고른다. 목록 밖 조항은 legalNotices에 "관련근거 확인 필요"로 남길 뿐 관련근거에 쓰지 않는다.`;

const FEWSHOT = `## 서식 예시 (S-APT 공용서식 원문)

### 예시 1 — 기안서 (예산 없음)
제목: 단지 내 시설물 정기점검 및 환경정비 추진의 건
관련근거: 가. 공동주택관리법 제63조(관리주체의 업무)
추진목적
  가. 동절기/해빙기 대비 단지 내 공용 시설물의 안전 상태 사전 점검
  나. 노후 및 파손 시설물 조기 발견을 통한 입주민 안전사고 예방
주요 추진계획
  가. 점검일시: 2026년 ○월 ○일(월) ~ ○월 ○일(금) (5일간)
  나. 점검대상: 각 동 옥상, 지하주차장, 어린이놀이터, 주민공동시설 등
  다. 점검항목:
    1) 지하주차장 누수 및 균열 발생 여부
    2) 어린이놀이터 시설물 파손 및 안전상태
소요예산: 해당 없음 (자체 인력 수행)
기대효과
  가. 시설물 사전 점검을 통한 대형 하자 발생 예방
  나. 입주민 주거 만족도 제고 및 안전한 단지 환경 조성
붙임: 시설물 점검표 1부

### 예시 2 — 품의서 (수의계약)
제목: 지하주차장 LED 등기구 교체공사 지출품의의 건
관련근거: 가. 공동주택관리법 시행령 제19조 / 나. 주택관리업자 및 사업자 선정지침 (국토교통부 고시)
품의목적
  가. 지하주차장 내 노후 형광등의 자주 발생하는 고장 및 침침함 해소
  나. 고효율 LED 조명 교체를 통한 공용전기료 절감 및 단지 내 밝기 개선
사업 및 지출개요
  가. 공 사 명: 지하주차장 노후 등기구 LED 교체 공사
  나. 공사위치: 지하주차장 1~2층 전구역
  다. 소요예산: 금 4,500,000원 (금사백오십만원 / VAT 포함)
  라. 계정과목: 수선유지비
  마. 계약방식: 수의계약 (비교견적 2개사 확보 후 최저가 선정)
      ※ 추정가격 500만 원 이하(VAT 제외)로 수의계약 대상임.
견적 비교
  가. A 이엔지(주): 4,500,000원 (선정)
  나. B 테크(주): 4,950,000원
추진일정
  가. 계약체결: 2026년 ○월 ○일
  나. 공사시행: 2026년 ○월 ○일 ~ ○월 ○일
붙임: 견적서 비교표 및 사업자등록증 각 1부, 공사 시방서 1부

### 예시 3 — 공사 추진 기안서 (장기수선충당금, 전자입찰)
제목: 단지 내 옥상 방수공사 추진 방침 결정의 건
관련근거: 가. 공동주택관리법 제29조(장기수선계획) / 나. 주택관리업자 및 사업자 선정지침
추진배경
  가. 각 동 옥상 우두면 노후화로 인한 최상층 세대 누수 민원 지속 발생
  나. 장기수선계획 수립 주기에 따른 적기 방수공사 시행 필요
공사개요 및 추진계획
  가. 공 사 명: 옥상 우레탄 도막 방수 재시공 공사
  나. 대상범위: 101동 ~ 105동 옥상 전구역 (총 ○○○㎡)
  다. 예상예산: 금 45,000,000원 (VAT 포함)
  라. 재원구분: 장기수선충당금 (장기수선계획 반영 항목)
  마. 사업자 선정방식: 전자입찰을 통한 경쟁입찰 (최저가 낙찰제)
향후 추진일정(안)
  가. 입주자대표회의 의결: 2026년 ○월 ○일
  나. 입찰 공고 및 현장설명회: 2026년 ○월 ○일
  다. 업체 선정 및 계약: 2026년 ○월 ○일
붙임: 옥상 누수 현황 및 시방서(안) 1부`;

const docTypeGuide: Record<Classification["docType"], string> = {
  gian: "기안서 (예산 없음, 예시 1 구성)",
  pumui: "품의서 (지출 수반, 예시 2 구성)",
  ltp_work: "공사 추진 기안서 (장기수선충당금, 예시 3 구성)",
};

const contractGuide: Record<Classification["context"], string> = {
  none: "해당 없음",
  direct:
    "수의계약 (비교견적 2개사 확보 후 최저가 선정) ※ 추정가격 500만 원 이하(VAT 제외)로 수의계약 대상임.",
  bid: "전자입찰을 통한 경쟁입찰 — 입주자대표회의 의결 후 K-apt 전자입찰",
};

export async function generateDraft(args: {
  cls: Classification;
  form: GianFormInput;
  tenantName: string;
  /** 전결 근거 조항(설정 > 결재선). 전결로 처리되는 문서에서만 관련근거에 인용한다 */
  directorLimitClause?: string | null;
}): Promise<GianDraft> {
  const { cls, form, tenantName } = args;
  const client = new Anthropic(); // ANTHROPIC_API_KEY는 env에서

  // 오늘 날짜는 캐시되는 고정부가 아니라 여기(user turn)에 넣는다 —
  // system 쪽에 넣으면 날짜가 바뀔 때마다 프롬프트 캐시가 통째로 깨진다.
  const kst = new Date(Date.now() + 9 * 3600_000);
  const today = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;

  // 결정적 값은 코드가 계산해 문자열로 주입 — LLM은 그대로 받아 적는다
  const facts = [
    `오늘 날짜: ${today} — 문서의 연도는 이 값을 쓴다. 월·일이 입력에 있으면 그대로, 없으면 "○월 ○일"로 두되 연도는 채운다.`,
    `단지명: ${tenantName}`,
    `문서 유형: ${docTypeGuide[cls.docType]}`,
    `공사·사업명(안건): ${form.work || "(입력 필요)"}`,
    `위치·대상: ${form.location || "(입력 없음)"}`,
    `사유(입력 원문): ${form.why || "(입력 없음)"}`,
    `일정(입력 원문): ${form.schedule || "(입력 없음)"}`,
    cls.amountRaw > 0
      ? `소요예산(이 표기 그대로 사용): ${formatMoney(cls.amountRaw, cls.vatIncluded)}`
      : "소요예산: 해당 없음",
    `계약방식(이 문구 그대로 사용): ${contractGuide[cls.context]}`,
    // 재원은 사용자가 고른 값을 그대로 — 예전엔 키워드 추측으로 계정과목을 적었다
    cls.amountRaw > 0
      ? cls.fund === "ltp" || cls.docType === "ltp_work"
        ? "재원구분: 장기수선충당금 (장기수선계획 반영 여부 확인 필요)"
        : cls.fund === "misc"
          ? "재원구분: 잡수입"
          : "계정과목: 수선유지비"
      : "",
    cls.amountRaw > 0 && cls.budgeted === false
      ? "예산 반영: 연간 예산 외 집행 — 본문에 '예산 외 집행' 사실을 명시한다."
      : "",
    // 규약 조항은 전결 문서에서만 — 회장 결재를 받는 문서에 전결 조항을 붙이면 근거가 어긋난다
    cls.withinDirectorLimit && args.directorLimitClause
      ? `관리규약 근거(관련근거에 이 문자열 그대로 한 항목으로 추가): 당 단지 관리규약 ${args.directorLimitClause} — 관리소장 전결 사항으로 처리하는 지출임.`
      : "",
    form.quotes.length > 0
      ? `견적(첫 업체가 최저가 선정): ${form.quotes
          .map((q) => `${q.vendor} ${q.amount.toLocaleString("ko-KR")}원`)
          .join(" / ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        text: FEWSHOT,
        cache_control: { type: "ephemeral" }, // 고정부 전체 캐시 — 이후 호출 입력비 ~1/10
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: DRAFT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `다음 입력으로 ${docTypeGuide[cls.docType]} 초안을 작성하라.\n\n${facts}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  const draft = JSON.parse(block.text) as GianDraft;

  /*
   * 관련근거 검증 — 여기가 LLM 출력이 문서로 들어가는 유일한 문턱이다.
   * 프롬프트로 목록을 줬어도 지키는지는 보장이 아니므로 나온 값을 대조한다.
   * 목록 밖 인용은 버리지 않고 유의사항으로 돌려 작성자가 판단하게 한다 —
   * 조용히 사라지면 근거가 왜 빠졌는지 알 수 없다.
   */
  const { basis, unverified } = verifyLegalBasis(
    draft.legalBasis,
    args.directorLimitClause,
  );
  return {
    ...draft,
    legalBasis: basis,
    legalNotices: [
      ...draft.legalNotices,
      ...unverified.map(
        (u) =>
          `관련근거 확인 필요: "${u}" — 확인된 법령 목록에 없어 문서에서 뺐습니다. 맞는 근거라면 초안 수정에서 직접 넣어 주세요.`,
      ),
    ],
  };
}
