import { db } from "@/lib/db";
import { PageTitle } from "../../ui";
import { AnnouncementForm } from "../announcement-form";

export default async function AdminNewAnnouncementPage() {
  const [modules, tenants] = await Promise.all([
    db.module.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <PageTitle
        title="새 공지 작성"
        description="게시 시작일이 미래면 예약 상태로 저장되고, 시작일이 되면 자동으로 배너에 노출됩니다."
      />
      <AnnouncementForm
        modules={modules}
        tenants={tenants}
        today={new Date().toISOString().slice(0, 10)}
      />
    </>
  );
}
