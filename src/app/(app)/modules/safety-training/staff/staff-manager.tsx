"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { LEGAL_HOURS, STAFF_POSITIONS } from "@/lib/safety-training";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addStaff, importAppUsers, setStaffActive, updateStaff } from "../actions";

type StaffRow = {
  id: string;
  name: string;
  position: string;
  active: boolean;
};

const selectCls =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

function AddForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [position, setPosition] = useState<string>("기전");
  const [error, setError] = useState<string>();

  const add = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const r = await addStaff({ name, position });
      if (r && "error" in r && r.error) setError(r.error);
      else {
        setName("");
        setError(undefined);
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="이름"
          className="w-36"
        />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className={selectCls}
        >
          {STAFF_POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Button type="button" onClick={add} disabled={pending || !name.trim()}>
          {pending && <Loader2 className="size-4 animate-spin" />} 추가
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Row({ row }: { row: StaffRow }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(row.name);
  const [position, setPosition] = useState(row.position);
  const dirty = name !== row.name || position !== row.position;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 py-2 ${row.active ? "" : "opacity-50"}`}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-36"
        disabled={!row.active}
      />
      <select
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        className={selectCls}
        disabled={!row.active}
      >
        {STAFF_POSITIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
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
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await updateStaff({ id: row.id, name, position });
              })
            }
          >
            저장
          </Button>
        )}
        {/* 퇴사자는 삭제가 아니라 비활성 — 명부에서 이름이 사라지면 "왜 지웠지"가 된다 */}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setStaffActive(row.id, !row.active);
            })
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : row.active ? (
            "퇴사 처리"
          ) : (
            "복구"
          )}
        </Button>
      </div>
    </div>
  );
}

export function StaffManager({
  staff,
  canManage,
}: {
  staff: StaffRow[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [imported, setImported] = useState<number>();

  if (!canManage)
    return (
      <Card className="p-6">
        <ul className="divide-y">
          {staff.map((s) => (
            <li key={s.id} className={`flex items-center gap-2 py-2 text-sm ${s.active ? "" : "opacity-50"}`}>
              {s.name}
              <span className="text-xs text-muted-foreground">{s.position}</span>
              {!s.active && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  비활성
                </span>
              )}
            </li>
          ))}
          {staff.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">
              아직 등록된 직원이 없습니다 — 명부 등록은 마스터·매니저가 합니다.
            </li>
          )}
        </ul>
      </Card>
    );

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">직원 추가</h2>
          <div className="flex items-center gap-2">
            {imported !== undefined && (
              <span className="text-xs text-muted-foreground">
                {imported > 0 ? `${imported}명 불러왔습니다` : "새로 불러올 직원이 없습니다"}
              </span>
            )}
            {/* 계정과 연결하지 않는다 — 이름·직책만 복사하는 한 번짜리 편의 */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await importAppUsers();
                  if (r && "added" in r) setImported(r.added);
                })
              }
            >
              <UserPlus className="size-4" /> 앱 직원 불러오기
            </Button>
          </div>
        </div>
        <AddForm />
        <p className="mt-3 text-xs text-muted-foreground">
          직종이 &lsquo;사무&rsquo;면 정기교육 {LEGAL_HOURS.regularOffice}, 그 외는{" "}
          {LEGAL_HOURS.regularField} 기준으로 집계됩니다.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">
          등록된 직원 <span className="font-normal text-muted-foreground">({staff.filter((s) => s.active).length}명 활동)</span>
        </h2>
        <div className="divide-y">
          {staff.map((s) => (
            <Row key={s.id} row={s} />
          ))}
          {staff.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              아직 등록된 직원이 없습니다. 위에서 추가하거나 앱 직원을 불러오세요.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
