"use client";

import { useEffect, useState, useTransition } from "react";
import { sendTestPush, subscribePush, unsubscribePush } from "@/app/actions/push";
import { useT } from "@/components/i18n";

type Status = "loading" | "unsupported" | "off" | "on" | "denied";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** เปิด/ปิดการแจ้งเตือนเช็กอินของ "เครื่องนี้" */
export function NotificationSettings({ publicKey }: { publicKey: string | null }) {
  const tr = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<Status> => {
      if (!isSupported()) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      return (await registration?.pushManager.getSubscription()) ? "on" : "off";
    })()
      .catch((): Status => "off")
      .then((next) => {
        if (!cancelled) setStatus(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = (task: () => Promise<void>) =>
    startTransition(async () => {
      setMessage(null);
      try {
        await task();
      } catch {
        setMessage({ tone: "error", text: tr("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง") });
      }
    });

  const enable = () =>
    run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey!),
        }));
      const result = await subscribePush(subscription.toJSON());
      if (!result.ok) {
        await subscription.unsubscribe();
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setStatus("on");
      setMessage({ tone: "ok", text: tr("เปิดการแจ้งเตือนบนเครื่องนี้แล้ว") });
    });

  const disable = () =>
    run(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
      setMessage({ tone: "ok", text: tr("ปิดการแจ้งเตือนบนเครื่องนี้แล้ว") });
    });

  const test = () =>
    run(async () => {
      const result = await sendTestPush();
      setMessage(result.ok ? { tone: "ok", text: result.message ?? tr("ส่งแล้ว") } : { tone: "error", text: result.error });
    });

  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{tr("แจ้งเตือนเช็กอิน")}</h2>
          <p className="text-sm text-slate-500">{tr("เตือนตอนเช้าวันทำงาน ถ้ายังไม่ได้ส่งเช็กอินของวันนั้น")}</p>
        </div>
        {status === "on" && <span className="badge badge-success shrink-0">{tr("เปิดอยู่")}</span>}
        {status === "off" && <span className="badge badge-neutral shrink-0">{tr("ปิดอยู่")}</span>}
      </div>

      {!publicKey ? (
        <p className="text-sm text-slate-500">{tr("ระบบยังไม่ได้ตั้งค่าการแจ้งเตือน — ติดต่อผู้ดูแลระบบ")}</p>
      ) : status === "loading" ? (
        <p className="text-sm text-slate-400">{tr("กำลังตรวจสอบ…")}</p>
      ) : status === "unsupported" ? (
        <p className="text-sm text-slate-500">
          {tr("เบราว์เซอร์นี้ยังรับการแจ้งเตือนไม่ได้ — บน iPhone ให้เปิดด้วย Safari แล้วกด Share → \"เพิ่มไปยังหน้าจอโฮม\" จากนั้นเปิด Pace จากไอคอนบนหน้าจอ (ต้องเป็น iOS 16.4 ขึ้นไป)")}
        </p>
      ) : status === "denied" ? (
        <p className="text-sm text-slate-500">{tr("การแจ้งเตือนถูกบล็อกไว้ — เปิดอนุญาตให้เว็บนี้ในการตั้งค่าของเบราว์เซอร์ก่อน แล้วโหลดหน้านี้ใหม่")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "on" ? (
            <>
              <button type="button" className="btn-ghost" onClick={test} disabled={pending}>{tr("ส่งแจ้งเตือนทดสอบ")}</button>
              <button type="button" className="btn-ghost" onClick={disable} disabled={pending}>{tr("ปิดบนเครื่องนี้")}</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={enable} disabled={pending}>
              {pending ? tr("กำลังเปิด…") : tr("เปิดการแจ้งเตือนบนเครื่องนี้")}
            </button>
          )}
        </div>
      )}

      {message && (
        <p role="status" className={`rounded-xl px-3 py-2 text-sm font-medium ${message.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {message.text}
        </p>
      )}
      <p className="text-xs text-slate-400">{tr("ตั้งค่าแยกรายเครื่อง — ถ้าใช้ทั้งมือถือและคอมพิวเตอร์ ให้เปิดในเครื่องที่อยากรับแจ้งเตือน")}</p>
    </section>
  );
}
