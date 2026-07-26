import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleForm } from "../module-form";

export default async function EditModulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const moduleData = await db.module.findUnique({ where: { id } });
  if (!moduleData) notFound();

  return (
    <>
      <PageHeader title={`모듈 수정 — ${moduleData.name}`} />
      <ModuleForm module={moduleData} />
    </>
  );
}
