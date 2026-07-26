import { PageHeader } from "@/components/ui/page-header";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader
        title="설정"
        description="단지 정보와 직원, 구독을 관리합니다."
      />
      <SettingsTabs />
      {children}
    </>
  );
}
