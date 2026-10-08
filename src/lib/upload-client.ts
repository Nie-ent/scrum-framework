import { confirmUpload, requestUpload } from "@/app/actions/attachments";
import { MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, formatBytes, type AttachmentTarget } from "./attachments";

/** ตรวจไฟล์ที่เลือกก่อนอัปโหลด — คืนข้อความ error หรือ null */
export function checkFiles(files: File[]): string | null {
  if (files.length > MAX_FILES_PER_UPLOAD) return `แนบได้ครั้งละไม่เกิน ${MAX_FILES_PER_UPLOAD} ไฟล์`;
  const big = files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return `"${big.name}" ใหญ่เกิน ${formatBytes(MAX_FILE_BYTES)}`;
  if (files.some((f) => f.size === 0)) return "แนบไฟล์ว่างไม่ได้";
  return null;
}

/**
 * อัปโหลดไฟล์จากเบราว์เซอร์ตรงไปที่ Storage: ขอ signed URL → PUT ไฟล์ → ยืนยันกับ server
 * คืนจำนวนที่สำเร็จ และข้อความ error ของไฟล์ที่ล้ม
 */
export async function uploadFiles(target: AttachmentTarget, files: File[]): Promise<{ uploaded: number; errors: string[] }> {
  let uploaded = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const ticket = await requestUpload({ ...target, name: file.name, mimeType: file.type, size: file.size });
      if ("error" in ticket) {
        errors.push(`${file.name}: ${ticket.error}`);
        continue;
      }
      const res = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok || !(await confirmUpload(ticket.id)).ok) {
        errors.push(`${file.name}: อัปโหลดไม่สำเร็จ`);
        continue;
      }
      uploaded++;
    } catch {
      errors.push(`${file.name}: อัปโหลดไม่สำเร็จ`);
    }
  }
  return { uploaded, errors };
}
