import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { ymdKst } from "@/lib/utils";
import type { Classification } from "./rules";

/**
 * 결재 완료 문서 → 입주민 공고문 자동 파생.
 *
 * **결재가 끝난 문서에서만** 만든다 — 승인 전에 공고가 나가면 결재 자체가 무의미해진다.
 * 재료는 원본 Document.meta.form 그대로다. 사용자 입력을 다시 받지 않는다.
 * 문구는 전부 결정적 코드 — LLM을 다시 부르지 않는다(결재 완료가 API 실패로 막히면 안 되고,
 * 공고문은 정형 문구라 작문이 필요 없다).
 *
 * 명의·연락처·직인은 스냅샷하지 않고 렌더 시점의 Tenant 값을 읽는다(연락처는 최신이 맞다).
 */

export type NoticeDoc = {
  kind: string; // "공 고 문"
  place: string; // 게시장소
  postFrom: string;
  postTo: string;
  title: string;
  intro: string;
  rows: { k: string; v: string; red?: boolean }[];
  notes: { text: string; red?: boolean }[];
};

/** 받침 유무로 조사 선택 — "공사를" / "점검을" */
export function josa(word: string, withJong: string, without: string) {
  const w = word.trim();
  const c = w.charCodeAt(w.length - 1);
  const korean = c >= 0xac00 && c <= 0xd7a3;
  return korean && (c - 0xac00) % 28 ? withJong : without;
}

export function buildNotice(input: {
  form: { work: string; location: string; why: string; schedule: string };
  docType: Classification["docType"];
  docNo: string;
  approvedAt: Date;
}): NoticeDoc {
  const { form } = input;
  const work = form.work.trim() || "안건";
  // 예산이 없는 기안(점검·행사 안내 등)에 공사 문구를 붙이면 오탐이 된다 — Phase 2의 장충금 경고와 같은 이유
  const isWork = input.docType !== "gian";
  const noun = isWork ? "공사" : "시행";

  return {
    kind: "공 고 문",
    place: "승강기, 게시판",
    postFrom: ymdKst(input.approvedAt),
    postTo: "완료 시",
    title: /안내$/.test(work) ? work : `${work} 시행 안내`,
    intro:
      `입주민 여러분께 안내 말씀드립니다. 아래와 같이 ${work}${josa(work, "을", "를")} ` +
      `시행하오니 입주민 여러분의 많은 이해와 협조를 부탁드립니다.`,
    rows: [
      { k: `${noun}일자`, v: form.schedule.trim() || "(추후 공지)", red: true },
      { k: `${noun}위치`, v: form.location.trim() || "-" },
      { k: `${noun}내용`, v: work },
      {
        k: "시행근거",
        v: `${input.docNo} (${ymdKst(input.approvedAt)} 결재 완료)`,
      },
    ],
    notes: [
      ...(form.why.trim() ? [{ text: `추진 사유: ${form.why.trim()}` }] : []),
      ...(isWork
        ? [{ text: "작업 시간대에는 해당 구역의 통행 및 주차가 일부 제한될 수 있습니다." }]
        : []),
      { text: "일정은 현장 사정에 따라 변경될 수 있습니다.", red: true },
    ],
  };
}

/** 원본 문서에서 파생된 공고문 — 중복 생성 방지와 양방향 링크가 같은 조회를 쓴다 */
export function findNoticeFor(sourceDocId: string) {
  return db.document.findFirst({
    where: {
      type: "notice",
      meta: { path: ["sourceDocId"], equals: sourceDocId },
    },
    select: { id: true, docNo: true },
  });
}

type SourceDoc = {
  id: string;
  tenantId: string;
  docNo: string | null;
  meta: unknown;
  createdById: string | null;
};

/** 결재 완료 훅에서 호출. 원본이 기안·품의가 아니거나 이미 파생됐으면 아무것도 하지 않는다 */
export async function createNoticeFrom(doc: SourceDoc) {
  const meta = doc.meta as {
    form?: { work: string; location: string; why: string; schedule: string };
    cls?: Classification;
  } | null;
  if (!meta?.form || !meta.cls) return null;
  if (await findNoticeFor(doc.id)) return null;

  const notice = buildNotice({
    form: meta.form,
    docType: meta.cls.docType,
    docNo: doc.docNo ?? "",
    approvedAt: new Date(),
  });

  return createDocument({
    tenantId: doc.tenantId,
    moduleId: "approvals",
    type: "notice",
    title: notice.title,
    // 문서함 검색용 평문 — 화면 렌더는 meta.notice가 담당한다
    content: [
      notice.intro,
      ...notice.rows.map((r) => `${r.k}: ${r.v}`),
      ...notice.notes.map((n) => n.text),
    ].join("\n"),
    meta: { sourceDocId: doc.id, notice },
    status: "final",
    createdById: doc.createdById ?? undefined,
  });
}
