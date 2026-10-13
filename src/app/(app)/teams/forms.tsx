"use client";

import { useActionState, useState } from "react";
import { resendVerification } from "@/app/actions/auth";
import { createSubTeam, createTeam, deleteTeam, inviteMember, removeMember, setMeetingUrl, updateMember } from "@/app/actions/teams";
import { InviteFields, TeamFields } from "@/lib/schemas";
import { FormMessage, SubmitButton } from "@/components/form";
import { FieldError, useZodForm } from "@/components/zod-form";
import { HelpTip } from "@/components/tooltip";
import { Select } from "@/components/select";
import { Combobox } from "@/components/combobox";
import { useT } from "@/components/i18n";

const TITLE_HINT = "เช่น ผู้จัดการ, นักออกแบบ, ฝ่ายขาย";

export function CreateTeamForm() {
  const tr = useT();
  const { state, pending, formProps, field, error } = useZodForm(TeamFields, createTeam);
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-start">
      <div>
        <label className="label" htmlFor="team-name">{tr("ชื่อทีม")}</label>
        <input id="team-name" className="input" maxLength={60} required {...field("name")} />
        <FieldError name="name" message={error("name")} />
      </div>
      <div>
        <label className="label" htmlFor="team-title">{tr("บทบาทของคุณ")}{" "}<span className="font-normal text-slate-400">{tr("(ไม่บังคับ)")}</span></label>
        <input id="team-title" className="input" maxLength={40} placeholder={tr(TITLE_HINT)} {...field("title")} />
        <FieldError name="title" message={error("title")} />
      </div>
      <SubmitButton className="btn min-h-11 sm:mt-[1.625rem]" pendingText={tr("กำลังสร้าง...")} pending={pending}>{tr("สร้างทีม")}</SubmitButton>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}

export function SubTeamForm({ teamId }: { teamId: string }) {
  const tr = useT();
  const [state, action] = useActionState(createSubTeam, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="min-w-0 flex-1 basis-48">
        <label className="label" htmlFor="sub-name">{tr("ชื่อทีมย่อย")}</label>
        <input id="sub-name" name="name" className="input" maxLength={60} required />
      </div>
      <SubmitButton className="btn-ghost min-h-11">{tr("เพิ่มทีมย่อย")}</SubmitButton>
      <div className="basis-full"><FormMessage state={state} /></div>
    </form>
  );
}

export function InviteForm({
  teamId,
  canInviteLead,
  contacts,
  titles,
}: {
  teamId: string;
  canInviteLead: boolean;
  /** คนที่เคยเชิญ/เคยอยู่ทีมเดียวกัน — เลือกได้โดยไม่ต้องพิมพ์อีเมลใหม่ */
  contacts: { email: string; name: string }[];
  /** ชื่อบทบาทที่ใช้อยู่ในทีมนี้ */
  titles: string[];
}) {
  const tr = useT();
  const { state, pending, formProps, field, error } = useZodForm(InviteFields, inviteMember, { resetOnSuccess: true });
  const [copied, setCopied] = useState(false);
  return (
    <form {...formProps} onSubmit={(e) => { setCopied(false); formProps.onSubmit(e); }} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_9rem_auto] sm:items-start">
      <input type="hidden" name="teamId" value={teamId} />
      <div>
        <label className="label" htmlFor="invite-email">{tr("อีเมลของคนที่จะเชิญ")}</label>
        <Combobox id="invite-email" type="email" className="input" required options={contacts.map((c) => ({ value: c.email, hint: c.name }))} {...field("email")} />
        <FieldError name="email" message={error("email")} />
      </div>
      <div>
        <label className="label" htmlFor="invite-title">{tr("บทบาท")}{" "}<span className="font-normal text-slate-400">{tr("(ไม่บังคับ)")}</span></label>
        <Combobox id="invite-title" className="input" maxLength={40} placeholder={tr(TITLE_HINT)} options={titles.map((t) => ({ value: t }))} {...field("title")} />
        <FieldError name="title" message={error("title")} />
      </div>
      <div>
        <div className="mb-1.5 flex h-5 items-center gap-1">
          <label className="label mb-0" htmlFor="invite-access">{tr("สิทธิ์")}</label>
          <HelpTip title={tr("สิทธิ์ในทีม")}>{tr("สมาชิก: ทำงานและเช็กอินของตัวเอง เห็นงานของเพื่อนร่วมทีม · หัวหน้าทีม: เห็นภาพรวมและมอบหมายงานได้ · เจ้าของทีม: จัดการสมาชิกและตั้งค่าทีมได้ด้วย")}</HelpTip>
        </div>
        <Select id="invite-access" defaultValue="MEMBER" inputProps={field("access")} options={[{ value: "MEMBER", label: tr("สมาชิก") }, ...(canInviteLead ? [{ value: "LEAD", label: tr("หัวหน้าทีม") }] : [])]} />
      </div>
      <SubmitButton className="btn min-h-11 sm:mt-[1.625rem]" pendingText={tr("กำลังเชิญ...")} pending={pending}>{tr("เชิญ")}</SubmitButton>
      <div className="space-y-2 sm:col-span-4">
        <FormMessage state={state} />
        {state?.id && (
          <div className="flex items-center gap-2">
            <input readOnly value={state.id} aria-label={tr("ลิงก์คำเชิญ")} className="input flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(state.id!);
                setCopied(true);
              }}
            >
              {copied ? tr("คัดลอกแล้ว ✓") : tr("คัดลอกลิงก์")}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

type Member = { userId: string; name: string; access: "OWNER" | "LEAD" | "MEMBER"; title: string | null; participates: boolean };

/** แก้สิทธิ์/บทบาทของสมาชิก 1 คน (เจ้าของทีม) — ทุกช่องกว้างคงที่ ให้ทุกแถวเรียงตรงกันไม่ว่าชื่อจะยาวแค่ไหน */
export function MemberForm({ teamId, member, self, titles }: { teamId: string; member: Member; self: boolean; /** ชื่อบทบาทที่ใช้อยู่ในทีมนี้ */ titles: string[] }) {
  const tr = useT();
  const [state, action] = useActionState(updateMember, undefined);
  const [removed, remove] = useActionState(removeMember, undefined);
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="userId" value={member.userId} />
        <Combobox name="title" defaultValue={member.title ?? ""} maxLength={40} placeholder={tr("บทบาท")} aria-label={tr("บทบาทของ {0}", [member.name])} className="input w-36 shrink-0 !min-h-10 py-1.5 !text-sm" options={titles.map((t) => ({ value: t }))} />
        <Select name="access" defaultValue={member.access} aria-label={tr("สิทธิ์ของ {0}", [member.name])} className="w-36 shrink-0 !min-h-10 !text-sm" options={[{ value: "MEMBER", label: tr("สมาชิก") }, { value: "LEAD", label: tr("หัวหน้าทีม") }, { value: "OWNER", label: tr("เจ้าของทีม") }]} />
        <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-slate-600" title={tr("ไม่ติ๊ก = ผู้ดูแลอย่างเดียว ไม่ต้องเช็กอินและไม่ถูกนับในภาพรวม")}>
          <input type="checkbox" name="participates" defaultChecked={member.participates} /> {tr("เช็กอิน")}
        </label>
        <HelpTip title={tr("เช็กอิน")}>{tr("ติ๊กไว้ = คนนี้ต้องส่งเช็กอินประจำวันและถูกนับในภาพรวมทีม · ไม่ติ๊ก = เป็นผู้ดูแลอย่างเดียว เห็นข้อมูลทีมได้แต่ไม่ต้องเช็กอิน")}</HelpTip>
        <SubmitButton className="btn-ghost min-h-9 px-2.5 py-1 text-xs">{tr("บันทึก")}</SubmitButton>
        <button
          type="submit"
          formAction={remove}
          className="w-20 shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-left text-xs text-slate-400 transition hover:text-rose-600"
          aria-label={self ? tr("ออกจากทีมนี้") : tr("เอา {0} ออกจากทีม", [member.name])}
        >
          {self ? tr("ออกจากทีม") : tr("เอาออก")}
        </button>
      </form>
      <FormMessage state={removed?.error ? removed : state} />
    </div>
  );
}

export function LeaveTeamButton({ teamId, userId }: { teamId: string; userId: string }) {
  const tr = useT();
  const [state, action] = useActionState(removeMember, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="userId" value={userId} />
      <button className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:text-rose-600">{tr("ออกจากทีม")}</button>
      <FormMessage state={state} />
    </form>
  );
}

export function VerifyEmailButton() {
  const tr = useT();
  const [state, action] = useActionState(resendVerification, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <SubmitButton className="btn-ghost min-h-9 px-3 py-1 text-xs" pendingText={tr("กำลังส่ง...")}>{tr("ส่งลิงก์ยืนยันอีเมล")}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** ลบทีมถาวร — ต้องพิมพ์ชื่อทีมให้ตรงก่อนปุ่มจะกดได้ */
export function DeleteTeamForm({ teamId, teamName }: { teamId: string; teamName: string }) {
  const tr = useT();
  const [state, action] = useActionState(deleteTeam, undefined);
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div>
        <label className="label" htmlFor="delete-confirm">{tr("พิมพ์")}{" "}<b className="font-semibold text-slate-900">{teamName}</b> {tr("เพื่อยืนยัน")}</label>
        <input id="delete-confirm" name="confirm" className="input max-w-sm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      <FormMessage state={state} />
      <SubmitButton
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-200 disabled:pointer-events-none disabled:opacity-40"
        pendingText={tr("กำลังลบ...")}
        disabled={typed.trim() !== teamName}
      >
        {tr("ลบทีมนี้ถาวร")}
      </SubmitButton>
    </form>
  );
}

export function MeetingUrlForm({ teamId, meetingUrl }: { teamId: string; meetingUrl: string | null }) {
  const tr = useT();
  const [state, action] = useActionState(setMeetingUrl, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="min-w-0 flex-1 basis-64">
        <label className="label" htmlFor="meeting-url">{tr("ลิงก์ห้องประชุม")}{" "}<span className="font-normal text-slate-400">{tr("(เว้นว่าง = ไม่ใช้)")}</span></label>
        <input id="meeting-url" name="meetingUrl" type="url" inputMode="url" className="input" maxLength={500} defaultValue={meetingUrl ?? ""} placeholder="https://meet.google.com/abc-defg-hij" />
      </div>
      <SubmitButton className="btn-ghost min-h-11">{tr("บันทึก")}</SubmitButton>
      <div className="basis-full empty:hidden"><FormMessage state={state} /></div>
    </form>
  );
}
