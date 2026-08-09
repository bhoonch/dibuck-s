import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { FOLLOWUPS, type MeetingMeta } from "@/lib/minutes";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusSelect } from "./status-select";

const decisionStyles: Record<string, string> = {
  가결: "bg-green-50 text-green-700",
  부결: "bg-red-50 text-red-700",
  보류: "bg-amber-50 text-amber-700",
};

const FILTERS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: "전체" },
  { key: "이행중", label: "이행중" },
  { key: "완료", label: "완료" },
];

/**
 * 의결사항 대장 — 전 회의 통합. 소장이 감사·점검 때 내미는 방어 기록이라
 * "언제 어느 회의에서 무엇이 의결됐는지"가 문서번호로 바로 찾아져야 한다.
 * 상태 필터·검색 둘 다 쿼리 파라미터라 새로고침·북마크·뒤로가기가 그대로 된다.
 */
export default async function ResolutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "minutes"))) redirect("/subscriptions");

  const { f, q } = await searchParams;
  const status = (FOLLOWUPS as readonly string[]).includes(f ?? "") ? f : undefined;
  const query = (q ?? "").trim();

  const resolutions = await db.resolution.findMany({
    where: {
      tenantId,
      ...(status ? { followupStatus: status } : {}),
      ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { meetingDoc: { select: { docNo: true, meta: true } } },
  });

  const today = ymdKst(new Date());
  const linkWith = (params: { f?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params.f) sp.set("f", params.f);
    if (params.q) sp.set("q", params.q);
    const qs = sp.toString();
    return `/modules/minutes/resolutions${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <Link
        href="/modules/minutes"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        회의록
      </Link>
      <PageHeader
        title="의결사항 대장"
        description="언제 어느 회의에서 무엇이 의결됐는지 문서번호로 찾습니다."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((flt) => (
            <Link
              key={flt.label}
              href={linkWith({ f: flt.key, q: query || undefined })}
              className={`rounded-full border px-3 py-1 text-sm ${
                status === flt.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {flt.label}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2">
          {status && <input type="hidden" name="f" value={status} />}
          <Input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="제목 검색"
            className="w-56"
          />
          <Button type="submit" variant="outline">
            검색
          </Button>
        </form>
      </div>

      <Card className="overflow-x-auto p-0">
        {resolutions.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            조건에 맞는 의결사항이 없습니다.
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">의결일</th>
                <th className="px-4 py-2 font-medium">회의</th>
                <th className="px-4 py-2 font-medium">제목</th>
                <th className="px-4 py-2 font-medium">결과</th>
                <th className="px-4 py-2 font-medium">후속 조치</th>
                <th className="px-4 py-2 font-medium">기한</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {resolutions.map((r) => {
                const meta = r.meetingDoc.meta as MeetingMeta;
                const meetingYmd = meta.meetingAt?.slice(0, 10) ?? "";
                const dueYmd = r.dueDate ? ymdKst(r.dueDate) : null;
                const overdue = r.followupStatus === "이행중" && !!dueYmd && dueYmd < today;
                return (
                  <tr key={r.id} className={overdue ? "bg-red-50/40" : ""}>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {meetingYmd}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/modules/minutes/${r.meetingDocId}`}
                        className="font-mono text-xs text-blue-700 hover:underline"
                      >
                        {r.meetingDoc.docNo ?? "-"}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 font-medium">{r.title}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${decisionStyles[r.decision] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {r.decision}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <StatusSelect
                        id={r.id}
                        status={r.followupStatus}
                        overdue={overdue}
                        options={FOLLOWUPS}
                      />
                    </td>
                    <td
                      className={`px-4 py-2 font-mono text-xs ${overdue ? "font-semibold text-red-600" : "text-muted-foreground"}`}
                    >
                      {dueYmd ?? "-"}
                      {overdue && " 경과"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
