import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
            S
          </div>
          <h1 className="text-2xl font-semibold">Scrum Framework</h1>
          <p className="text-sm text-slate-500">เข้าสู่ระบบเพื่อส่ง daily scrum</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
