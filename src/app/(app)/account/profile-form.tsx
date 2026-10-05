"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeAvatar, updateProfile, uploadAvatar } from "@/app/actions/profile";
import { Avatar } from "@/components/avatar";
import { FormMessage, SubmitButton } from "@/components/form";

const AVATAR_SIZE = 256;

/** ครอปเป็นสี่เหลี่ยมจัตุรัสตรงกลาง แล้วย่อเหลือ 256×256 JPEG ก่อนอัปโหลด */
async function resizeToSquare(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // พื้นขาวแทนส่วนโปร่งใสของ PNG
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.86),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileForm({
  user,
}: {
  user: { id: string; name: string; email: string; avatarUpdatedAt: Date | null; summary: string };
}) {
  const router = useRouter();
  const [state, action] = useActionState(updateProfile, undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoMessage({ tone: "error", text: "กรุณาเลือกไฟล์รูปภาพ" });
      return;
    }
    startUpload(async () => {
      setPhotoMessage(null);
      try {
        const blob = await resizeToSquare(file);
        setPreview(URL.createObjectURL(blob));
        const data = new FormData();
        data.append("avatar", blob, "avatar.jpg");
        const result = await uploadAvatar(data);
        if (!result.ok) {
          setPreview(null);
          setPhotoMessage({ tone: "error", text: result.error ?? "อัปโหลดไม่สำเร็จ" });
          return;
        }
        setPhotoMessage({ tone: "ok", text: "เปลี่ยนรูปโปรไฟล์แล้ว" });
        router.refresh();
      } catch {
        setPreview(null);
        setPhotoMessage({ tone: "error", text: "เปิดไฟล์รูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG" });
      }
    });
  }

  function onRemove() {
    startUpload(async () => {
      await removeAvatar();
      setPreview(null);
      setPhotoMessage({ tone: "ok", text: "ลบรูปโปรไฟล์แล้ว" });
      router.refresh();
    });
  }

  const hasPhoto = Boolean(preview || user.avatarUpdatedAt);

  return (
    <section className="card space-y-5">
      <p className="eyebrow">Profile</p>
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- พรีวิวจากไฟล์ในเครื่อง
          <img src={preview} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-full object-cover" />
        ) : (
          <Avatar user={user} size={72} />
        )}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? "กำลังอัปโหลด…" : hasPhoto ? "เปลี่ยนรูป" : "เพิ่มรูปโปรไฟล์"}
            </button>
            {hasPhoto && (
              <button type="button" className="btn-ghost text-rose-700" disabled={uploading} onClick={onRemove}>
                ลบรูป
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">ระบบจะครอปตรงกลางเป็นสี่เหลี่ยมจัตุรัสให้อัตโนมัติ</p>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onPick} />
        </div>
      </div>
      {photoMessage && (
        <p role="status" className={`rounded-xl px-3 py-2 text-sm font-medium ${photoMessage.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {photoMessage.text}
        </p>
      )}

      <form action={action} className="space-y-4 border-t border-slate-100 pt-5">
        <div>
          <label className="label" htmlFor="profile-name">ชื่อที่แสดง</label>
          <input id="profile-name" name="name" className="input" defaultValue={user.name} maxLength={100} required />
        </div>
        <div>
          <label className="label" htmlFor="profile-email">อีเมล</label>
          <input id="profile-email" className="input bg-slate-50 text-slate-500" value={user.email} readOnly />
          <p className="mt-1 text-xs text-slate-400">ใช้สำหรับ login — ถ้าต้องการเปลี่ยน ติดต่อผู้ดูแลระบบ</p>
        </div>
        <p className="text-sm text-slate-500">{user.summary}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FormMessage state={state} />
          <SubmitButton className="btn ml-auto">บันทึกโปรไฟล์</SubmitButton>
        </div>
      </form>
    </section>
  );
}
