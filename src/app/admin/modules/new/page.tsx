import { PageHeader } from "@/components/ui/page-header";
import { ModuleForm } from "../module-form";

export default function NewModulePage() {
  return (
    <>
      <PageHeader
        title="새 모듈 등록"
        description="레지스트리에 등록하면 전 단지 런처에 노출됩니다."
      />
      <ModuleForm />
    </>
  );
}
