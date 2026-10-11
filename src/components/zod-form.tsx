"use client";

import { useActionState, useEffect, useRef, useTransition, type FormEvent } from "react";
import { useForm, type FieldValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type * as z from "zod";
import type { FormState } from "@/app/actions/auth";

/**
 * ฟอร์มที่ตรวจด้วย zod ในเบราว์เซอร์ (react-hook-form) แล้วส่งเข้า server action
 * - ตรวจรายช่องเมื่อออกจากช่อง และตรวจทั้งฟอร์มก่อนส่ง ข้อผิดพลาดขึ้นใต้ช่องนั้น
 * - ผ่านแล้วจึงเรียก server action ด้วยค่าจากฟอร์มจริง (ช่องที่ไม่ได้ register เช่น hidden input ไปด้วย)
 * - ถ้า JavaScript ยังไม่ทำงาน ฟอร์มยังส่งเข้า action เดิมได้ และ server ตรวจด้วย schema เดียวกัน
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  action: (state: FormState, formData: FormData) => Promise<FormState>,
  options: { resetOnSuccess?: boolean } = {},
) {
  type Values = z.input<S>;
  const [state, formAction, submitting] = useActionState(action, undefined);
  const [waiting, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) as never, mode: "onTouched" });
  const { reset } = form;

  // เรียก action เองจึงไม่ได้ล้างฟอร์มให้อัตโนมัติเหมือนการส่งแบบปกติ
  useEffect(() => {
    if (options.resetOnSuccess && state?.ok) {
      ref.current?.reset();
      reset();
    }
  }, [state, options.resetOnSuccess, reset]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // ค่าที่เบราว์เซอร์/ตัวจัดการรหัสผ่านเติมให้โดยไม่ยิง event จะยังไม่ถึง react-hook-form — อ่านจากช่องจริงก่อนตรวจ
    const registered = form.getValues();
    for (const [name, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && name in registered) form.setValue(name as Path<Values>, value as never);
    }
    void form.handleSubmit(() => {
      const data = new FormData(ref.current!);
      startTransition(() => formAction(data));
    })(event);
  };

  return {
    state,
    pending: submitting || waiting,
    formProps: { ref, action: formAction, onSubmit, noValidate: true },
    /** props ของช่องกรอก + aria สำหรับข้อผิดพลาด */
    field: (name: Path<Values>) => {
      const message = form.formState.errors[name]?.message;
      return { ...form.register(name), "aria-invalid": message ? true : undefined, "aria-describedby": message ? `${name}-error` : undefined };
    },
    error: (name: Path<Values>) => {
      const message = form.formState.errors[name]?.message;
      return typeof message === "string" ? message : undefined;
    },
  };
}

/** ข้อความผิดพลาดใต้ช่องกรอก */
export function FieldError({ name, message }: { name: string; message?: string }) {
  if (!message) return null;
  return <p id={`${name}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-700">{message}</p>;
}
