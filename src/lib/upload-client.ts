import axios from "axios";
import { translate, type Translate } from "./i18n/core";

/** ไม่ได้ส่งตัวแปลมา = ข้อความไทยตามเดิม */
const same: Translate = (text, vars) => translate("th", text, vars);
import { confirmUpload, requestUpload } from "@/app/actions/attachments";
import { MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, MAX_NOTE_IMAGE_BYTES, NOTE_IMAGE_TYPES, formatBytes, type AttachmentTarget } from "./attachments";

/** ตรวจไฟล์ที่เลือกก่อนอัปโหลด — คืนข้อความ error หรือ null */
export function checkFiles(files: File[], tr: Translate = same): string | null {
  if (files.length > MAX_FILES_PER_UPLOAD) return tr("แนบได้ครั้งละไม่เกิน {0} ไฟล์", [MAX_FILES_PER_UPLOAD]);
  const big = files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return tr('"{0}" ใหญ่เกิน {1}', [big.name, formatBytes(MAX_FILE_BYTES)]);
  if (files.some((f) => f.size === 0)) return tr("แนบไฟล์ว่างไม่ได้");
  return null;
}

/** ความคืบหน้าของการอัปโหลดทั้งชุด: ไฟล์ที่กำลังส่ง และ % รวมตามขนาดไฟล์ */
export type UploadProgress = { fileName: string; index: number; total: number; percent: number };

/**
 * อัปโหลดไฟล์จากเบราว์เซอร์ตรงไปที่ Storage: ขอ signed URL → PUT ไฟล์ → ยืนยันกับ server
 * ใช้ axios เพื่อรายงานความคืบหน้าระหว่างส่ง (fetch บอกไม่ได้ว่าส่งไปแล้วเท่าไร)
 * คืนจำนวนที่สำเร็จ และข้อความ error ของไฟล์ที่ล้ม
 */
export async function uploadFiles(
  target: AttachmentTarget,
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
  tr: Translate = same,
): Promise<{ uploaded: number; errors: string[] }> {
  let uploaded = 0;
  const errors: string[] = [];
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1;
  let sentBefore = 0;
  for (const [index, file] of files.entries()) {
    const report = (loaded: number) =>
      onProgress?.({ fileName: file.name, index, total: files.length, percent: Math.min(100, Math.round(((sentBefore + loaded) / totalBytes) * 100)) });
    report(0);
    try {
      const ticket = await requestUpload({ ...target, name: file.name, mimeType: file.type, size: file.size });
      if ("error" in ticket) {
        errors.push(`${file.name}: ${tr(ticket.error)}`);
        continue;
      }
      await axios.put(ticket.uploadUrl, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
        onUploadProgress: (e) => report(e.loaded),
      });
      if (!(await confirmUpload(ticket.id)).ok) {
        errors.push(`${file.name}: ${tr("อัปโหลดไม่สำเร็จ")}`);
        continue;
      }
      uploaded++;
    } catch {
      errors.push(`${file.name}: ${tr("อัปโหลดไม่สำเร็จ")}`);
    } finally {
      sentBefore += file.size;
      report(0);
    }
  }
  return { uploaded, errors };
}

/** อัปโหลดรูปหนึ่งรูปเข้าโน้ต — คืน URL ที่ใช้ใน Markdown (/api/files/<id>) หรือข้อความ error */
export async function uploadNoteImage(noteId: string, file: File, tr: Translate = same): Promise<{ src: string } | { error: string }> {
  if (!NOTE_IMAGE_TYPES.includes(file.type)) return { error: tr("ใส่ได้เฉพาะรูป PNG, JPG, GIF หรือ WebP") };
  if (file.size > MAX_NOTE_IMAGE_BYTES) return { error: tr('"{0}" ใหญ่เกิน {1}', [file.name, formatBytes(MAX_NOTE_IMAGE_BYTES)]) };
  try {
    const ticket = await requestUpload({ noteId, name: file.name || "image", mimeType: file.type, size: file.size });
    if ("error" in ticket) return { error: tr(ticket.error) };
    await axios.put(ticket.uploadUrl, file, { headers: { "Content-Type": file.type } });
    if (!(await confirmUpload(ticket.id)).ok) return { error: tr("อัปโหลดไม่สำเร็จ") };
    return { src: `/api/files/${ticket.id}` };
  } catch {
    return { error: tr("อัปโหลดไม่สำเร็จ") };
  }
}
