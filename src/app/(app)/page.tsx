import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewOverview } from "@/lib/permissions";

export default async function Home() {
  const user = await requireUser();
  redirect(canViewOverview(user) ? "/dashboard" : "/standup");
}
