"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import {
  LEGAL_HOURS,
  STAFF_POSITIONS,
  type ExternalTraining,
} from "@/lib/safety-training";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addStaff,
  importAppUsers,
  saveExtTrainings,
  setStaffActive,
  updateStaff,
} from "../actions";

type StaffRow = {
  id: string;
  name: string;
  position: string;
  /** 입사일 YYYY-MM-DD. 빈 값 = 채용 시 교육 판정 제외 */
  hiredAt: string;
  active: boolean;
  /** 관리감독자(소장) — 정기교육 반기 대신 연 16시간 판정 */
  supervisor: boolean;
  /** 외부 교육 이수 기록 — 관리감독자의 연 16시간에 합산된다 */
  ext: ExternalTraining[];
};

const selectCls =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

function AddForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [position, setPosition] = useState<string>("기전");
  const [hiredAt, setHiredAt] = useState("");
  const [supervisor, setSupervisor] = useState(false);
  const [error, setError] = useState<string>();

  const add = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const r = await addStaff({ name, position, hiredAt, supervisor });
      if (r && "error" in r && r.error) setError(r.error);
      else {
        setName("");
        setHiredAt("");
        setSupervisor(false);
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
        {/* 입사일은 새로 뽑은 사람만 — 채용 시 교육(8시간) 대상과 기한이 여기서 나온다 */}
        <Input
          type="date"
          value={hiredAt}
          onChange={(e) => setHiredAt(e.target.value)}
          className="w-40"
          aria-label="입사일 (선택)"
        />
        {/* 관리감독자(소장)는 정기교육이 반기 6/12h가 아니라 연 16h — 판정 축이 갈린다 */}
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={supervisor}
            onChange={(e) => setSupervisor(e.target.checked)}
          />
          관리감독자
        </label>
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
  const [hiredAt, setHiredAt] = useState(row.hiredAt);
  const [supervisor, setSupervisor] = useState(row.supervisor);
  const dirty =
    name !== row.name ||
    position !== row.position ||
    hiredAt !== row.hiredAt ||
    supervisor !== row.supervisor;

  return (
    <div className={`py-2 ${row.active ? "" : "opacity-50"}`}>
      <div className="flex flex-wrap items-center gap-2">
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
        <Input
          type="date"
          value={hiredAt}
          onChange={(e) => setHiredAt(e.target.value)}
          className="w-40"
          aria-label="입사일 (선택)"
          disabled={!row.active}
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={supervisor}
            onChange={(e) => setSupervisor(e.target.checked)}
            disabled={!row.active}
          />
          관리감독자
        </label>
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
                  await updateStaff({ id: row.id, name, position, hiredAt, supervisor });
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
      {/* 외부 이수 등록은 저장된 관리감독자에게만 — 체크만 하고 저장 안 한 상태로 넣으면 헷갈린다 */}
      {row.supervisor && row.active && <ExtEditor staffId={row.id} saved={row.ext} />}
    </div>
  );
}

/**
 * 관리감독자 외부 교육 이수 편집기 — 이수일·기관명·시간만 적는 집계용 기록.
 * 원본 증빙은 수료증(종이)이라 파일 첨부는 없다. 저장은 목록 통째 교체.
 */
function ExtEditor({ staffId, saved }: { staffId: string; saved: ExternalTraining[] }) {
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(saved);
  const [error, setError] = useState<string>();
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);
  const patch = (i: number, p: Partial<ExternalTraining>) =>
    setItems(items.map((t, j) => (j === i ? { ...t, ...p } : t)));

  return (
    <details className="mt-1 ml-1" open={items.length > 0}>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        외부 교육 이수 {saved.length}건 — 연 16시간 판정에 합산 (수료증은 철에 보관)
      </summary>
      <div className="mt-2 space-y-2">
        {items.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={t.date}
              onChange={(e) => patch(i, { date: e.target.value })}
              className="w-40"
              aria-label="이수일"
            />
            <Input
              value={t.org}
              onChange={(e) => patch(i, { org: e.target.value })}
              placeholder="교육기관 (예: ○○안전보건교육원, 본사 집합교육)"
              className="w-72"
            />
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={t.hours || ""}
              onChange={(e) => patch(i, { hours: Number(e.target.value) })}
              className="w-20"
              aria-label="교육시간"
            />
            <span className="text-xs text-muted-foreground">시간</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
            >
              삭제
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setItems([...items, { date: "", org: "", hours: 0 }])}
          >
            이수 추가
          </Button>
          {dirty && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await saveExtTrainings(staffId, items);
                  setError(r && "error" in r ? r.error : undefined);
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />} 이수 저장
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </details>
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
              <span className="text-xs text-muted-foreground">
                {s.position}
                {s.supervisor ? " · 관리감독자" : ""}
                {s.hiredAt ? ` · ${s.hiredAt} 입사` : ""}
              </span>
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
          <br />
          입사일은 <b>새로 채용한 직원만</b> 넣어 주세요.
          <br />
          채용 시 교육({LEGAL_HOURS.newHire})의 대상이 됩니다. 이미 근무 중인
          직원은 비워 두면 됩니다.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">
          등록된 직원 <span className="font-normal text-muted-foreground">({staff.filter((s) => s.active).length}명 활동)</span>
        </h2>
        <div className="mt-4 divide-y">
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
