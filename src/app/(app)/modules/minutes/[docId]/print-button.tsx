"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "통지문 인쇄" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </Button>
  );
}
