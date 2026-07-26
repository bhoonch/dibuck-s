import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { describeTarget } from "@/lib/announcements";
import { toggleAnnouncement } from "../actions";
import { PageTitle, Pill, btnPrimary, btnRow, tableHead, tableRow } from "../ui";

const COLS = "1fr 120px 170px 90px 100px";
const md = (d: Date) => d.toISOString().slice(5, 10);

export default async function AdminAnnouncementsPage() {
  const [announcements, modules] = await Promise.all([
    db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.module.findMany({ select: { id: true, name: true } }),
  ]);
  const moduleNames = Object.fromEntries(modules.map((m) => [m.id, m.name]));
  const now = new Date();

  return (
    <>
      <PageTitle
        title="공지 관리"
        description="전 단지 화면 상단에 배너로 표시됩니다. 게시 중인 공지가 여럿이면 최근 것이 노출됩니다."
      >
        <Link href="/admin/announcements/new" className={btnPrimary}>
          <Plus className="size-4" /> 새 공지 작성
        </Link>
      </PageTitle>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className={tableHead} style={{ gridTemplateColumns: COLS }}>
          <span>공지</span>
          <span>대상</span>
          <span>게시 기간</span>
          <span>상태</span>
          <span />
        </div>
        {announcements.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            등록된 공지가 없습니다.
          </p>
        ) : (
          announcements.map((a) => {
            const ended = !a.active || (a.endsAt !== null && a.endsAt < now);
            const scheduled = a.active && a.startsAt > now;
            return (
              <div
                key={a.id}
                className={tableRow}
                style={{ gridTemplateColumns: COLS }}
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {a.message}
                </span>
                <span className="truncate text-sm text-gray-600">
                  {describeTarget(a, moduleNames)}
                </span>
                <span className="font-mono text-xs text-gray-500">
                  {md(a.startsAt)} ~ {a.endsAt ? md(a.endsAt) : "무기한"}
                </span>
                <span>
                  {ended ? (
                    <Pill tone="muted">종료</Pill>
                  ) : scheduled ? (
                    <Pill tone="info">예약</Pill>
                  ) : (
                    <Pill tone="success">게시중</Pill>
                  )}
                </span>
                <span>
                  <form action={toggleAnnouncement}>
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={String(!a.active)}
                    />
                    <button type="submit" className={btnRow}>
                      {a.active ? "내리기" : "다시 게시"}
                    </button>
                  </form>
                </span>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
