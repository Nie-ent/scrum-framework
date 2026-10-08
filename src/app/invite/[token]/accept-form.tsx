"use client";

import { useActionState } from "react";
import { acceptInviteLink } from "@/app/actions/teams";
import { FormMessage, SubmitButton } from "@/components/form";

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInviteLink, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton className="btn w-full" pendingText="กำลังเข้าทีม...">รับคำเชิญและเข้าทีม</SubmitButton>
    </form>
  );
}
