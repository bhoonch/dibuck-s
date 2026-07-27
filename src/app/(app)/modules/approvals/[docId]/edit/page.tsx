import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import type { GianDraft } from "@/lib/gian/claude";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
    redirect("/settings/subscriptions");

  const { docId } = await params;
  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc || doc.tenantId !== session.tenantId || doc.moduleId !== "approvals")
    notFound();
  const meta = doc.meta as { draft?: GianDraft } | null;
  if (!meta?.draft) notFound();
  // 결재가 시작된 문서는 내용이 바뀌면 안 된다 — 결재자가 본 것과 달라진다
  if (doc.status !== "draft" && doc.status !== "rejected")
    redirect(`/modules/approvals/${doc.id}`);

  const { draft } = meta;

  return (
    <form action={saveGianDraft} className="mx-auto max-w-[720px]">
      <input type="hidden" name="docId" value={doc.id} />
      <PageHeader
        title="초안 수정"
        description="AI가 만든 문장을 직접 고칠 수 있습니다. 줄바꿈이 항목 하나입니다."
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

        <div>
          <label htmlFor="attachments" className={fieldLabel}>
            붙임
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              한 줄에 하나, 비우면 &quot;끝.&quot;만 인쇄
            </span>
          </label>
          <textarea
            id="attachments"
            name="attachments"
            rows={2}
            className={`${fieldInput} resize-y`}
            defaultValue={draft.attachments.join("\n")}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--gian-line)] pt-4">
          <Button asChild variant="ghost">
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
