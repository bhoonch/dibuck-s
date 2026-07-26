import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountSettings } from "@/components/account-settings";

export default async function MyAccountPage() {
  const session = await requireSession();
  const me = await db.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { name: true, title: true, email: true },
  });
  return (
    <AccountSettings
      name={me.name}
      title={me.title}
      email={me.email}
      showTitle
    />
  );
}
