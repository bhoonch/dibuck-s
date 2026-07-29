/**
 * 인용 가능한 법령 화이트리스트 — LLM이 지어낸 근거를 결재 문서에 싣지 않기 위한 관문.
 *
 * 왜 이 방식인가: 관련근거는 LLM이 쓰지만(claude.ts), 프롬프트로 "확실한 것만 써라"라고
 * 부탁하는 건 보장이 아니다. 조 번호 하나가 틀린 채 결재를 받으면 그 문서는 없는 근거를
 * 인용한 공문이 된다. 그래서 **출력을 이 목록과 대조**해 통과한 것만 근거로 인쇄하고,
 * 목록에 없는 것은 버리지 않고 "확인 필요"로 넘겨 작성자가 판단하게 한다.
 *
 * 조문 원문은 담지 않는다 — 기안문의 관련근거는 인용 줄이지 조문 전문이 아니고,
 * 원문을 베껴 보관하면 개정 추적 부담만 진다. 원문 확인은 국가법령정보센터(law.go.kr).
 *
 * ⚠️ **항목을 추가할 때는 반드시 국가법령정보센터에서 조 번호와 조 제목을 확인할 것.**
 * 여기에 틀린 항목을 넣으면 검증을 통과한 얼굴로 틀린 근거가 인쇄된다 — 지금보다 나쁘다.
 * `title`은 확인된 것만 적는다. 없으면 생략하고 법령명 + 조 번호만 인쇄한다.
 *
 * 지금 목록은 프롬프트의 few-shot 예시(claude.ts)가 실제로 쓰는 것만 담은 최소 집합이다.
 * 운영하며 "관련근거 확인 필요"로 자주 떨어지는 조항이 보이면 확인 후 여기에 추가한다.
 *
 * ponytail: 정적 목록. 법이 개정되면 이 파일을 고친다 — 법령 API·RAG는 대상 법령이
 * 네댓 개뿐인 이 규모에서 과하고, 개정 빈도보다 종속성 비용이 크다.
 */

export type LegalSource = {
  law: string;
  /** 조 번호. 없으면 법령·고시 이름만으로 인용한다(지침 등) */
  article?: number;
  /** 조 제목 — 확인된 것만. 없으면 인쇄에서 생략한다 */
  title?: string;
  /** 이름 뒤에 붙는 꼬리말 (예: "(국토교통부 고시)") */
  suffix?: string;
};

export const LEGAL_SOURCES: LegalSource[] = [
  { law: "공동주택관리법", article: 25 },
  { law: "공동주택관리법", article: 29, title: "장기수선계획" },
  { law: "공동주택관리법", article: 30, title: "장기수선충당금의 적립" },
  { law: "공동주택관리법", article: 63, title: "관리주체의 업무" },
  { law: "공동주택관리법 시행령", article: 19 },
  { law: "주택관리업자 및 사업자 선정지침", suffix: "(국토교통부 고시)" },
];

/** 인쇄되는 형태 — 목록이 정본이므로 LLM이 쓴 표기 흔들림은 여기서 교정된다 */
export function canonical(s: LegalSource): string {
  if (s.article === undefined) return `${s.law}${s.suffix ? ` ${s.suffix}` : ""}`;
  return `${s.law} 제${s.article}조${s.title ? `(${s.title})` : ""}`;
}

const squash = (s: string) => s.replace(/\s+/g, "");

/**
 * 인용 한 줄에서 법령명과 조 번호를 뽑는다. 대조 실패는 null.
 * 조 제목은 보지 않는다 — 제목이 틀렸더라도 조 번호가 맞으면 목록의 제목으로 교정된다.
 */
function parse(item: string): LegalSource | null {
  // "가. " 같은 항목 기호와 앞뒤 공백을 걷어낸다
  const t = item.replace(/^\s*[가-힣]\s*\.\s*/, "").trim();
  if (!t) return null;
  // "제29·30조"처럼 여러 조를 한 항목에 묶은 인용은 한 조로 줄여 적을 수 없다 — 확인 대상
  if (/\d\s*[·,]\s*\d/.test(t)) return null;

  const m = t.match(/^(.+?)\s*제\s*(\d+)\s*조/);
  if (m) {
    const law = squash(m[1]);
    const article = Number(m[2]);
    return LEGAL_SOURCES.find((s) => squash(s.law) === law && s.article === article) ?? null;
  }
  // 조 번호 없는 인용(지침·고시) — 괄호 주석을 떼고 이름만 비교한다
  const name = squash(t.replace(/\(.*?\)/g, ""));
  return (
    LEGAL_SOURCES.find((s) => s.article === undefined && squash(s.law) === name) ?? null
  );
}

/**
 * LLM이 쓴 관련근거를 검증한다.
 *
 * @param items LLM 출력(draft.legalBasis)
 * @param tenantClause 단지가 설정에 입력한 관리규약 전결 조항. 우리가 프롬프트에 넣어 준
 *   값이므로 그대로 인용됐다면 통과시킨다 — 단지가 입력한 사실이지 LLM의 창작이 아니다.
 * @returns basis=인쇄할 근거(정본 표기, 중복 제거) / unverified=확인이 필요한 원문
 */
export function verifyLegalBasis(
  items: string[],
  tenantClause?: string | null,
): { basis: string[]; unverified: string[] } {
  const clause = tenantClause?.trim();
  const basis: string[] = [];
  const unverified: string[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;

    // 관리규약은 단지마다 다르므로 목록으로 검증할 수 없다. 우리가 준 조항 문자열을
    // 그대로 인용했는지만 본다 — "관리규약"과 그 조항이 함께 있어야 통과.
    const isTenantRule =
      !!clause &&
      squash(item).includes("관리규약") &&
      squash(item).includes(squash(clause));

    const text = isTenantRule ? item : (() => {
      const found = parse(item);
      return found ? canonical(found) : null;
    })();

    if (text === null) {
      if (!seen.has(item)) unverified.push(item);
      seen.add(item);
      continue;
    }
    if (seen.has(text)) continue;
    seen.add(text);
    basis.push(text);
  }
  return { basis, unverified };
}
