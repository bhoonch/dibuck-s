import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveModule } from "../actions";
import type { Module } from "@/generated/prisma/client";

export function ModuleForm({ module: m }: { module?: Module }) {
  return (
    <form action={saveModule} className="max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="id">모듈 ID (slug)</Label>
          <Input
            id="id"
            name="id"
            defaultValue={m?.id}
            readOnly={!!m}
            placeholder="dunning"
            pattern="[a-z][a-z0-9-]*"
            required
            className={m ? "bg-muted" : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">이름</Label>
          <Input id="name" name="name" defaultValue={m?.name} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">설명</Label>
        <Input id="description" name="description" defaultValue={m?.description} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="icon">아이콘 (lucide 이름)</Label>
          <Input
            id="icon"
            name="icon"
            defaultValue={m?.icon}
            placeholder="FileWarning"
          />
          <p className="text-xs text-muted-foreground">
            코드의 module-icons.ts에도 매핑을 추가해야 합니다.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="route">라우트</Label>
          <Input
            id="route"
            name="route"
            defaultValue={m?.route}
            placeholder="/modules/dunning"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">월 요금 (원)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step={1000}
            defaultValue={m?.price ?? 20000}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sortOrder">정렬 순서</Label>
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            defaultValue={m?.sortOrder ?? 0}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={m?.isActive ?? true}
          className="size-4 accent-primary"
        />
        활성 (전 단지에 노출)
      </label>
      <Button type="submit">저장</Button>
    </form>
  );
}
