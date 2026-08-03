import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import {
  attendeesToText,
  sectionsToText,
  type AttendeeSnap,
  type TrainingDraft,
} from "@/lib/safety-training";
import { ymdKst } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fieldInput, fieldLabel } from "@/components/gian-ui";
import { saveTrainingBody } from "../../actions";

/**
 * 교육일지 내용 수정 — 공지문 수정 화면과 같은 구조. LLM 재호출 없이 저장값만 고친다.
 * 교육 내용은 빈 줄로 절(주제)을 나누고 절의 첫 줄이 주제명이다.
 */
export default async function TrainingEditPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "safety-training"))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "safety_training", moduleId: "safety-training" },
  });
  if (!doc) notFound();
  const canEdit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;
  if (doc.status === "void" || !canEdit) redirect(`/modules/safety-training/${docId}`);

  const meta = (doc.meta ?? {}) as {
    date?: string;
    place?: string;
    hours?: string;
    instructor?: string;
    draft?: TrainingDraft;
    attendees?: AttendeeSnap[];
  };
  const draft = meta.draft ?? {
    sections: [{ heading: doc.title, lines: doc.content.split("\n").filter(Boolean) }],
    closing: "",
    needsClarification: [],
  };
  const attendees = meta.attendees ?? [];
  const sectionsText = sectionsToText(draft.sections);

  return (
    <form action={saveTrainingBody} className="mx-auto max-w-[794px]">
      <input type="hidden" name="docId" value={doc.id} />
      <Link
        href={`/modules/safety-training/${doc.id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        일지로 돌아가기
      </Link>
      <PageHeader
        title="교육일지 수정"
        description="감독 점검 시 제출하는 증빙입니다. 실제 실시한 내용과 다르지 않게 고쳐 주세요."
      />

      <div className="space-y-4 rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] p-6 shadow-[var(--gian-shadow)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="date" className={fieldLabel}>
              교육일자
            </label>
            <input
              id="date"
              name="date"
              type="date"
              className={fieldInput}
              defaultValue={meta.date ?? ymdKst(doc.createdAt)}
              required
            />
          </div>
          <div>
            <label htmlFor="hours" className={fieldLabel}>
              교육시간
            </label>
            <input
              id="hours"
              name="hours"
              className={fieldInput}
              defaultValue={meta.hours ?? ""}
            />
          </div>
          <div>
            <label htmlFor="place" className={fieldLabel}>
              교육장소
            </label>
            <input
              id="place"
              name="place"
              className={fieldInput}
              defaultValue={meta.place ?? ""}
            />
          </div>
          <div>
            <label htmlFor="instructor" className={fieldLabel}>
              강사
            </label>
            <input
              id="instructor"
              name="instructor"
              className={fieldInput}
              defaultValue={meta.instructor ?? ""}
            />
          </div>
        </div>

        <div>
          <label htmlFor="sections" className={fieldLabel}>
            교육 내용
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              빈 줄로 주제를 나누고, 각 주제의 첫 줄이 주제명입니다
            </span>
          </label>
          <textarea
            id="sections"
            name="sections"
            rows={Math.max(10, sectionsText.split("\n").length + 2)}
            className={`${fieldInput} resize-y font-mono text-sm`}
            defaultValue={sectionsText}
          />
        </div>

        <div>
          <label htmlFor="closing" className={fieldLabel}>
            마무리 문구
          </label>
          <input
            id="closing"
            name="closing"
            className={fieldInput}
            defaultValue={draft.closing}
          />
        </div>

        <div>
          <label htmlFor="attendees" className={fieldLabel}>
            참석자
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              한 줄에 한 명, &ldquo;이름, 직종&rdquo; — 실제 참석자와 같아야 합니다
            </span>
          </label>
          <textarea
            id="attendees"
            name="attendees"
            rows={Math.max(4, attendees.length + 1)}
            className={`${fieldInput} resize-y font-mono text-sm`}
            defaultValue={attendeesToText(attendees)}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--gian-line)] pt-4">
          <Button asChild variant="outline">
            <Link href={`/modules/safety-training/${doc.id}`}>취소</Link>
          </Button>
          <Button type="submit" size="lg">
            저장
          </Button>
        </div>
      </div>
    </form>
  );
}
