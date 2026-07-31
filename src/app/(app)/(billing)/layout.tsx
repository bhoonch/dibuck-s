import { PageHeader } from "@/components/ui/page-header";
import { SavedToast } from "@/components/ui/saved-toast";
import { SectionTabs } from "./section-tabs";

/**
 * 구독과 결제는 셀프서비스의 본체다 — 단지 설정 서랍 안에 있으면
 * "어디서 구독하지"를 짐작으로 찾아야 해서 메인 메뉴로 꺼냈다.
 * 폭 1280은 설정과 같은 값 — 구독 카드가 1440 노트북에서 빈 땅을 남기지 않는다.
 */
export default function SubscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-[1280px]">
      {/* 카드 등록·해지 알림을 한 곳에서 — 두 화면이 따로 들 필요가 없다 */}
      <SavedToast />
      <PageHeader
        title="구독·결제"
        description="쓰는 모듈을 열고, 새 모듈을 구독하고, 결제 수단과 청구 내역을 관리합니다."
      />
      <SectionTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
