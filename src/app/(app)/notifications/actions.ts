"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function markAllRead() {
  const session = await requireSession();
  await db.notification.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
