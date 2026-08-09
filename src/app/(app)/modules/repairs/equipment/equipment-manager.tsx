"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { EQUIPMENT_CATEGORIES } from "@/lib/repairs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addEquipment, setEquipmentActive, updateEquipment } from "../actions";

export type EquipmentRowUi = {
  id: string;
  name: string;
  category: string;
  location: string;
  /** YYYY-MM-DD, 없으면 "" */
  installedAt: string;
  vendor: string;
  note: string;
  active: boolean;
  /** 이 설비에 연결된 수선 기록 수 — 상세 링크의 문구용 */
  recordCount: number;
};

const selectCls =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

function CategorySelect({
  id,
  value,
  onChange,
  disabled,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${selectCls} ${className}`}
      aria-label="분류"
    >
      {EQUIPMENT_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function AddForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("기타");
  const [location, setLocation] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  const add = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const r = await addEquipment({
        name,
        category,
        location,
        installedAt,
        vendor,
        note,
      });
      if (r && "error" in r && r.error) setError(r.error);
      else {
        setName("");
        setLocation("");
        setInstalledAt("");
        setVendor("");
        setNote("");
        setError(undefined);
      }
    });
  };

  return (
    <div>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="eq-name">설비 이름</Label>
          <Input
            id="eq-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 지하 1층 급수펌프 #2"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="eq-cat">분류</Label>
          <CategorySelect
            id="eq-cat"
            value={category}
            onChange={setCategory}
            className="mt-1.5 block w-full"
          />
        </div>
        <div>
          <Label htmlFor="eq-loc">위치 (선택)</Label>
          <Input
            id="eq-loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="예: 지하 1층 기계실"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="eq-installed">설치·최근 교체 시점 (선택)</Label>
          <Input
            id="eq-installed"
            type="date"
            value={installedAt}
            onChange={(e) => setInstalledAt(e.target.value)}
            className="mt-1.5"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            연도만 알면 그해 1월 1일로 적어 주세요.
          </p>
        </div>
        <div>
          <Label htmlFor="eq-vendor">담당 업체 (선택)</Label>
          <Input
            id="eq-vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="예: 한국펌프 02-1234-5678"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="eq-note">비고 (선택)</Label>
          <Input
            id="eq-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1.5"
          />
        </div>
      </div>
      <Button
        type="button"
        className="mt-4"
        onClick={add}
        disabled={pending || !name.trim()}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}{" "}
        설비 추가
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Row({ row }: { row: EquipmentRowUi }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(row.name);
  const [category, setCategory] = useState(row.category);
  const [location, setLocation] = useState(row.location);
  const [installedAt, setInstalledAt] = useState(row.installedAt);
  const [vendor, setVendor] = useState(row.vendor);
  const dirty =
    name !== row.name ||
    category !== row.category ||
    location !== row.location ||
    installedAt !== row.installedAt ||
    vendor !== row.vendor;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 py-2 ${row.active ? "" : "opacity-50"}`}
    >
      <span className="w-64 shrink-0">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!row.active}
          aria-label="설비 이름"
        />
        <a
          href={`/modules/repairs/equipment/${row.id}`}
          className="mt-0.5 block text-xs text-blue-700 hover:underline"
        >
          이력 보기 ({row.recordCount}건)
        </a>
      </span>
      <CategorySelect
        value={category}
        onChange={setCategory}
        disabled={!row.active}
        className="w-32"
      />
      <Input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="위치"
        className="w-36"
        disabled={!row.active}
        aria-label="위치"
      />
      <Input
        type="date"
        value={installedAt}
        onChange={(e) => setInstalledAt(e.target.value)}
        className="w-40"
        disabled={!row.active}
        aria-label="설치 시점"
      />
      <Input
        value={vendor}
        onChange={(e) => setVendor(e.target.value)}
        placeholder="업체명·연락처"
        className="w-44"
        disabled={!row.active}
        aria-label="업체"
      />
      {!row.active && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          비활성
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {dirty && row.active && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                await updateEquipment({
                  id: row.id,
                  name,
                  category,
                  location,
                  installedAt,
                  vendor,
                  note: row.note,
                });
              })
            }
          >
            저장
          </Button>
        )}
        {/* 폐기는 삭제가 아니라 비활성 — 수선 기록의 설비 연결이 허공에 뜨면 안 된다 */}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setEquipmentActive(row.id, !row.active);
            })
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : row.active ? (
            "비활성"
          ) : (
            "활성"
          )}
        </Button>
      </div>
    </div>
  );
}

export function EquipmentManager({
  items,
  canManage,
}: {
  items: EquipmentRowUi[];
  canManage: boolean;
}) {
  if (!canManage)
    return (
      <Card className="p-6">
        <ul className="divide-y">
          {items.map((it) => (
            <li
              key={it.id}
              className={`flex items-center gap-2 py-2 text-sm ${it.active ? "" : "opacity-50"}`}
            >
              <a
                href={`/modules/repairs/equipment/${it.id}`}
                className="font-medium hover:underline"
              >
                {it.name}
              </a>
              <span className="text-xs text-muted-foreground">
                {it.category}
                {it.location ? ` · ${it.location}` : ""}
                {it.vendor ? ` · ${it.vendor}` : ""}
              </span>
              {!it.active && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  비활성
                </span>
              )}
            </li>
          ))}
          {items.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">
              아직 설비가 없습니다. 대장 관리는 마스터·매니저가 합니다.
            </li>
          )}
        </ul>
      </Card>
    );

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold">설비 추가</h2>
        <AddForm />
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">
          설비 대장{" "}
          <span className="font-normal text-muted-foreground">
            ({items.filter((i) => i.active).length}대 활성)
          </span>
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          폐기한 설비는 삭제 대신 비활성으로 두세요.
          <br />
          지난 수선 기록이 그 설비의 이력으로 계속 남습니다.
        </p>
        <div className="divide-y">
          {items.map((it) => (
            <Row key={it.id} row={it} />
          ))}
          {items.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              아직 설비가 없습니다. 위에서 추가하거나 엑셀로 한 번에 올리세요.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
