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
};

/* ponytail: count+1 채번 — 동시 생성이 겹치면 중복 가능, 문제되면 DB 시퀀스로 전환 */
export async function nextDocNo(tenantId: string, type: string) {
  const year = new Date().getFullYear();
  const prefix = docNoPrefixes[type] ?? "문서";
  const count = await db.document.count({
    where: { tenantId, type, docNo: { startsWith: `${prefix}-${year}-` } },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
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
  status?: string;
  createdById?: string;
  notify?: { type: string; title: string; body?: string };
}) {
  const doc = await db.document.create({
    data: {
      tenantId,
      moduleId,
      docNo: await nextDocNo(tenantId, type),
      type,
      title,
      content,
      attachments,
      status,
      createdById,
    },
  });
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
