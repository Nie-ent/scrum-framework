"use client";

import { useActionState, useState } from "react";
import { resendVerification } from "@/app/actions/auth";
import { createSubTeam, createTeam, deleteTeam, inviteMember, removeMember, setMeetingUrl, updateMember } from "@/app/actions/teams";
import { FormMessage, SubmitButton } from "@/components/form";

const TITLE_HINT = "เช่น Dev, PM, PO, Scrum Master";

export function CreateTeamForm() {
  const [state, action] = useActionState(createTeam, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
      <div>
        <label className="label" htmlFor="team-name">ชื่อทีม</label>
        <input id="team-name" name="name" className="input" maxLength={60} required />
      </div>
      <div>
        <label className="label" htmlFor="team-title">บทบาทของคุณ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label>
        <input id="team-title" name="title" className="input" maxLength={40} placeholder={TITLE_HINT} />
      </div>
      <SubmitButton className="btn" pendingText="กำลังสร้าง...">สร้างทีม</SubmitButton>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}

export function SubTeamForm({ teamId }: { teamId: string }) {
  const [state, action] = useActionState(createSubTeam, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="min-w-0 flex-1 basis-48">
        <label className="label" htmlFor="sub-name">ชื่อทีมย่อย</label>
        <input id="sub-name" name="name" className="input" maxLength={60} required />
      </div>
      <SubmitButton className="btn-ghost">เพิ่มทีมย่อย</SubmitButton>
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
  const [state, action] = useActionState(inviteMember, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_9rem_auto] sm:items-end" onSubmit={() => setCopied(false)}>
      <input type="hidden" name="teamId" value={teamId} />
      <div>
        <label className="label" htmlFor="invite-email">อีเมลของคนที่จะเชิญ</label>
        <input id="invite-email" name="email" type="email" className="input" list="invite-contacts" autoComplete="off" required />
        <datalist id="invite-contacts">
          {contacts.map((c) => <option key={c.email} value={c.email}>{c.name}</option>)}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="invite-title">บทบาท <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label>
        <input id="invite-title" name="title" className="input" maxLength={40} list="team-titles" placeholder={TITLE_HINT} />
        <datalist id="team-titles">{titles.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      <div>
        <label className="label" htmlFor="invite-access">สิทธิ์</label>
        <select id="invite-access" name="access" className="input" defaultValue="MEMBER">
          <option value="MEMBER">สมาชิก</option>
          {canInviteLead && <option value="LEAD">หัวหน้าทีม</option>}
        </select>
      </div>
      <SubmitButton className="btn" pendingText="กำลังเชิญ...">เชิญ</SubmitButton>
      <div className="space-y-2 sm:col-span-4">
        <FormMessage state={state} />
        {state?.id && (
          <div className="flex items-center gap-2">
            <input readOnly value={state.id} aria-label="ลิงก์คำเชิญ" className="input flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(state.id!);
                setCopied(true);
              }}
            >
              {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

type Member = { userId: string; name: string; access: "OWNER" | "LEAD" | "MEMBER"; title: string | null; participates: boolean };

/** แก้สิทธิ์/บทบาทของสมาชิก 1 คน (เจ้าของทีม) — รายการบทบาทให้เลือก (datalist#team-titles-edit) อยู่ที่หน้า */
export function MemberForm({ teamId, member, self }: { teamId: string; member: Member; self: boolean }) {
  const [state, action] = useActionState(updateMember, undefined);
  const [removed, remove] = useActionState(removeMember, undefined);
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="userId" value={member.userId} />
        <input name="title" defaultValue={member.title ?? ""} maxLength={40} list="team-titles-edit" placeholder="บทบาท" aria-label={`บทบาทของ ${member.name}`} className="input w-36 py-1.5" />
        <select name="access" defaultValue={member.access} aria-label={`สิทธิ์ของ ${member.name}`} className="input w-32 py-1.5">
          <option value="MEMBER">สมาชิก</option>
          <option value="LEAD">หัวหน้าทีม</option>
          <option value="OWNER">เจ้าของทีม</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600" title="ไม่ติ๊ก = ผู้ดูแลอย่างเดียว ไม่ต้องเช็กอินและไม่ถูกนับในภาพรวม">
          <input type="checkbox" name="participates" defaultChecked={member.participates} /> เช็กอิน
        </label>
        <SubmitButton className="btn-ghost min-h-9 px-2.5 py-1 text-xs">บันทึก</SubmitButton>
        <button
          type="submit"
          formAction={remove}
          className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:text-rose-600"
          aria-label={self ? "ออกจากทีมนี้" : `เอา ${member.name} ออกจากทีม`}
        >
          {self ? "ออกจากทีม" : "เอาออก"}
        </button>
      </form>
      <FormMessage state={removed?.error ? removed : state} />
    </div>
  );
}

export function LeaveTeamButton({ teamId, userId }: { teamId: string; userId: string }) {
  const [state, action] = useActionState(removeMember, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="userId" value={userId} />
      <button className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:text-rose-600">ออกจากทีม</button>
      <FormMessage state={state} />
    </form>
  );
}

export function VerifyEmailButton() {
  const [state, action] = useActionState(resendVerification, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <SubmitButton className="btn-ghost min-h-9 px-3 py-1 text-xs" pendingText="กำลังส่ง...">ส่งลิงก์ยืนยันอีเมล</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** ลบทีมถาวร — ต้องพิมพ์ชื่อทีมให้ตรงก่อนปุ่มจะกดได้ */
export function DeleteTeamForm({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [state, action] = useActionState(deleteTeam, undefined);
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div>
        <label className="label" htmlFor="delete-confirm">พิมพ์ <b className="font-semibold text-slate-900">{teamName}</b> เพื่อยืนยัน</label>
        <input id="delete-confirm" name="confirm" className="input max-w-sm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      <FormMessage state={state} />
      <SubmitButton
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-200 disabled:pointer-events-none disabled:opacity-40"
        pendingText="กำลังลบ..."
        disabled={typed.trim() !== teamName}
      >
        ลบทีมนี้ถาวร
      </SubmitButton>
    </form>
  );
}

export function MeetingUrlForm({ teamId, meetingUrl }: { teamId: string; meetingUrl: string | null }) {
  const [state, action] = useActionState(setMeetingUrl, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="min-w-0 flex-1 basis-64">
        <label className="label" htmlFor="meeting-url">ลิงก์ห้องประชุม <span className="font-normal text-slate-400">(เว้นว่าง = ไม่ใช้)</span></label>
        <input id="meeting-url" name="meetingUrl" type="url" inputMode="url" className="input" maxLength={500} defaultValue={meetingUrl ?? ""} placeholder="https://meet.google.com/abc-defg-hij" />
      </div>
      <SubmitButton className="btn-ghost">บันทึก</SubmitButton>
      <div className="basis-full empty:hidden"><FormMessage state={state} /></div>
    </form>
  );
}
