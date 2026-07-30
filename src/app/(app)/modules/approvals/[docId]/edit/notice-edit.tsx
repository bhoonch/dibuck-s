import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { NoticeDoc } from "@/lib/gian/notice";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fieldInput, fieldLabel } from "@/components/gian-ui";
import { saveNoticeBody } from "../../approval-actions";

/**
 * 공고문 본문 수정 — 제목·안내문·항목·유의사항.
 * 기안 초안 수정과 같은 문법이다: 줄바꿈이 곧 항목 하나이고, 구조는 유지한 채 글자만 고친다.
 * 게시장소·게시기간·일자는 문서 화면에서 따로 고친다(그쪽이 붙이는 실무에 가깝다).
 */
export function NoticeEdit({
  docId,
  notice,
  readOnly,
}: {
  docId: string;
  notice: NoticeDoc;
  readOnly: boolean;
}) {
  if (readOnly) redirect(`/modules/approvals/${docId}`);

  return (
    <form action={saveNoticeBody} className="mx-auto max-w-[794px]">
      <input type="hidden" name="docId" value={docId} />
      <Link
        href={`/modules/approvals/${docId}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        공고문으로 돌아가기
      </Link>
      <PageHeader
        title="공고문 수정"
        description="입주민에게 붙는 글입니다. 줄 앞에 *를 붙이면 그 줄이 빨간 글씨로 인쇄됩니다."
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
            defaultValue={notice.title}
            required
          />
        </div>

        <div>
          <label htmlFor="intro" className={fieldLabel}>
            안내문
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              &ldquo;- 아 래 -&rdquo; 위에 오는 인사말
            </span>
          </label>
          <textarea
            id="intro"
            name="intro"
            rows={3}
            className={`${fieldInput} resize-y`}
            defaultValue={notice.intro}
          />
        </div>

        <div>
          <label htmlFor="rows" className={fieldLabel}>
            항목
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              한 줄에 하나, &ldquo;라벨: 값&rdquo; 형식
            </span>
          </label>
          <textarea
            id="rows"
            name="rows"
            rows={Math.max(4, notice.rows.length + 1)}
            className={`${fieldInput} resize-y font-mono text-xs`}
            defaultValue={notice.rows
              .map((r) => `${r.red ? "*" : ""}${r.k}: ${r.v}`)
              .join("\n")}
          />
        </div>

        <div>
          <label htmlFor="notes" className={fieldLabel}>
            유의사항
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              한 줄에 하나
            </span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={Math.max(3, notice.notes.length + 1)}
            className={`${fieldInput} resize-y font-mono text-xs`}
            defaultValue={notice.notes
              .map((n) => `${n.red ? "*" : ""}${n.text}`)
              .join("\n")}
          />
        </div>

        <p className="text-xs text-[var(--gian-ink-soft)]">
          게시장소·게시기간과 공사일자는 공고문 화면에서 고칩니다. 원 품의(결재
          기록)는 바뀌지 않습니다.
        </p>

        <div className="flex justify-end gap-2 border-t border-[var(--gian-line)] pt-4">
          <Button asChild variant="outline">
            <Link href={`/modules/approvals/${docId}`}>취소</Link>
          </Button>
          <Button type="submit" size="lg">
            저장
          </Button>
        </div>
      </div>
    </form>
  );
}
