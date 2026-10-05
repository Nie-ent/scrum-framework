"use client";

import { deleteTask } from "@/app/actions/tasks";
import { SwipeToDelete } from "@/components/swipe-to-delete";

/** ปัดขวาเพื่อลบงาน (มือถือ) — สิทธิ์ลบตรวจซ้ำใน deleteTask ฝั่ง server */
export function SwipeDeleteTask({ taskId, children }: { taskId: string; children: React.ReactNode }) {
  return (
    <SwipeToDelete
      label="ลบงาน"
      onDelete={async () => {
        const data = new FormData();
        data.set("id", taskId);
        await deleteTask(data);
      }}
    >
      {children}
    </SwipeToDelete>
  );
}
