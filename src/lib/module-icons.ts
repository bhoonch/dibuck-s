import {
  ClipboardList,
  FileText,
  FileWarning,
  HardHat,
  LayoutGrid,
  Megaphone,
  MessageSquareWarning,
  Stamp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// 새 모듈 추가 시: 레지스트리(DB)에 아이콘 이름 등록 + 여기에 매핑 한 줄 추가
const moduleIcons: Record<string, LucideIcon> = {
  FileWarning,
  Megaphone,
  FileText,
  MessageSquareWarning,
  Wrench,
  ClipboardList,
  Stamp,
  HardHat,
};

export const getModuleIcon = (name: string): LucideIcon =>
  moduleIcons[name] ?? LayoutGrid;
