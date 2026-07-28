import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UnitsUpload } from "./units-upload";
import { UnitsTable } from "./units-table";

export default async function UnitsPage() {
  const session = await requireSession();
  const units = await db.unit.findMany({
    where: { tenantId: session.tenantId! },
    orderBy: [{ dong: "asc" }, { ho: "asc" }],
  });
  // 명부 업로드는 마스터·매니저 (권한 안내 카드의 매니저 설명과 같은 경계)
  const canUpload =
    session.role === "DIRECTOR" || session.role === "ACCOUNTANT";

  return (
    <div className="space-y-6">
      {canUpload && (
        <Card className="gap-0 py-0">
          <CardHeader className="gap-0.5 border-b border-gray-100 px-4 py-3">
            <CardTitle>
              세대 목록 업로드
            </CardTitle>
            <CardDescription>
              한 번 올려두면 독촉장, 민원, 공지 발송 등 모든 모듈이 함께
              사용합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <UnitsUpload />
          </CardContent>
        </Card>
      )}
      <div>
        <div className="mb-3 flex items-center">
          <h3 className="text-lg font-semibold tracking-tight">
            등록된 세대
          </h3>
          <span className="ml-2 font-mono text-xs text-gray-500">
            {units.length.toLocaleString()}세대
          </span>
        </div>
        <UnitsTable
          rows={units.map((u) => ({
            dong: u.dong,
            ho: u.ho,
            name: u.name ?? "-",
            phone: u.phone ?? "-",
          }))}
        />
      </div>
    </div>
  );
}
