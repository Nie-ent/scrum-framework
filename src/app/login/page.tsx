import Image from "next/image";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#e0e7ff_0,_transparent_32rem)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="Pace" width={64} height={64} priority className="mx-auto mb-3" />
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Pace</h1>
          <p className="text-sm text-slate-500">Keep your team moving.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
