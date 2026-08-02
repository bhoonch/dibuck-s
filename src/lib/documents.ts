import { db } from "@/lib/db";
import { notifyTenant } from "@/lib/notifications";
import { ymdKst } from "@/lib/utils";

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

/** 연도는 KST 기준 — 서버 TZ(UTC)로 읽으면 12/31 밤 문서가 지난해 번호를 받는다 */
export function docNoHead(type: string, now = new Date()) {
  const prefix = docNoPrefixes[type] ?? "문서";
  return `${prefix}-${ymdKst(now).slice(0, 4)}-`;
}

/**
 * 다음 번호 = **숫자 최대값 + 1**. 문자열 정렬 최대값을 쓰면 10000부터
 * '9'>'1'이라 9999를 최대로 보고 10000을 또 발급 → P2002 영구 실패.
 * 숫자가 아닌 꼬리(수동 입력·이관 데이터)는 무시한다.
 */
export function nextNumberIn(docNos: string[], head: string) {
  const last = Math.max(
    0,
    ...docNos.map((n) => Number(n.slice(head.length)) || 0),
  );
  return `${head}${String(last + 1).padStart(4, "0")}`;
}

/**
 * 다음 문서번호. count+1이 아니라 **현재 최대 번호 + 1** 이다 —
 * count는 문서를 하나 지우면 줄어들어 이미 쓴 번호를 다시 발급한다(공문서엔 치명적).
 * 동시 생성 충돌은 @@unique([tenantId, docNo])가 막고, createDocument가 재시도한다.
 * ponytail: 그해 번호를 전부 읽는다 — 단지당 연 수천 건 규모라 충분하고,
 * 부담이 되면 숫자 컬럼을 따로 두는 것으로 올릴 것.
 */
export async function nextDocNo(tenantId: string, type: string) {
  const head = docNoHead(type);
  const existing = await db.document.findMany({
    where: { tenantId, type, docNo: { startsWith: head } },
    select: { docNo: true },
  });
  return nextNumberIn(existing.map((d) => d.docNo!), head);
}

const isDuplicate = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && e.code === "P2002";

/** P2002가 파생 유니크(type+sourceDocId) 쪽인가 — 채번 재시도로는 안 풀리는 충돌 */
const isSourceConflict = (e: unknown) =>
  JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("sourceDocId");

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
  sourceDocId,
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
  /**
   * 파생 문서(공고문·완료보고·지출결의)의 원본 문서 id. 넘기면 @@unique([type, sourceDocId])가
   * 동시 요청·더블클릭의 중복 파생을 DB에서 막는다 — 그 충돌(P2002)은 재시도 없이 올라온다.
   */
  sourceDocId?: string;
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
          sourceDocId,
        },
      });
      break;
    } catch (e) {
      // 재시도는 채번(docNo) 충돌만 — 새 번호로 다시 붙이면 풀린다.
      // 파생 중복(type+sourceDocId)은 몇 번을 다시 해도 같은 벽이라 즉시 올린다.
      if (!isDuplicate(e) || isSourceConflict(e) || attempt >= 4) throw e;
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
