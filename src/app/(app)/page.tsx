import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewTeamOverview } from "@/lib/permissions";

export default async function Home() {
  const user = await requireUser();
  redirect(canViewTeamOverview(user.role.level) ? "/dashboard" : "/standup");
}
