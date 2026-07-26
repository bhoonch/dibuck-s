import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postAnnouncement, toggleAnnouncement } from "../actions";

export default async function AdminAnnouncementsPage() {
  const announcements = await db.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <>
      <PageHeader
        title="공지 관리"
        description="전 단지 화면 상단에 배너로 표시됩니다. 배너는 한 번에 하나만 활성화됩니다."
      />
      <div className="max-w-2xl space-y-8">
        <form action={postAnnouncement} className="space-y-3">
          <Textarea
            name="message"
            placeholder="예: 7/30(목) 02:00~04:00 서버 점검이 예정되어 있습니다."
            required
            rows={3}
          />
          <Button type="submit">배너 발송</Button>
        </form>

        {announcements.length > 0 && (
          <div className="divide-y rounded-xl border bg-card">
            {announcements.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className={a.active ? "font-medium" : "text-muted-foreground"}>
                    {a.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.createdAt.toISOString().slice(0, 10)}
                  </p>
                </div>
                {a.active && (
                  <Badge className="bg-success/10 text-success">게시 중</Badge>
                )}
                <form action={toggleAnnouncement}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={String(!a.active)} />
                  <Button type="submit" variant="outline" size="sm">
                    {a.active ? "내리기" : "다시 게시"}
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
