import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import type { GianDraft } from "@/lib/gian/claude";
import type { NoticeDoc } from "@/lib/gian/notice";
import { NoticeEdit } from "./notice-edit";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { GianSteps } from "@/components/gian-steps";
import { fieldInput, fieldLabel } from "@/components/gian-ui";
import { saveGianDraft } from "../../approval-actions";

/**
 * AI 초안 직접 수정 — 결재 전(draft·rejected) 문서만.
 * 절 구조(heading + lines)를 그대로 유지한 채 텍스트만 고친다.
 * 줄바꿈이 곧 항목이라 파서가 필요 없다(서버에서 빈 줄만 걷어낸다).
 */
export default async function EditGianPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/subscriptions");

  const { docId } = await params;
  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc || doc.tenantId !== session.tenantId || doc.moduleId !== "approvals")
    notFound();
  const meta = doc.meta as { draft?: GianDraft; notice?: NoticeDoc } | null;

  // 공고문은 결재 문서가 아니라 게시물이라 완료 뒤에도 고친다 — 원 품의는 그대로 남는다
  if (meta?.notice)
    return <NoticeEdit docId={doc.id} notice={meta.notice} readOnly={doc.status === "void"} />;

  if (!meta?.draft) notFound();
  // 결재가 시작된 문서는 내용이 바뀌면 안 된다 — 결재자가 본 것과 달라진다
  if (doc.status !== "draft" && doc.status !== "rejected")
    redirect(`/modules/approvals/${doc.id}`);

  const { draft } = meta;

  return (
    // 기둥은 다른 기안·품의 화면과 같다 — A4 폭(794)에서 시작해야 오갈 때 안 튄다
    <form
      action={saveGianDraft}
      className="mx-auto max-w-[794px] xl:max-w-[1138px]"
    >
      <input type="hidden" name="docId" value={doc.id} />
      <Link
        href={`/modules/approvals/${doc.id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        초안으로 돌아가기
      </Link>
      <PageHeader
        title="초안 수정"
        description="AI가 만든 문장을 직접 고칠 수 있습니다. 줄바꿈이 항목 하나입니다."
      />
      {/* 단계표시에서 1번을 눌러 돌아온 자리 — 어디에 서 있는지 같은 막대로 보여준다 */}
      <GianSteps current={1} />

      <div className="max-w-[794px] space-y-4 rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] p-6 shadow-[var(--gian-shadow)]">
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
          <label htmlFor="legalBasis" className={fieldLabel}>
            관련 근거
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              한 줄에 하나
            </span>
          </label>
          <textarea
            id="legalBasis"
            name="legalBasis"
            rows={3}
            className={`${fieldInput} resize-y`}
            defaultValue={draft.legalBasis.join("\n")}
          />
        </div>

        {draft.sections.map((sec, i) => (
          <div key={i} className="rounded-md border border-[var(--gian-line)] p-3">
            <label htmlFor={`heading${i}`} className={fieldLabel}>
              {i + 2}. 절 제목
            </label>
            <input
              id={`heading${i}`}
              name={`heading${i}`}
              className={fieldInput}
              defaultValue={sec.heading}
            />
            <label htmlFor={`lines${i}`} className={`${fieldLabel} mt-3`}>
              본문
              <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
                &quot;가. 공 사 명: …&quot; 처럼 공백을 넣으면 그대로 인쇄됩니다
              </span>
            </label>
            <textarea
              id={`lines${i}`}
              name={`lines${i}`}
              rows={Math.max(3, sec.lines.length + 1)}
              className={`${fieldInput} resize-y font-mono text-xs`}
              defaultValue={sec.lines.join("\n")}
            />
          </div>
        ))}

        {/* 붙임은 여기서 안 고친다 — 실제 첨부파일이 곧 붙임 목록이다 (문서 화면의 첨부파일 카드) */}
        <p className="text-xs text-[var(--gian-ink-soft)]">
          붙임 목록은 문서 화면의 &lsquo;첨부파일&rsquo;에 올린 파일로 자동
          작성됩니다.
        </p>

        <div className="flex justify-end gap-2 border-t border-[var(--gian-line)] pt-4">
          <Button asChild variant="outline">
            <Link href={`/modules/approvals/${doc.id}`}>취소</Link>
          </Button>
          <Button type="submit" size="lg">
            저장
          </Button>
        </div>
      </div>
    </form>
  );
}
