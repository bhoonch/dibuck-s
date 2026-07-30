import { db } from "@/lib/db";
import { notifyTenant } from "@/lib/notifications";

/* 문서번호 접두어 — 현장 관행(연도별 순번)에 종류 접두어를 더한 형식 */
const docNoPrefixes: Record<string, string> = {
  dunning_letter: "독촉",
  notice: "공지",
  contract: "계약",
  complaint: "민원",
  inspection: "점검",
  minutes: "회의",
  approval: "품의",
  gian: "기안",
  report: "보고", // 완료보고서 (품의에서 파생)
  expense: "지출", // 지출결의서 (품의에서 파생)
};

/**
 * 다음 문서번호. count+1이 아니라 **현재 최대 번호 + 1** 이다 —
 * count는 문서를 하나 지우면 줄어들어 이미 쓴 번호를 다시 발급한다(공문서엔 치명적).
 * 동시 생성 충돌은 @@unique([tenantId, docNo])가 막고, createDocument가 재시도한다.
 */
export async function nextDocNo(tenantId: string, type: string) {
  const year = new Date().getFullYear();
  const prefix = docNoPrefixes[type] ?? "문서";
  const head = `${prefix}-${year}-`;
  const latest = await db.document.findFirst({
    where: { tenantId, type, docNo: { startsWith: head } },
    orderBy: { docNo: "desc" },
    select: { docNo: true },
  });
  const last = Number(latest?.docNo?.slice(head.length)) || 0;
  return `${head}${String(last + 1).padStart(4, "0")}`;
}

const isDuplicate = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && e.code === "P2002";

/**
 * 아직 번호가 없는 문서에 채번해 붙인다 (상신 시점 채번).
 * 이미 번호가 있으면 그대로 둔다 — 재상신이 번호를 바꾸면 결재받은 문서와 다른 문서가 된다.
 */
export async function assignDocNo(doc: {
  id: string;
  tenantId: string;
  type: string;
  docNo: string | null;
}): Promise<string> {
  if (doc.docNo) return doc.docNo;
  for (let attempt = 0; ; attempt++) {
    const docNo = await nextDocNo(doc.tenantId, doc.type);
    try {
      await db.document.update({ where: { id: doc.id }, data: { docNo } });
      return docNo;
    } catch (e) {
      if (!isDuplicate(e) || attempt >= 4) throw e;
    }
  }
}

/**
 * 모든 모듈이 재사용하는 "문서 생성 → 공통 문서함 저장 → 알림" 패턴.
 * notify를 넘기면 문서 저장과 함께 단지 직원들에게 인앱 알림을 보낸다.
 */
export async function createDocument({
  tenantId,
  moduleId,
  type,
  title,
  content = "",
  attachments,
  meta,
  status = "draft",
  createdById,
  notify,
  numberOnSubmit,
}: {
  tenantId: string;
  moduleId?: string;
  type: string;
  title: string;
  content?: string;
  attachments?: { name: string; url: string }[];
  /** 모듈별 구조화 데이터 (Document.meta) — 재편집·파생 문서의 원천 */
  meta?: object;
  status?: string;
  createdById?: string;
  notify?: { type: string; title: string; body?: string };
  /**
   * 결재를 받는 문서는 상신할 때 채번한다 — 생성 즉시 번호를 주면 상신 전에 버린 초안이
   * 영구 결번으로 남는다(nextDocNo는 최대 번호+1이라 번호를 재사용하지 않는다).
   * 결재 없이 바로 확정되는 문서(공고문 등)는 지금처럼 생성 시 채번.
   */
  numberOnSubmit?: boolean;
}) {
  // 채번과 저장 사이에 다른 요청이 같은 번호를 가져갈 수 있다.
  // 유니크 제약이 걸리면 다시 채번해서 재시도한다 (락보다 싸고, 실패해도 조용하지 않다).
  let doc;
  for (let attempt = 0; ; attempt++) {
    try {
      doc = await db.document.create({
        data: {
          tenantId,
          moduleId,
          docNo: numberOnSubmit ? null : await nextDocNo(tenantId, type),
          type,
          title,
          content,
          attachments,
          meta,
          status,
          createdById,
        },
      });
      break;
    } catch (e) {
      if (!isDuplicate(e) || attempt >= 4) throw e;
    }
  }
  if (notify) {
    await notifyTenant({
      tenantId,
      type: notify.type,
      title: notify.title,
      body: notify.body,
      link: `/documents?q=${encodeURIComponent(doc.title)}`,
    });
  }
  return doc;
}
