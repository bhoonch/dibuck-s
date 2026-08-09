"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { Attendee, AgendaItem } from "@/lib/minutes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMeeting, type MeetingState } from "../actions";

/**
 * 회의 만들기 폼. attendees는 명부 전체 스냅샷(증빙 원칙) — 체크는 삭제가 아니라
 * present 토글이다. 명부 등록이 없으면 이름을 직접 입력해 행을 추가할 수 있다.
 */
export function MeetingForm({
  attendeesInit,
  agendaInit,
  hasRegistry,
  defaultNoticeDays,
}: {
  attendeesInit: Attendee[];
  agendaInit: AgendaItem[];
  hasRegistry: boolean;
  defaultNoticeDays: number;
}) {
  const [state, formAction, pending] = useActionState<MeetingState, FormData>(
    createMeeting,
    undefined,
  );
  const [attendees, setAttendees] = useState<Attendee[]>(attendeesInit);
  const [agenda, setAgenda] = useState<{ title: string; fromResolutionId?: string }[]>(
    agendaInit.map((a) => ({ title: a.title, fromResolutionId: a.fromResolutionId })),
  );
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const addAttendee = () => {
    const name = newName.trim();
    if (!name) return;
    setAttendees((prev) => [
      ...prev,
      { role: "ETC", label: newLabel.trim() || "위원", name, present: true },
    ]);
    setNewName("");
    setNewLabel("");
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="attendees" value={JSON.stringify(attendees)} />
      <input type="hidden" name="agenda" value={JSON.stringify(agenda)} />

      <Card className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="mt-at">일시</Label>
            <Input
              id="mt-at"
              name="meetingAt"
              type="datetime-local"
              required
              className="mt-1.5 h-11"
            />
          </div>
          <div>
            <Label htmlFor="mt-place">장소</Label>
            <Input
              id="mt-place"
              name="place"
              placeholder="예: 관리사무소 회의실"
              className="mt-1.5 h-11"
            />
          </div>
        </div>
        <div className="max-w-[10rem]">
          <Label htmlFor="mt-notice">소집 통지 기한 (일)</Label>
          <Input
            id="mt-notice"
            name="noticeDays"
            type="number"
            min={0}
            defaultValue={defaultNoticeDays}
            className="mt-1.5 h-11"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            회의일 며칠 전까지 통지해야 하는지입니다.
            <br />
            관리규약을 확인하세요.
          </p>
        </div>
      </Card>

      <Card className="space-y-3 p-4 sm:p-6">
        <Label>참석 대상</Label>
        {!hasRegistry && attendees.length === 0 && (
          <p className="text-sm text-muted-foreground">
            설정 &gt; 결재선에서 동대표 명부를 등록하면 참석 체크가 자동으로
            채워집니다.
            <br />
            등록 없이도 이름을 직접 입력해 진행할 수 있습니다.
          </p>
        )}
        {attendees.length > 0 && (
          <ul className="space-y-1.5">
            {attendees.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={a.present}
                  onChange={(e) =>
                    setAttendees((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, present: e.target.checked } : x,
                      ),
                    )
                  }
                  className="size-4 accent-primary"
                />
                <span className="w-24 shrink-0 text-muted-foreground">{a.label}</span>
                <span className="font-medium">{a.name}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="직함 (예: 동대표)"
            className="h-9 w-32"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="이름"
            className="h-9 flex-1"
          />
          <Button type="button" variant="outline" onClick={addAttendee}>
            <Plus className="size-4" /> 추가
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4 sm:p-6">
        <Label>안건</Label>
        {agenda.length > 0 && (
          <ul className="space-y-1.5">
            {agenda.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-sm text-muted-foreground">
                  {i + 1}.
                </span>
                <Input
                  value={a.title}
                  onChange={(e) =>
                    setAgenda((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    )
                  }
                  className="h-9 flex-1"
                />
                <button
                  type="button"
                  aria-label="안건 삭제"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setAgenda((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => setAgenda((prev) => [...prev, { title: "" }])}
        >
          <Plus className="size-4" /> 안건 추가
        </Button>
      </Card>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null} 회의
        소집
      </Button>
    </form>
  );
}
