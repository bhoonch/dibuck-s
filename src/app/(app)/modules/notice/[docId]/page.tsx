import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import {
  itemsToText,
  officialNoOf,
  type NoticeKind,
  type NoticePostDraft,
} from "@/lib/notice-catalog";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { koreanDateKst, ymdKst } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { AttentionCard } from "@/components/attention-card";
import { NoticePostPaper } from "@/components/notice-post-paper";
import { PostPanel } from "./post-panel";

export default async function NoticeDocPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "notice"))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "notice" },
  });
  if (!doc) notFound();
  // 결재 파생 공고문은 원 품의 갈래가 화면·수정·폐기를 담당한다
  if (doc.moduleId !== "notice") redirect(`/modules/approvals/${docId}`);

  const raw = (doc.meta ?? {}) as {
    draft?: NoticePostDraft;
    kind?: NoticeKind;
    postedDate?: string;
  };
  // meta.draft 없는 옛 문서(시드 데모 등)는 제목·본문 평문으로 최소 렌더
  const meta = {
    draft: raw.draft ?? {
      title: doc.title,
      intro: "",
      items: [],
      bodyLines: doc.content.split("\n").filter(Boolean),
      closing: "",
      needsClarification: [],
    },
    kind: raw.kind ?? ("guide" as NoticeKind),
    postedDate: raw.postedDate ?? ymdKst(doc.createdAt),
  };
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true, phone: true, sealImage: true, logoImage: true },
  });
  const voided = doc.status === "void";
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  const canEdit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;
  const kindLabel = meta.kind === "official" ? "공고문" : "안내문";

  return (
    <>
      <PrintStyle margin="0" />
      {/* 기안·독촉장과 같은 기둥 — A4 794 + 패널 320 */}
      <div className="mx-auto max-w-[794px] xl:max-w-[1138px]">
        <div className="mb-3.5 grid gap-x-6 gap-y-3 print:hidden xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded border-[1.5px] border-[var(--gian-stamp)] py-1 pr-3 pl-3.5 text-sm font-bold tracking-[.18em] text-[var(--gian-stamp)]">
              {kindLabel}
            </span>
            <span className="text-sm text-[var(--gian-ink-soft)]">{doc.docNo}</span>
            {voided && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles.void}`}
              >
                {docStatusLabels.void}
              </span>
            )}
            <span className="truncate text-sm text-muted-foreground">{doc.title}</span>
            <Button asChild variant="outline" size="sm" className="ml-auto">
              <Link href="/modules/notice">
                <ChevronLeft className="size-4" />
                목록
              </Link>
            </Button>
          </div>
        </div>

        {/* 게시 전 확인 — 행동을 요구하는 안내는 격자 위 전체 폭 */}
        {!voided && meta.draft.needsClarification.length > 0 && (
          <div className="mb-5 print:hidden">
            <AttentionCard title="게시 전 확인이 필요합니다">
              {meta.draft.needsClarification.join(" · ")} — 확인 후 오른쪽 [내용
              수정]에서 고칠 수 있습니다.
            </AttentionCard>
          </div>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="order-2 min-w-0 xl:order-1">
            <PaperScale>
              <NoticePostPaper
                draft={meta.draft}
                kind={meta.kind}
                officialNo={officialNoOf(doc.docNo, tenant.name)}
                postedDate={koreanDateKst(new Date(meta.postedDate))}
                office={`${tenant.name} 관리사무소장`}
                tel={tenant.phone}
                sealImage={tenant.sealImage}
                logoImage={tenant.logoImage}
              />
            </PaperScale>
          </div>
          <aside className="order-1 print:hidden xl:order-2 xl:sticky xl:top-5">
            <PostPanel
              docId={doc.id}
              voided={voided}
              canEdit={canEdit}
              initial={{
                title: meta.draft.title,
                intro: meta.draft.intro,
                itemsText: itemsToText(meta.draft.items),
                bodyText: meta.draft.bodyLines.join("\n"),
                closing: meta.draft.closing,
              }}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
