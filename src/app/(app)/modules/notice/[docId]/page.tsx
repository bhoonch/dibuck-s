import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import type { NoticeKind, NoticePostDraft } from "@/lib/notice-catalog";
import {
  DEFAULT_PLACES,
  DEFAULT_POST_TO,
  NOTICE_PLACES,
  splitPlaces,
} from "@/lib/gian/notice";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { ymdKst } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { AttentionCard } from "@/components/attention-card";
import { NoticePostPaper } from "@/components/notice-post-paper";
import { NoticePosting } from "../../approvals/[docId]/notice-posting";
import { updateNoticePostPosting } from "../actions";
import { PrintButton } from "./print-button";
import { VoidButton } from "./void-button";

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
    place?: string;
    postTo?: string;
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
    place: raw.place ?? DEFAULT_PLACES.join(", "),
    postTo: raw.postTo ?? DEFAULT_POST_TO,
  };
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true, phone: true, fax: true, sealImage: true, logoImage: true },
  });
  const tel = [
    tenant.phone && `TEL : ${tenant.phone}`,
    tenant.fax && `FAX : ${tenant.fax}`,
  ]
    .filter(Boolean)
    .join(" / ");
  const voided = doc.status === "void";
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  const canEdit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;
  const kindLabel = meta.kind === "official" ? "공고문" : "안내문";
  const { checked, custom } = splitPlaces(meta.place);

  return (
    <>
      <PrintStyle margin="0" />
      {/* 결재 파생 공고문 화면과 같은 기둥 — A4 794 + 패널 320 */}
      <div className="mx-auto max-w-[794px] xl:max-w-[1138px]">
        {/* 목록은 이 문서에 하는 일이 아니라 뒤로 가기다 — 액션 버튼 무리에서 뺀다 */}
        <Link
          href="/modules/notice"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" />
          목록
        </Link>

        {/* 머리줄은 아래 격자와 같은 두 칸 — 인쇄 버튼의 왼쪽 시작선이 오른쪽 카드와 맞는다 */}
        <div className="mb-3.5 grid gap-x-6 gap-y-3 print:hidden xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded border-[1.5px] border-[var(--gian-stamp)] py-1 pr-3 pl-3.5 text-sm font-bold tracking-[.18em] text-[var(--gian-stamp)]">
              {kindLabel}
            </span>
            <span className="text-sm text-[var(--gian-ink-soft)]">{doc.docNo}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {docStatusLabels[doc.status] ?? doc.status}
            </span>
            {/* 입주민에게 붙는 글이라 오타 하나로 폐기·재생성을 시키지 않는다 */}
            {!voided && canEdit && (
              <Button asChild variant="outline" className="ml-auto">
                <Link href={`/modules/notice/${doc.id}/edit`}>내용 수정</Link>
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">{!voided && <PrintButton />}</div>
        </div>

        {/* "지금 채워야 할 것"은 격자 위 전체 폭 — 오른쪽은 상태·설정 자리라 섞지 않는다 */}
        {!voided && meta.draft.needsClarification.length > 0 && (
          <AttentionCard className="mb-4" title="게시 전 확인이 필요합니다">
            {meta.draft.needsClarification.join(" · ")} — [내용 수정]에서 고칠 수
            있습니다.
          </AttentionCard>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="order-2 min-w-0 xl:order-1">
            <PaperScale>
              <NoticePostPaper
                draft={meta.draft}
                kind={meta.kind}
                docNo={doc.docNo ?? ""}
                place={meta.place}
                postFrom={meta.postedDate}
                postTo={meta.postTo}
                office={`${tenant.name} 관리사무소장`}
                tel={tel}
                sealImage={tenant.sealImage}
                logoImage={tenant.logoImage}
              />
            </PaperScale>
          </div>
          {/* 오른쪽은 상태·설정 자리 — 게시 설정, 그 하단에 폐기 (결재 파생 공고문과 동일) */}
          <aside className="order-1 flex flex-col gap-3 print:hidden xl:order-2 xl:sticky xl:top-5">
            {voided ? (
              <Card className="p-4 text-sm text-muted-foreground">
                폐기된 게시물입니다. 기록으로만 남아 있습니다 — 같은 내용이
                필요하면 새 공지문을 만들어 주세요.
              </Card>
            ) : (
              <NoticePosting
                docId={doc.id}
                place={meta.place}
                checked={checked}
                custom={custom}
                postTo={meta.postTo}
                options={NOTICE_PLACES}
                defaultPostTo={DEFAULT_POST_TO}
                saveAction={updateNoticePostPosting}
              >
                {canEdit && <VoidButton docId={doc.id} />}
              </NoticePosting>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
