"use client";

import { useState, useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { linkRepairToEquipment } from "../actions";

/** 설비 미지정 기록의 뒤늦은 연결 — 잡수선으로 시작한 기록도 이력 카드에 실리게 */
export function LinkEquipment({
  docId,
  equipment,
}: {
  docId: string;
  equipment: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [equipmentId, setEquipmentId] = useState("");
  const [error, setError] = useState<string>();

  if (equipment.length === 0) return null;
  return (
    <Card className="p-4">
      <h4 className="text-sm font-semibold">설비에 연결</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        연결하면 이 기록이 그 설비의 이력과 비용 집계에 실립니다.
      </p>
      <div className="mt-2 flex gap-2">
        <select
          value={equipmentId}
          onChange={(e) => setEquipmentId(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
          aria-label="설비 선택"
        >
          <option value="">설비 선택</option>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={pending || !equipmentId}
          onClick={() =>
            startTransition(async () => {
              const r = await linkRepairToEquipment(docId, equipmentId);
              if (r && "error" in r && r.error) setError(r.error);
            })
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Link2 className="size-4" />
          )}{" "}
          연결
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Card>
  );
}
