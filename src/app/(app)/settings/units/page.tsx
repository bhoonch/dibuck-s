import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { ymdKst } from "@/lib/utils";
import { UnitsUpload } from "./units-upload";
import { UnitsTable } from "./units-table";

export default async function UnitsPage() {
  const session = await requireTenantSession();
  const units = await db.unit.findMany({
    where: { tenantId: session.tenantId! },
    orderBy: [{ dong: "asc" }, { ho: "asc" }],
  });
  // 명부 업로드는 마스터·매니저 (권한 안내 카드의 매니저 설명과 같은 경계)
  const canUpload =
    session.role === "DIRECTOR" || session.role === "ACCOUNTANT";

  // ponytail: 이미 전량을 읽어 왔으니 메모리에서 센다 — 수만 세대가 되면 groupBy/count로
  const dongCount = new Set(units.map((u) => u.dong)).size;
  const withPhone = units.filter((u) => u.phone?.trim()).length;
  const lastAdded = units.reduce<Date | null>(
    (max, u) => (!max || u.createdAt > max ? u.createdAt : max),
    null,
  );

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
        <h3 className="mb-3 text-lg font-semibold tracking-tight">
          등록된 세대
        </h3>
        {/*
          연락처 등록 수를 같이 세는 이유: 독촉장·공지 도달률이 여기서 갈리는데
          표를 눈으로 훑기 전에는 몇 세대가 연락처 없이 올라왔는지 알 수가 없었다.
        */}
        <SummaryBox>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryStat
              label="등록 세대"
              value={units.length.toLocaleString()}
              note={units.length === 0 ? "아직 올린 세대가 없습니다" : "동·호 기준"}
            />
            <SummaryStat label="동" value={dongCount.toLocaleString()} note="등록된 동 수" />
            <SummaryStat
              label="연락처 등록"
              value={withPhone.toLocaleString()}
              note={
                units.length === 0
                  ? "—"
                  : withPhone === units.length
                    ? "전 세대 등록"
                    : `${units.length - withPhone}세대 미등록 — 문자·알림이 닿지 않습니다`
              }
            />
            <SummaryStat
              label="마지막 등록"
              value={lastAdded ? ymdKst(lastAdded) : "—"}
              note="세대가 추가된 날"
            />
          </dl>
        </SummaryBox>
        <div className="mt-3">
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
    </div>
  );
}
