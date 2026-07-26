import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getModuleIcon, moduleIconNames } from "@/lib/module-icons";
import { saveModule } from "../actions";
import { btnOutline, btnSubmit } from "../ui";
import { PriceInput } from "./price-input";
import type { Module } from "@/generated/prisma/client";

const hint = "text-xs text-muted-foreground";

export function ModuleForm({
  module: m,
  nextSortOrder = 0,
}: {
  module?: Module;
  nextSortOrder?: number;
}) {
  const isEdit = !!m;

  return (
    <form action={saveModule} className="max-w-2xl space-y-4">
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="id">모듈 ID</Label>
            <Input
              id="id"
              name="id"
              defaultValue={m?.id}
              readOnly={isEdit}
              placeholder="dunning"
              pattern="[a-z][a-z0-9-]*"
              required
              className={isEdit ? "bg-muted font-mono" : "font-mono"}
            />
            <p className={hint}>
              {isEdit
                ? "등록 후에는 바꿀 수 없습니다."
                : "영문 소문자·숫자·하이픈. 주소가 자동으로 정해집니다."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">모듈 이름</Label>
            <Input
              id="name"
              name="name"
              defaultValue={m?.name}
              placeholder="미납 독촉장"
              required
            />
            <p className={hint}>사이드바·런처에 표시됩니다.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">설명</Label>
          <Input
            id="description"
            name="description"
            defaultValue={m?.description}
            placeholder="관리비 미납 세대 독촉장을 한 번에 만들어요"
          />
          <p className={hint}>
            모듈 런처 카드에 한 줄로 들어갑니다. 직원이 읽는 문장으로 쓰세요.
          </p>
        </div>

        <div className="space-y-2">
          <Label>아이콘</Label>
          <div className="flex flex-wrap gap-2">
            {moduleIconNames.map((iconName, i) => {
              const Icon = getModuleIcon(iconName);
              return (
                <label key={iconName} className="cursor-pointer" title={iconName}>
                  <input
                    type="radio"
                    name="icon"
                    value={iconName}
                    defaultChecked={m ? m.icon === iconName : i === 0}
                    className="peer sr-only"
                  />
                  <span className="flex size-9 items-center justify-center rounded-lg border text-gray-500 transition-colors hover:bg-gray-50 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-700 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                    <Icon className="size-4" />
                  </span>
                </label>
              );
            })}
          </div>
          <p className={hint}>
            `src/lib/module-icons.ts`에 매핑된 아이콘만 고를 수 있습니다. 새
            아이콘이 필요하면 거기에 한 줄 추가하세요.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="price">월 요금 (원)</Label>
            <PriceInput id="price" defaultValue={m?.price ?? 20000} />
            <p className={hint}>단지 1곳 기준 월 구독료.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trialDays">체험 기간 (일)</Label>
            <Input
              id="trialDays"
              name="trialDays"
              type="number"
              min={0}
              max={365}
              defaultValue={m?.trialDays ?? 30}
              className="font-mono"
            />
            <p className={hint}>새 구독 단지 전체에 동일 적용. 0 = 체험 없음.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sortOrder">정렬 순서</Label>
            <Input
              id="sortOrder"
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={m?.sortOrder ?? nextSortOrder}
              className="font-mono"
            />
            <p className={hint}>작을수록 사이드바·런처 위쪽에 옵니다.</p>
          </div>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border bg-gray-50 p-3">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={m?.isActive ?? true}
            className="mt-0.5 size-4 accent-blue-600"
          />
          <span className="block">
            <span className="block text-sm font-medium">전 단지에 노출</span>
            <span className={`block ${hint}`}>
              끄면 새로 구독할 수 없습니다. 이미 구독 중인 단지는 계속 사용합니다.
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" className={btnSubmit}>
          {isEdit ? "저장" : "모듈 등록"}
        </button>
        <Link href="/admin/modules" className={btnOutline}>
          취소
        </Link>
      </div>
    </form>
  );
}
