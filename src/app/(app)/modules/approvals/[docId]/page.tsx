import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import type { GianDraft } from "@/lib/gian/claude";
import { externalRoleLabels, type ExternalRole } from "@/lib/gian/rules";
import { Button } from "@/components/ui/button";
import { PrintButton } from "./print-button";

const KO = "가나다라마바사아자차카타파하";

type Meta = {
  draft: GianDraft;
  plannedSteps: {
    order: number;
    userId?: string;
    externalRole?: ExternalRole;
    name: string;
  }[];
};

export default async function GianDocumentPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/settings/subscriptions");

  const doc = await db.document.findUnique({
    where: { id: (await params).docId },
  });
  // 테넌트 경계 — 다른 단지 문서 id를 넣어도 404
  if (!doc || doc.tenantId !== session.tenantId || doc.moduleId !== "approvals")
    notFound();
  const meta = doc.meta as Meta | null;
  if (!meta?.draft) notFound();
  const { draft, plannedSteps } = meta;

  // 결재란: 담당 칸이 앞 — 기안자(작성자)가 첫 칸이 아니라 결재선 스냅샷 그대로
  const stepLabel = (s: Meta["plannedSteps"][number]) =>
    s.externalRole ? externalRoleLabels[s.externalRole] : s.name;

  return (
    <>
      {/* 인쇄 시 A4 시트만 — 앱 크롬(사이드바·헤더·패널)은 전부 숨긴다 */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #a4-sheet, #a4-sheet * { visibility: visible; }
          #a4-sheet { position: absolute; inset: 0; width: 100%; margin: 0; border: 0; box-shadow: none; padding: 0; }
        }
        @page { size: A4; margin: 18mm 16mm; }
      `}</style>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{doc.docNo}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {docStatusLabels[doc.status] ?? doc.status}
          </span>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Button asChild variant="outline">
            <Link href="/modules/approvals/new">다시 만들기</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/modules/approvals">목록</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {/* ── A4 문서 ── */}
        <div
          id="a4-sheet"
          className="w-full max-w-[210mm] shrink-0 border bg-white p-[12mm] font-serif text-[15px] leading-relaxed text-black shadow-sm lg:w-[210mm]"
        >
          {/* 결재란 */}
          <table className="ml-auto mb-6 border-collapse text-center text-[13px]">
            <tbody>
              <tr>
                <td
                  rowSpan={2}
                  className="w-7 border border-black px-1 py-1 leading-4"
                >
                  결<br />재
                </td>
                {plannedSteps.map((s) => (
                  <td
                    key={s.order}
                    className="w-20 border border-black px-2 py-1"
                  >
                    {stepLabel(s)}
                  </td>
                ))}
              </tr>
              <tr>
                {plannedSteps.map((s) => (
                  <td key={s.order} className="h-14 border border-black" />
                ))}
              </tr>
            </tbody>
          </table>

          <div className="space-y-4">
            <div>
              <p className="font-semibold">1. 관련근거</p>
              {draft.legalBasis.map((b, i) => (
                <p key={i} className="pl-4">
                  {KO[i] ?? "•"}. {b}
                </p>
              ))}
            </div>
            <p className="font-semibold">
              2. 제&nbsp;&nbsp;목: {draft.title}
            </p>
            {draft.sections.map((sec, i) => (
              <div key={i}>
                <p className="font-semibold">
                  {i + 3}. {sec.heading}
                </p>
                {sec.lines.map((line, j) => (
                  <p
                    key={j}
                    className={/^\d+\)/.test(line.trim()) ? "pl-8" : "pl-4"}
                  >
                    {line}
                  </p>
                ))}
              </div>
            ))}
            <div className="pt-4">
              {draft.attachments.map((a, i) => (
                <p key={i}>
                  {i === 0 ? "붙  임: " : "       "}
                  {draft.attachments.length > 1 ? `${i + 1}. ` : ""}
                  {a}
                  {i === draft.attachments.length - 1 ? ".  끝." : ""}
                </p>
              ))}
              {draft.attachments.length === 0 && <p>끝.</p>}
            </div>
          </div>
        </div>

        {/* ── 검토 패널 (화면 전용) ── */}
        <div className="min-w-64 flex-1 space-y-4 print:hidden">
          {draft.needsClarification.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" /> 확인이 필요합니다
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {draft.needsClarification.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {draft.legalNotices.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <Info className="size-4" /> 법적 유의사항
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {draft.legalNotices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg border bg-card p-3 text-sm">
            <p className="mb-1 font-semibold">결재선 (예정)</p>
            <p className="text-muted-foreground">
              {plannedSteps.map(stepLabel).join(" → ") || "결재선 미설정"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              전자결재 상신은 다음 업데이트에서 제공됩니다. 지금은 A4로 인쇄해
              수기 결재하세요.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
