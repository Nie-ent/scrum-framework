import axios from "axios";
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
        errors.push(`${file.name}: ${ticket.error}`);
        continue;
      }
      await axios.put(ticket.uploadUrl, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
        onUploadProgress: (e) => report(e.loaded),
      });
      if (!(await confirmUpload(ticket.id)).ok) {
        errors.push(`${file.name}: อัปโหลดไม่สำเร็จ`);
        continue;
      }
      uploaded++;
    } catch {
      errors.push(`${file.name}: อัปโหลดไม่สำเร็จ`);
    } finally {
      sentBefore += file.size;
      report(0);
    }
  }
  return { uploaded, errors };
}
