import { db } from "@/lib/db";
import { koreanDateKst } from "@/lib/utils";
import type { GianDraft } from "./claude";
import { formatMoney, type Classification } from "./rules";

/**
 * 후속 문서 파생 — 결재 완료된 품의에서 완료보고서(서식 11)·지출결의서(서식 6)를 잇는다.
 *
 * S-APT 원문에서 확인된 체인: 품의(5) → … → 완료보고(11) → 지출결의(6).
 * 두 문서 모두 **원 품의에서 직접** 파생한다 — 완료보고가 지출결의의 선행 조건은 아니다
 * (용역 대금처럼 완료보고 없이 지출만 하는 경우가 있고, 서식 6의 "관련품의"도 품의를 가리킨다).
 *
 * 문구는 전부 결정적 코드 — LLM을 부르지 않는다. 두 서식은 값을 채우는 정형 문서라
 * 작문이 필요 없고, 내용의 대부분은 이미 원 품의에 있다(Phase 3 공고문과 같은 판단).
 */

export type FollowupKind = "report" | "expense";

export const followupMeta: Record<
  FollowupKind,
  { label: string; docTypeLabel: string; foot: string }
> = {
  report: {
    label: "완료보고서",
    docTypeLabel: "완 료 보 고 서",
    foot: "위와 같이 공사(용역) 완료를 보고합니다.",
  },
  expense: {
    label: "지출결의서",
    docTypeLabel: "지 출 결 의 서",
    foot: "상기 금액을 적법한 증빙에 따라 정히 지출 결의합니다.",
  },
};

/** 파생 문서의 Document.type — 채번 접두어가 여기서 갈린다(보고-/지출-) */
export const followupDocType: Record<FollowupKind, string> = {
  report: "report",
  expense: "expense",
};

export type SourceInfo = {
  docNo: string;
  title: string;
  approvedAt: Date;
  work: string;
  vendor: string;
  amountRaw: number;
  vatIncluded: boolean;
};

/** 관련근거 = 원 품의 한 줄. 파생 문서의 근거는 법령이 아니라 승인된 품의다 */
const sourceBasis = (s: SourceInfo) =>
  `${s.title} (${s.docNo}, ${koreanDateKst(s.approvedAt)} 승인)`;

export type ReportInput = {
  period: string; // 실제 공사기간
  condition: string; // 시공상태 검수 결과
  inspector: string; // 검수자
  waste?: string; // 철거폐기물 처리 (선택)
  followup?: string; // 후속조치 (기본 문구 있음)
};

const DEFAULT_FOLLOWUP =
  "공사완료확인서 교부 및 세금계산서 수령 후 대금 지급 절차 진행";

export function buildReportDraft(s: SourceInfo, input: ReportInput): GianDraft {
  const overview = [
    `가. 공 사 명: ${s.work}`,
    s.vendor ? `나. 시공업체: ${s.vendor}` : "",
    `${s.vendor ? "다" : "나"}. 공사기간: ${input.period}`,
    `${s.vendor ? "라" : "다"}. 계약금액: ${formatMoney(s.amountRaw, s.vatIncluded)}`,
  ].filter(Boolean);

  const inspection = [
    `가. 시공상태: ${input.condition}`,
    input.waste?.trim() ? `나. 철거폐기물: ${input.waste.trim()}` : "",
    `${input.waste?.trim() ? "다" : "나"}. 검 수 자: ${input.inspector}`,
  ].filter(Boolean);

  return {
    title: `${s.work} 완료보고의 건`,
    legalBasis: [sourceBasis(s)],
    sections: [
      { heading: "공사개요", lines: overview },
      { heading: "공사 완료 검수 결과", lines: inspection },
      {
        heading: "후속조치",
        lines: [input.followup?.trim() || DEFAULT_FOLLOWUP],
      },
    ],
    // 붙임은 실제 첨부파일이 정한다(attachmentLines) — 여기서 문구를 만들지 않는다
    attachments: [],
    legalNotices: [],
    needsClarification: [],
  };
}

export type ExpenseInput = {
  payDate: string; // 지출일자
  account: string; // 계정과목 [관]/[항]/[목]
  vendor: string; // 지급처(업체) 상호
  ceo: string; // 대표자
  bizNo: string; // 사업자등록번호
  bank: string; // 입금계좌
};

export function buildExpenseDraft(
  s: SourceInfo,
  input: ExpenseInput,
  today: Date,
): GianDraft {
  return {
    title: `${s.work} 지출결의의 건`,
    legalBasis: [sourceBasis(s)],
    sections: [
      {
        heading: "지출개요",
        lines: [
          `가. 발의일자: ${koreanDateKst(today)}`,
          `나. 지출일자: ${input.payDate}`,
          `다. 계정과목: ${input.account}`,
          `라. 지출금액: ${formatMoney(s.amountRaw, s.vatIncluded)}`,
        ],
      },
      { heading: "지출내역", lines: [`가. ${s.work} 대금 지급`] },
      {
        // "채권자"는 미납 관리비의 채권자(=아파트)와 헷갈린다. 여기 적히는 건
        // 상호·대표자·사업자등록번호·입금계좌, 곧 돈을 받을 곳이다.
        heading: "지급처 정보",
        lines: [
          `가. 상  호: ${input.vendor}`,
          `나. 대표자: ${input.ceo}`,
          `다. 사업자등록번호: ${input.bizNo}`,
          `라. 입금계좌: ${input.bank}`,
        ],
      },
    ],
    attachments: [],
    legalNotices: [],
    needsClarification: [],
  };
}

/**
 * 파생 문서의 결재선 재료.
 *
 * 서식 기준 단수: 완료보고서는 3단(담당→과장→소장, 회장 없음), 지출결의서는 4단(+회장).
 * 단 원 품의가 **소장 전결**로 끝났다면 그 지출의 결의서에 회장을 붙이지 않는다 —
 * 같은 지출인데 결의서에서만 회장 결재를 요구하면 전결 규정과 어긋난다.
 *
 * `context: "none"`으로 두는 이유: 견적서 첨부 가드(quoteFileGap)는 업체를 고르는
 * 문서의 요건이다. 이미 업체가 정해진 뒤의 보고·결의에 견적서를 다시 요구하면 상신이 막힌다.
 */
export function followupCls(
  source: Classification,
  kind: FollowupKind,
): Classification {
  return {
    ...source,
    docType: kind === "expense" ? "pumui" : "gian",
    context: "none",
    externalApprovers:
      kind === "expense" && !source.withinDirectorLimit ? ["CHAIR"] : [],
  };
}

/**
 * 이미 파생됐는가 — 중복 생성 방지와 역링크가 같은 조회를 쓴다(Phase 3 findNoticeFor와 동형).
 * 유니크 칸(sourceDocId)으로 조회한다 — 폐기가 칸을 비우므로(voidGian) 폐기본은 자연히
 * 빠지고(잘못 만든 보고서를 폐기한 뒤 다시 만들 수 있다), @@unique가 동시 생성도 막는다.
 */
export function findFollowupFor(sourceDocId: string, kind: FollowupKind) {
  return db.document.findUnique({
    where: { type_sourceDocId: { type: followupDocType[kind], sourceDocId } },
    select: { id: true, docNo: true },
  });
}
