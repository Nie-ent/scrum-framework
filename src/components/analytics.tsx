"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/** ลิงก์ที่มี token ลับในเส้นทาง — ส่งแค่ชื่อหน้า */
const TOKEN_PATH = /^\/(invite|verify-email|reset-password)\/[^/]+/;

/**
 * Vercel Web Analytics — ตัด query ทิ้ง (มีชื่อคนที่ค้นหา, id ทีม/งาน) และซ่อน token ในเส้นทาง
 * ข้อมูลที่ส่งจึงเหลือแค่ว่าเปิดหน้าไหน
 */
function scrub(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(TOKEN_PATH, "/$1/[token]");
  return { ...event, url: url.toString() };
}

export function PaceAnalytics() {
  return <Analytics beforeSend={scrub} />;
}
