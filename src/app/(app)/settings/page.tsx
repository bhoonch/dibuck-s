import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { tossEnabled } from "@/lib/toss";
import { ymdKst } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenantInfo } from "./actions";

/** 설정 첫 화면에 들어오는 이유의 절반은 "지금 어떻게 돼 있지?"다 */
function Tile({
  href,
  label,
  value,
  note,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
        {label}
      </span>
      <span className="font-mono text-2xl leading-tight font-semibold tracking-tight">
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </Link>
  );
}

/* ponytail: 동·호 상세 구조 편집기는 생략 — 세대 목록은 설정 > 세대 관리의 엑셀 업로드가 담당 */
export default async function TenantSettingsPage() {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  const [tenant, units, staff, modules, billing] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    db.unit.count({ where: { tenantId } }),
    db.user.count({ where: { tenantId } }),
    db.tenantModule.count({ where: { tenantId, status: "ACTIVE" } }),
    db.billing.findUnique({ where: { tenantId } }),
  ]);
  const isDirector = session.role === "DIRECTOR";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          href="/settings/units"
          label="등록 세대"
          value={units.toLocaleString()}
          note={units === 0 ? "아직 올린 세대가 없습니다" : "세대 관리에서 수정"}
        />
        <Tile
          href="/settings/staff"
          label="직원"
          value={staff.toLocaleString()}
          note="계정을 가진 사람 수"
        />
        <Tile
          href="/settings/subscriptions"
          label="구독 모듈"
          value={modules.toLocaleString()}
          note={
            modules === 0 ? (
              <Badge variant="secondary">구독 중인 모듈 없음</Badge>
            ) : (
              <Badge className="bg-green-50 text-green-700">이용 중</Badge>
            )
          }
        />
        <Tile
          href="/settings/billing"
          label="결제 수단"
          value={
            <span className="text-base">
              {!tossEnabled()
                ? "준비 중"
                : billing?.billingKey
                  ? `${billing.cardCompany} ${billing.cardNumber}`
                  : "미등록"}
            </span>
          }
          note={
            !tossEnabled() ? (
              "카드 자동 결제는 아직 열리지 않았습니다"
            ) : !billing?.billingKey ? (
              <Badge className="bg-amber-50 text-amber-700">카드 등록 필요</Badge>
            ) : billing.nextBillingAt ? (
              `${ymdKst(billing.nextBillingAt).replace(/-/g, ".")} 결제 예정`
            ) : (
              "청구 예정 없음"
            )
          }
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">단지 정보</h2>
        <form action={updateTenantInfo}>
          {/* 입력칸마다 붙던 안내는 그 칸 밑 한 줄로 — 오른쪽 도움말 카드는 없앴다 */}
          <Card className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">단지명</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="예: 행복아파트"
                  defaultValue={tenant.name}
                  disabled={!isDirector}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  결재 문서와 공고문의 명의가 됩니다 — 예: 행복아파트
                  관리사무소.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="households">세대수</Label>
                <Input
                  id="households"
                  name="households"
                  type="number"
                  min={1}
                  placeholder="예: 480"
                  defaultValue={tenant.households ?? ""}
                  disabled={!isDirector}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">대표번호</Label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder="예: 031-000-8526"
                  defaultValue={tenant.phone ?? ""}
                  disabled={!isDirector}
                />
                <p className="text-xs text-muted-foreground">
                  팩스와 함께 입주민 공고문 하단에 인쇄됩니다.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fax">팩스</Label>
                <Input
                  id="fax"
                  name="fax"
                  placeholder="예: 031-000-8527"
                  defaultValue={tenant.fax ?? ""}
                  disabled={!isDirector}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address">주소</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="예: 서울시 행복구 행복로 123"
                  defaultValue={tenant.address ?? ""}
                  disabled={!isDirector}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="buildingInfo">동 구성</Label>
                <Input
                  id="buildingInfo"
                  name="buildingInfo"
                  placeholder="예: 101동~110동, 상가 1동"
                  defaultValue={tenant.buildingInfo ?? ""}
                  disabled={!isDirector}
                />
                <p className="text-xs text-muted-foreground">
                  왼쪽 사이드바의 단지 표시에 세대수와 함께 나옵니다.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sealImage">직인 이미지</Label>
                <div className="flex items-start gap-4">
                  {tenant.sealImage && (
                    // eslint-disable-next-line @next/next/no-img-element -- data URI라 next/image 최적화 대상이 아니다
                    <img
                      src={tenant.sealImage}
                      alt="등록된 직인"
                      className="size-24 shrink-0 rounded border bg-white object-contain p-1"
                    />
                  )}
                  <div className="flex-1 space-y-1.5">
                    {isDirector ? (
                      <>
                        <FileUpload name="sealImage" accept="image/*" />
                        <p className="text-xs text-muted-foreground">
                          PNG 권장, 1MB 이하. 공고문·기안서의 명의 옆에 찍히며,
                          등록하지 않으면 &ldquo;(직인생략)&rdquo;으로
                          표기됩니다.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        직인은 마스터만 등록할 수 있습니다.
                      </p>
                    )}
                    {tenant.sealImage && isDirector && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          name="removeSeal"
                          className="size-3.5"
                        />
                        등록된 직인 삭제
                      </label>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="logoImage">아파트 로고</Label>
                <div className="flex items-start gap-4">
                  {tenant.logoImage && (
                    // eslint-disable-next-line @next/next/no-img-element -- data URI라 next/image 최적화 대상이 아니다
                    <img
                      src={tenant.logoImage}
                      alt="등록된 로고"
                      className="size-24 shrink-0 rounded border bg-white object-contain p-1"
                    />
                  )}
                  <div className="flex-1 space-y-1.5">
                    {isDirector ? (
                      <>
                        <FileUpload name="logoImage" accept="image/*" />
                        <p className="text-xs text-muted-foreground">
                          PNG 권장, 1MB 이하. 입주민 공고문 하단의 단지명 앞에
                          표시됩니다. 등록하지 않으면 이름만 나갑니다.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        로고는 마스터만 등록할 수 있습니다.
                      </p>
                    )}
                    {tenant.logoImage && isDirector && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          name="removeLogo"
                          className="size-3.5"
                        />
                        등록된 로고 삭제
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isDirector ? (
                <>
                  <Button type="submit" size="lg">
                    저장
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    바꾼 내용은 저장을 눌러야 문서와 알림에 반영됩니다.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  단지 정보는 마스터만 수정할 수 있습니다.
                </p>
              )}
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
