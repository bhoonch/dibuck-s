import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenantInfo } from "./actions";

/* ponytail: 동·호 상세 구조 편집기는 생략 — 세대 목록은 설정 > 세대 관리의 엑셀 업로드가 담당 */
export default async function TenantSettingsPage() {
  const session = await requireSession();
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: session.tenantId! },
  });
  const isDirector = session.role === "DIRECTOR";

  return (
    <form action={updateTenantInfo}>
      <Card className="max-w-2xl gap-0 py-0">
        <CardHeader className="gap-0.5 border-b border-gray-100 px-4 py-3">
          <CardTitle className="text-lg tracking-tight">단지 정보</CardTitle>
          <CardDescription>
            문서와 알림에 사용되는 우리 단지의 기본 정보입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
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
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sealImage">직인 이미지</Label>
            <p className="text-xs text-muted-foreground">
              인쇄용 공고문·기안서의 명의 옆에 찍힙니다. 없으면
              &quot;(직인생략)&quot;으로 표기됩니다. (PNG 권장, 1MB 이하)
            </p>
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
                  <FileUpload name="sealImage" accept="image/*" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    직인은 소장만 등록할 수 있습니다.
                  </p>
                )}
                {tenant.sealImage && isDirector && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" name="removeSeal" className="size-3.5" />
                    등록된 직인 삭제
                  </label>
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end border-t border-gray-100 px-4 py-3">
          {isDirector ? (
            <Button type="submit" size="lg">
              저장
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              단지 정보는 소장만 수정할 수 있습니다.
            </p>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
