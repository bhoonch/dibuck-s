import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getModuleIcon } from "@/lib/module-icons";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminModulesPage() {
  const modules = await db.module.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } },
    },
  });

  return (
    <>
      <PageHeader title="모듈 관리" description="모듈 레지스트리를 관리합니다.">
        <Button asChild>
          <Link href="/admin/modules/new">
            <Plus className="size-4" /> 새 모듈
          </Link>
        </Button>
      </PageHeader>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>모듈</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>라우트</TableHead>
              <TableHead>월 요금</TableHead>
              <TableHead>구독</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((m) => {
              const Icon = getModuleIcon(m.icon);
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link
                      href={`/admin/modules/${m.id}`}
                      className="flex items-center gap-2 font-medium text-primary hover:underline"
                    >
                      <Icon className="size-4" />
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{m.id}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {m.route}
                  </TableCell>
                  <TableCell>{m.price.toLocaleString()}원</TableCell>
                  <TableCell>{m._count.subscriptions}개</TableCell>
                  <TableCell>
                    {m.isActive ? (
                      <Badge className="bg-success/10 text-success">활성</Badge>
                    ) : (
                      <Badge variant="secondary">비활성</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
