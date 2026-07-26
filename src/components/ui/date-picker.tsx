import { Input } from "@/components/ui/input";

/* ponytail: 네이티브 input[type=date] — 모바일·접근성 무료. 기간 선택 등 요구가 생기면 캘린더 컴포넌트로 교체 */
export function DatePicker(
  props: Omit<React.ComponentProps<typeof Input>, "type">,
) {
  return <Input type="date" {...props} />;
}
