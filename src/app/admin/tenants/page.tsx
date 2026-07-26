import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { impersonate } from "../actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminTenantsPage() {
  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          users: true,
          modules: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  return (
    <>
      <PageHeader title="단지 관리" description="가입한 단지 목록입니다." />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>단지명</TableHead>
              <TableHead>세대수</TableHead>
              <TableHead>직원</TableHead>
              <TableHead>구독 모듈</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell>{t.households ?? "-"}</TableCell>
                <TableCell>{t._count.users}명</TableCell>
                <TableCell>{t._count.modules}개</TableCell>
                <TableCell>
                  {t.status === "ACTIVE" ? (
                    <Badge className="bg-success/10 text-success">운영 중</Badge>
                  ) : (
                    <Badge variant="destructive">중지</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.createdAt.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>
                  <form action={impersonate}>
                    <input type="hidden" name="tenantId" value={t.id} />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      사용자 화면으로 전환
                    </button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
