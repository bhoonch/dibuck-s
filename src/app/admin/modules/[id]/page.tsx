import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageTitle } from "../../ui";
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
      <PageTitle eyebrow="모듈 수정" title={moduleData.name} />
      <ModuleForm module={moduleData} />
    </>
  );
}
