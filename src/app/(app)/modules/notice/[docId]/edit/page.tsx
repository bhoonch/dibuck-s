import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import { itemsToText, type NoticePostDraft } from "@/lib/notice-catalog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fieldInput, fieldLabel } from "@/components/gian-ui";
import { saveNoticePostBody } from "../../actions";

/**
 * 공지문 본문 수정 — 결재 파생 공고문의 수정 화면(NoticeEdit)과 같은 구조.
 * 줄바꿈이 곧 항목 하나이고, 구조는 유지한 채 글자만 고친다.
 * 게시장소·게시기간은 문서 화면의 게시 설정에서 따로 고친다(붙이는 실무에 가깝다).
 */
export default async function NoticeEditPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "notice"))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "notice", moduleId: "notice" },
  });
  if (!doc) notFound();
  const canEdit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;
  if (doc.status === "void" || !canEdit) redirect(`/modules/notice/${docId}`);

  const draft = ((doc.meta ?? {}) as { draft?: NoticePostDraft }).draft ?? {
    title: doc.title,
    intro: "",
    items: [],
    bodyLines: doc.content.split("\n").filter(Boolean),
    closing: "",
    needsClarification: [],
  };

  return (
    <form action={saveNoticePostBody} className="mx-auto max-w-[794px]">
      <input type="hidden" name="docId" value={doc.id} />
      <Link
        href={`/modules/notice/${doc.id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        게시물로 돌아가기
      </Link>
      <PageHeader
        title="공지문 수정"
        description="입주민에게 붙는 글입니다. 줄바꿈이 곧 항목 하나입니다."
      />

      <div className="space-y-4 rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] p-6 shadow-[var(--gian-shadow)]">
        <div>
          <label htmlFor="title" className={fieldLabel}>
            제목
          </label>
          <input
            id="title"
            name="title"
            className={fieldInput}
            defaultValue={draft.title}
            required
          />
        </div>

        <div>
          <label htmlFor="intro" className={fieldLabel}>
            도입 문장
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              안내문은 인사말, 공고문은 &ldquo;...공고합니다&rdquo; 문장
            </span>
          </label>
          <textarea
            id="intro"
            name="intro"
            rows={3}
            className={`${fieldInput} resize-y`}
            defaultValue={draft.intro}
          />
        </div>

        <div>
          <label htmlFor="items" className={fieldLabel}>
            개요 표
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              한 줄에 하나, &ldquo;라벨: 값&rdquo; 형식
            </span>
          </label>
          <textarea
            id="items"
            name="items"
            rows={Math.max(4, draft.items.length + 1)}
            className={`${fieldInput} resize-y font-mono text-sm`}
            defaultValue={itemsToText(draft.items)}
          />
        </div>

        <div>
          <label htmlFor="body" className={fieldLabel}>
            협조 사항·본문
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              한 줄에 하나 — 안내문은 ▶로 인쇄, 공고문은 적힌 그대로
            </span>
          </label>
          <textarea
            id="body"
            name="body"
            rows={Math.max(4, draft.bodyLines.length + 1)}
            className={`${fieldInput} resize-y font-mono text-sm`}
            defaultValue={draft.bodyLines.join("\n")}
          />
        </div>

        <div>
          <label htmlFor="closing" className={fieldLabel}>
            맺음 문구
          </label>
          <input
            id="closing"
            name="closing"
            className={fieldInput}
            defaultValue={draft.closing}
          />
        </div>

        <p className="text-xs text-[var(--gian-ink-soft)]">
          게시장소·게시기간은 게시물 화면의 게시 설정에서 고칩니다.
        </p>

        <div className="flex justify-end gap-2 border-t border-[var(--gian-line)] pt-4">
          <Button asChild variant="outline">
            <Link href={`/modules/notice/${doc.id}`}>취소</Link>
          </Button>
          <Button type="submit" size="lg">
            저장
          </Button>
        </div>
      </div>
    </form>
  );
}
