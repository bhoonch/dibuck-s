import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import {
  noticePhotos,
  type NoticeKind,
  type NoticePostDraft,
} from "@/lib/notice-catalog";
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
import { PrintFitOnePage } from "@/components/print-fit";
import { PrintStyle } from "@/components/gian-paper";
import { AttentionCard } from "@/components/attention-card";
import { NoticePostPaper } from "@/components/notice-post-paper";
import { NoticePosting } from "../../approvals/[docId]/notice-posting";
import { updateNoticePostPosting } from "../actions";
import { FinalizeButton } from "./finalize-button";
import { NoticePhotos } from "./notice-photos";
import { PrintButton } from "./print-button";
import { VoidButton } from "./void-button";

export default async function NoticeDocPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireTenantSession();
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
    captions?: Record<string, string>;
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
  const isDraft = doc.status === "draft";
  // 폐기본은 사진 본문(data)을 회수했다 — 빈 박스를 찍지 않게 사진대지 자체를 접는다
  const photos = voided
    ? []
    : noticePhotos(
        await db.documentAttachment.findMany({
          where: { documentId: doc.id },
          select: { id: true, mime: true },
          orderBy: { createdAt: "asc" },
        }),
        raw.captions,
      );
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  const canEdit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;
  const kindLabel = meta.kind === "official" ? "공고문" : "안내문";
  const { checked, custom } = splitPlaces(meta.place);

  return (
    <>
      <PrintStyle margin="0" />
      {/* 게시물은 무조건 한 장 — 벽에 붙이는 종이가 두 장이면 안 붙는다 */}
      <PrintFitOnePage />
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
            {doc.docNo && (
              <span className="text-sm text-[var(--gian-ink-soft)]">
                {doc.docNo}
              </span>
            )}
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
          {/* 인쇄는 완성본만 — 번호 없는 게시물이 벽에 붙으면 안 된다 */}
          <div className="flex flex-wrap gap-2">
            {!voided && !isDraft && <PrintButton />}
          </div>
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
                docNo={doc.docNo ?? "완성 시 부여"}
                place={meta.place}
                postFrom={meta.postedDate}
                postTo={meta.postTo}
                office={`${tenant.name} 관리사무소장`}
                tel={tel}
                sealImage={tenant.sealImage}
                logoImage={tenant.logoImage}
                photos={photos}
              />
            </PaperScale>
          </div>
          {/* 오른쪽은 상태·설정 자리 — 게시 설정, 그 하단에 폐기 (결재 파생 공고문과 동일) */}
          <aside className="order-1 flex flex-col gap-3 print:hidden xl:order-2 xl:sticky xl:top-5">
            {/* 완성은 이 문서에 대한 판단 — 결재 승인 버튼과 같은 오른쪽 첫 카드,
                sticky라 용지를 끝까지 훑는 동안에도 버튼이 보인다 */}
            {isDraft && (
              <Card className="p-4">
                <h4 className="mb-1.5 text-sm font-semibold">
                  내용을 확인한 뒤 완성해 주세요
                </h4>
                <p className="text-sm text-muted-foreground">
                  지금은 초안입니다. 고칠 곳은 [내용 수정]에서 고친 뒤 완성해
                  주세요.
                  <br />
                  완성하면 문서번호가 부여되고 인쇄할 수 있습니다.
                </p>
                {canEdit ? (
                  <FinalizeButton docId={doc.id} />
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    완성은 작성자 또는 마스터가 할 수 있습니다.
                  </p>
                )}
              </Card>
            )}
            {/* 사진은 문서 내용이라 게시 설정(실무) 위 — 폐기본은 본문을 회수해 패널도 접는다 */}
            {!voided && (
              <NoticePhotos docId={doc.id} photos={photos} editable={canEdit} />
            )}
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
                {canEdit && <VoidButton docId={doc.id} draft={isDraft} />}
              </NoticePosting>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
