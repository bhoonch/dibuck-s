/**
 * 미납 독촉 3단계 — 단계 판정·엑셀 행 해석·문안 빌더 (DB 없음, 결정적).
 * 공고문(buildNotice)과 같은 원칙: LLM을 부르지 않는다. 독촉장·내용증명은
 * 법적 표현이 정형화돼 있고, 문구가 매번 같아야 관리소장이 안심한다.
 */

export type DunningStage = 1 | 2 | 3;

export const stageLabels: Record<DunningStage, string> = {
  1: "납부 안내",
  2: "납부 최고",
  3: "내용증명",
};

export type DunningRow = {
  dong: string;
  ho: string;
  name: string | null;
  amount: number; // 원
  period: string | null; // "2026년 3월분 ~ 6월분" 자유 텍스트
};

/** 지난 발송이 남아 있고 아직 미납이면 다음 단계, 아니면 1단계부터. 3이 끝. */
export function suggestStage(
  prev?: { stage: number; paidAt: Date | null } | null,
): DunningStage {
  if (!prev || prev.paidAt) return 1;
  return Math.min(prev.stage + 1, 3) as DunningStage;
}

/**
 * (동,호)별 최신 발송 하나만 남긴다 — 그 세대의 현재 상태.
 * createdAt 내림차순으로 정렬된 입력을 전제한다(처음 만난 것이 최신).
 * 홈 집계·단계 제안·미납 세대 불러오기가 전부 이 판정을 공유한다.
 */
export function latestPerUnit<T extends { dong: string; ho: string }>(
  entriesDesc: T[],
): T[] {
  const seen = new Map<string, T>();
  for (const e of entriesDesc) {
    const k = `${e.dong}/${e.ho}`;
    if (!seen.has(k)) seen.set(k, e);
  }
  return [...seen.values()];
}

/**
 * 금액 문자열 해석 — "456,000원" → 456000. 소수점 앞까지만 취하고("456,000.00"이
 * 45,600,000이 되는 것을 막음), 음수 행은 0을 돌려줘 상위에서 건너뛰게 한다
 * ("-3,000"이 3,000 청구가 되는 것을 막음). 엑셀 파싱·직접 입력 정리가 공유한다.
 */
export const parseAmount = (v: string): number => {
  const trimmed = v.trim();
  if (!trimmed || trimmed.startsWith("-")) return 0;
  const digits = trimmed.split(".")[0].replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
};

/**
 * 엑셀 행 해석. A=동, B=호, C=미납액(필수), D=이름(선택), E=미납 기간(선택).
 * 금액이 없는 행은 합계·명부 줄이므로 조용히 건너뛴다.
 */
export function parseDunningRows(rows: unknown[][]): {
  rows: DunningRow[];
  error?: string;
} {
  const cell = (r: unknown[], i: number) => String(r[i] ?? "").trim();
  // 세대 명부 업로드와 같은 규칙 — "동"으로 끝나는 머리글은 버리고 "101동"은 살린다
  const isHeader = (v: string) => v === "동" || /^동\s*\S*$/.test(v);
  const out: DunningRow[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || !cell(r, 0) || !cell(r, 1)) continue;
    if (isHeader(cell(r, 0))) continue;
    const amount = parseAmount(cell(r, 2));
    if (!amount) continue;
    out.push({
      dong: cell(r, 0).replace(/동$/, ""),
      ho: cell(r, 1).replace(/호$/, ""),
      amount,
      name: cell(r, 3) || null,
      period: cell(r, 4) || null,
    });
  }
  if (out.length === 0)
    return {
      rows: [],
      error:
        "읽을 세대가 없습니다. A열=동, B열=호, C열=미납액 형식인지 확인해 주세요.",
    };
  return { rows: out };
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** "2026-08-15" → "2026년 8월 15일" */
export function koDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

export type DunningLetter = {
  stage: DunningStage;
  /** 상단 중앙 문서 이름 */
  kind: string;
  /** 본문 첫머리 제목 */
  title: string;
  recipient: string; // "101동 502호 홍길동 님"
  paragraphs: string[];
  table: { k: string; v: string }[];
  notes: string[];
  /** 3단계(내용증명)만 — 우체국 요건인 발신·수신 기재 */
  proof?: {
    sender: string;
    senderAddr: string;
    receiver: string;
    receiverAddr: string;
  };
};

export function buildLetter({
  row,
  stage,
  dueDate,
  account,
  office,
  address,
}: {
  row: DunningRow;
  stage: DunningStage;
  dueDate: string; // "2026-08-15"
  account: string;
  office: string; // "행복아파트 관리사무소"
  address: string | null; // 3단계 내용증명의 발신·수신 주소에 쓴다
}): DunningLetter {
  const unit = `${row.dong}동 ${row.ho}호`;
  const who = row.name ?? "입주자";
  const due = koDate(dueDate);
  const table = [
    { k: "대상 세대", v: unit },
    ...(row.period ? [{ k: "미납 기간", v: row.period }] : []),
    { k: "미납 금액", v: won(row.amount) },
    { k: "납부 기한", v: due },
    { k: "납부 계좌", v: account },
  ];
  const corrected =
    "이미 납부하셨거나 내역이 다르면 관리사무소로 알려주시기 바랍니다. 확인 후 바로 정정하겠습니다.";

  if (stage === 1)
    return {
      stage,
      kind: "관리비 납부 안내문",
      title: "관리비 납부 안내",
      recipient: `${unit} ${who} 님`,
      paragraphs: [
        `안녕하십니까. ${office}입니다.`,
        "귀 세대의 관리비가 아래와 같이 미납되어 있어 안내드립니다. 사정이 있으시겠지만 기한 내에 납부하여 주시기 바랍니다.",
      ],
      table,
      notes: [
        corrected,
        "기한 내 납부가 어려우신 경우 관리사무소와 분할 납부를 협의하실 수 있습니다.",
      ],
    };

  if (stage === 2)
    return {
      stage,
      kind: "관리비 납부 최고서",
      title: "미납 관리비 납부 최고",
      recipient: `${unit} ${who} 님`,
      paragraphs: [
        `${office}입니다. 귀 세대의 미납 관리비에 대하여 납부 안내를 드렸으나 현재까지 납부가 확인되지 않아, 관리규약에 따라 아래와 같이 납부를 최고합니다.`,
        "납부 기한까지 납부되지 아니할 경우 관리규약이 정하는 바에 따라 연체료가 부과되며, 이후 절차가 진행될 수 있음을 알려드립니다.",
      ],
      table,
      notes: [corrected],
    };

  return {
    stage,
    kind: "내용증명",
    title: "미납 관리비 납부 최고",
    recipient: `${unit} ${who} 님`,
    paragraphs: [
      "발신인은 수신인에 대하여 아래와 같이 미납 관리비의 납부를 최고합니다.",
      `수신인은 ${row.period ? `${row.period} ` : ""}관리비 합계 ${won(row.amount)}을 현재까지 납부하지 아니하였습니다. 발신인은 수차례 납부를 안내하였으나 이행되지 않았습니다.`,
      `${due}까지 위 금액을 아래 계좌로 납부하여 주시기 바랍니다.`,
      "위 기한까지 납부되지 아니할 경우 발신인은 지급명령 신청 등 법적 절차를 진행할 예정이며, 이로 인하여 발생하는 비용은 수신인에게 청구될 수 있음을 알려드립니다.",
    ],
    table,
    notes: [corrected],
    proof: {
      sender: office,
      senderAddr: address ?? "",
      receiver: `${who} (${unit})`,
      receiverAddr: [address, unit].filter(Boolean).join(" "),
    },
  };
}
