"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ponytail: 06:00~22:00 30분 간격 고정 목록 — 분 단위 입력 요구가 생기면 input[type=time]으로 되돌린다 */
const TIMES = Array.from({ length: 33 }, (_, i) => {
  const h = String(6 + Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 ? "30" : "00"}`;
});

/**
 * 시각 선택 — datetime-local·time 스피너가 어렵다는 사용자 지적으로 목록 선택으로 교체.
 * name을 주면 폼 제출에 실린다(Radix Select의 hidden 필드). allowEmpty의 "선택 안 함"은
 * value가 "none"으로 제출된다 — 받는 쪽은 HH:mm 형식 검사로 거른다(minutes actions의 closedAt).
 */
export function TimeSelect({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  allowEmpty,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue || undefined}
      onValueChange={onValueChange}
    >
      <SelectTrigger id={id} className="mt-1.5 !h-11 w-full">
        <SelectValue placeholder="시각 선택" />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="none">선택 안 함</SelectItem>}
        {TIMES.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
