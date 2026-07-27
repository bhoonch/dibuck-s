import { db } from "@/lib/db";
import { PageTitle } from "../../ui";
import { ModuleForm } from "../module-form";
import { requireAdmin } from "@/lib/auth";

export default async function NewModulePage() {
  await requireAdmin();
  const last = await db.module.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return (
    <>
      <PageTitle
        title="새 모듈 등록"
        description="레지스트리에 등록하면 전 단지 모듈 런처에 노출되고, 단지별로 구독·체험을 켤 수 있습니다."
      />
      <ModuleForm nextSortOrder={(last?.sortOrder ?? 0) + 1} />
    </>
  );
}
