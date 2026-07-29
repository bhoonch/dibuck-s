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
          docNo: await nextDocNo(tenantId, type),
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
      const duplicate =
        typeof e === "object" && e !== null && "code" in e && e.code === "P2002";
      if (!duplicate || attempt >= 4) throw e;
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
