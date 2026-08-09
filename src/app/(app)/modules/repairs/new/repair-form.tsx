"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { Camera, FileText, Loader2, Paperclip, X } from "lucide-react";
import { EQUIPMENT_CATEGORIES } from "@/lib/repairs";
import { shrinkImage } from "@/lib/shrink-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRepairRecord, type RecordState } from "../actions";

export type EquipmentOption = {
  id: string;
  name: string;
  category: string;
  vendor: string;
};

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`;

/**
 * 수선 기록 폼 — 지하 기계실에서 폰으로 쓴다(모바일 한 손 입력이 명시 요구사항).
 * 한 컬럼, 큰 터치 타깃, 기본값(일자=오늘, 업체=설비 담당 업체)이 채워진 채 시작.
 */
export function RepairForm({
  equipment,
  today,
  defaultSymptom,
  defaultVendor,
}: {
  equipment: EquipmentOption[];
  /** YYYY-MM-DD (KST) — 서버가 넘긴다. 클라 시계를 믿지 않는다 */
  today: string;
  /** 점검 지적사항 연동의 프리필 (없으면 "") */
  defaultSymptom: string;
  defaultVendor: string;
}) {
  const [state, formAction, pending] = useActionState<RecordState, FormData>(
    createRepairRecord,
    undefined,
  );
  const [equipmentId, setEquipmentId] = useState("");
  const [vendor, setVendor] = useState(defaultVendor);
  const [vendorTouched, setVendorTouched] = useState(!!defaultVendor);
  // 천단위 콤마는 표시용 — 서버(parseWon)가 숫자만 걸러 읽는다
  const [cost, setCost] = useState("");
  const [done, setDone] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const won = (v: string) => {
    const n = v.replace(/[^0-9]/g, "");
    return n ? Number(n).toLocaleString("ko-KR") : "";
  };

  const pickEquipment = (id: string) => {
    setEquipmentId(id);
    // 설비의 담당 업체를 기본값으로 — 사용자가 이미 적었으면 덮지 않는다
    const eq = equipment.find((e) => e.id === id);
    if (eq && !vendorTouched) setVendor(eq.vendor);
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const shrunk = await Promise.all(
      [...list].map((f) => shrinkImage(f, 1200)),
    );
    setFiles((prev) => [...prev, ...shrunk]);
  };

  return (
    <form
      action={(fd) => {
        for (const f of files) fd.append("files", f);
        formAction(fd);
      }}
      className="mx-auto max-w-xl"
    >
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <Card className="space-y-4 p-4 sm:p-6">
        <div>
          <Label htmlFor="rp-equipment">설비</Label>
          <select
            id="rp-equipment"
            value={equipmentId}
            onChange={(e) => pickEquipment(e.target.value)}
            className="mt-1.5 block h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">설비 없이 기록 (복도 전등 등 잡수선)</option>
            {EQUIPMENT_CATEGORIES.filter((c) =>
              equipment.some((e) => e.category === c),
            ).map((c) => (
              <optgroup key={c} label={c}>
                {equipment
                  .filter((e) => e.category === c)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="rp-date">발생일</Label>
          <Input
            id="rp-date"
            type="date"
            name="startedAt"
            defaultValue={today}
            className="mt-1.5 h-11"
            aria-describedby="rp-date-hint"
          />
          {/* 조치 중으로 저장하는 경우가 있어서 "수선 일자"로는 무슨 날짜인지 갈린다.
              집계(반복 고장·이번 달)가 쓰는 값은 고장이 난 날이다 */}
          <p id="rp-date-hint" className="mt-1 text-xs text-muted-foreground">
            고장을 확인한 날입니다. 조치가 끝난 날이 아닙니다.
          </p>
        </div>
        <div>
          <Label htmlFor="rp-symptom">증상</Label>
          <Input
            id="rp-symptom"
            name="symptom"
            defaultValue={defaultSymptom}
            placeholder="예: 누수, 소음, 작동 불량"
            className="mt-1.5 h-11"
          />
        </div>
        <div>
          <Label htmlFor="rp-action">조치 (선택)</Label>
          <Textarea
            id="rp-action"
            name="action"
            rows={2}
            placeholder="예: 패킹 교체, 업체 수리 요청"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="rp-vendor">업체 (선택)</Label>
          <Input
            id="rp-vendor"
            name="vendor"
            value={vendor}
            onChange={(e) => {
              setVendor(e.target.value);
              setVendorTouched(true);
            }}
            placeholder="예: 한국펌프 02-1234-5678"
            className="mt-1.5 h-11"
          />
        </div>
        <div>
          <Label htmlFor="rp-cost">비용 (선택)</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id="rp-cost"
              name="cost"
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(won(e.target.value))}
              placeholder="0"
              className="h-11 text-right"
            />
            <span className="shrink-0 text-sm text-muted-foreground">원</span>
          </div>
        </div>

        <div>
          <Label>사진·영수증 (선택)</Label>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="mt-1.5 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="size-4" /> 사진 촬영
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" /> 파일 선택
            </Button>
          </div>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {kb(f.size)}
                  </span>
                  <button
                    type="button"
                    aria-label="첨부 제거"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="done"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            className="size-4 accent-primary"
          />
          조치까지 끝났습니다
        </label>
        {!done && (
          <p className="text-xs text-muted-foreground">
            조치 중으로 저장됩니다.
            <br />
            끝나면 기록 화면에서 완료 처리해 주세요.
          </p>
        )}

        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} 기록
          저장
        </Button>
      </Card>
    </form>
  );
}
