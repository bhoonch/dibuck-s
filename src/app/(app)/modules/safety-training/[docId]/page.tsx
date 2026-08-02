import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import {
  courseTypeOf,
  type AttendeeSnap,
  type TrainingDraft,
} from "@/lib/safety-training";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { ymdKst } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { AttentionCard } from "@/components/attention-card";
import { SafetyTrainingPaper } from "@/components/safety-training-paper";
import { FinalizeButton } from "./finalize-button";
import { PrintButton } from "./print-button";
import { VoidButton } from "./void-button";

export default async function TrainingDocPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "safety-training"))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "safety_training", moduleId: "safety-training" },
  });
  if (!doc) notFound();

  const raw = (doc.meta ?? {}) as {
    courseType?: string;
    date?: string;
    place?: string;
    hours?: string;
    instructor?: string;
    draft?: TrainingDraft;
    attendees?: AttendeeSnap[];
  };
  const meta = {
    courseLabel: courseTypeOf(raw.courseType ?? "")?.label ?? "정기교육",
    date: raw.date ?? ymdKst(doc.createdAt),
    place: raw.place ?? "관리사무소",
    hours: raw.hours ?? "",
    instructor: raw.instructor ?? "",
    draft: raw.draft ?? {
      sections: [{ heading: doc.title, lines: doc.content.split("\n").filter(Boolean) }],
      closing: "",
      needsClarification: [],
    },
    attendees: raw.attendees ?? [],
  };
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });
  const voided = doc.status === "void";
  const isDraft = doc.status === "draft";
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  const canEdit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;

  return (
    <>
      <PrintStyle />
      {/* 문서 화면 공통 기둥 — A4 794 + 패널 320 */}
      <div className="mx-auto max-w-[794px] xl:max-w-[1138px]">
        <Link
          href="/modules/safety-training"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" />
          목록
        </Link>

        <div className="mb-3.5 grid gap-x-6 gap-y-3 print:hidden xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded border-[1.5px] border-[var(--gian-stamp)] py-1 pr-3 pl-3.5 text-sm font-bold tracking-[.18em] text-[var(--gian-stamp)]">
              교육일지
            </span>
            {doc.docNo && (
              <span className="text-sm text-[var(--gian-ink-soft)]">{doc.docNo}</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {docStatusLabels[doc.status] ?? doc.status}
            </span>
            {!voided && canEdit && (
              <Button asChild variant="outline" className="ml-auto">
                <Link href={`/modules/safety-training/${doc.id}/edit`}>내용 수정</Link>
              </Button>
            )}
          </div>
          {/* 인쇄는 완성본만 — 번호 없는 일지는 증빙이 아니다 */}
          <div className="flex flex-wrap gap-2">{!voided && !isDraft && <PrintButton />}</div>
        </div>

        {!voided && meta.draft.needsClarification.length > 0 && (
          <AttentionCard className="mb-4" title="완성 전 확인이 필요합니다">
            {meta.draft.needsClarification.join(" · ")} — [내용 수정]에서 고칠 수
            있습니다.
          </AttentionCard>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="order-2 min-w-0 xl:order-1">
            <PaperScale>
              <SafetyTrainingPaper
                docNo={doc.docNo ?? "완성 시 부여"}
                courseLabel={meta.courseLabel}
                date={meta.date}
                place={meta.place}
                hours={meta.hours}
                instructor={meta.instructor}
                draft={meta.draft}
                attendees={meta.attendees}
                office={`${tenant.name} 관리사무소장`}
              />
            </PaperScale>
          </div>
          {/* 오른쪽은 이 문서에 대한 판단 자리 — 완성 카드가 첫 칸, sticky (공지문과 동일) */}
          <aside className="order-1 flex flex-col gap-3 print:hidden xl:order-2 xl:sticky xl:top-5">
            {isDraft && (
              <Card className="p-4">
                <h4 className="mb-1.5 text-sm font-semibold">
                  내용을 확인한 뒤 완성해 주세요
                </h4>
                <p className="text-sm text-muted-foreground">
                  지금은 초안입니다. 고칠 곳은 [내용 수정]에서 고친 뒤 완성해
                  주세요 — 완성하면 문서번호가 부여되고 인쇄할 수 있습니다.
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
            {voided ? (
              <Card className="p-4 text-sm text-muted-foreground">
                폐기된 일지입니다. 기록으로만 남아 있습니다 — 같은 교육이
                필요하면 새 교육일지를 만들어 주세요.
              </Card>
            ) : (
              <Card className="p-4">
                <h4 className="mb-1.5 text-sm font-semibold">보관 안내</h4>
                <p className="text-sm text-muted-foreground">
                  {isDraft
                    ? "완성 후 인쇄해 참석자 자필 서명을 받아 보관하세요. 교육일지는 감독 점검 시 제출하는 증빙입니다."
                    : "인쇄해 참석자 자필 서명을 받아 보관하세요. 참석자 명단은 완성 시점의 명부 스냅샷이라 이후 명부를 고쳐도 변하지 않습니다."}
                </p>
                {canEdit && (
                  <div className="mt-3">
                    <VoidButton docId={doc.id} draft={isDraft} />
                  </div>
                )}
              </Card>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
