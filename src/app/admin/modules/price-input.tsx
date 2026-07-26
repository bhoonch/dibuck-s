"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 천단위 콤마가 보이는 금액 입력.
 * type="number"는 콤마를 못 넣으므로 텍스트로 두고 입력할 때마다 다시 포맷한다.
 * 서버 액션이 숫자 외 문자를 걷어내므로 콤마가 그대로 전송돼도 안전하다.
 */
export function PriceInput({
  id,
  name = "price",
  defaultValue,
  className,
}: {
  id?: string;
  name?: string;
  defaultValue: number;
  className?: string;
}) {
  const [value, setValue] = useState(() => defaultValue.toLocaleString());

  return (
    <Input
      id={id}
      name={name}
      value={value}
      inputMode="numeric"
      autoComplete="off"
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, "");
        setValue(digits ? Number(digits).toLocaleString() : "");
      }}
      className={cn("text-right font-mono", className)}
    />
  );
}
