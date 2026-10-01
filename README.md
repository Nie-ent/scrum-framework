# Pace

**Keep your team moving.**

ระบบ Daily Scrum ด้วย Next.js 16 + PostgreSQL (Prisma) — มี login, role ที่กำหนด level ได้เอง และหน้าภาพรวมสำหรับหัวหน้า

## ฟีเจอร์

- **Daily Scrum แยกต่อทีม** — ส่งได้วันละ 1 ครั้งต่อทีม (แก้ไขได้ทั้งวัน) คนที่อยู่หลายทีมมีแท็บเลือกทีม กระดานของแต่ละทีมเห็นเฉพาะสิ่งที่เขียนให้ทีมนั้น
  - ล่าสุดทำอะไรไป / วันนี้จะทำอะไร เป็น **รายการ task** — กด Enter เพื่อขึ้น task ใหม่, Backspace ในบรรทัดว่างเพื่อลบ, วางหลายบรรทัดได้
  - task ใน "วันนี้จะทำอะไร" จะขึ้นเป็น "ล่าสุดทำอะไรไป" ของเช็กอินครั้งถัดไป (ทีมเดียวกัน) ให้อัปเดต **% ความคืบหน้า** ของแต่ละ task (ติ๊ก ✓ = 100%) งานที่ยังไม่ถึง 100% จะถูกยกไป "วันนี้จะทำอะไร" อัตโนมัติพร้อม % ล่าสุด (กด × นำออกได้ถ้าไม่ทำต่อ)
  - กระดานและหน้าภาพรวมแสดง % รายงาน และ % เฉลี่ยของแต่ละคน
  - ต้องการความช่วยเหลือ (Blocker) / สิ่งที่ควรปรับปรุง / สิ่งที่ไปได้ดี
- **ภาพรวมทีม** (หัวหน้า) — ส่งแล้วกี่คน, blockers ที่ต้องปลดล็อก, รวม not work / work well, การ์ดรายคน, ใครยังไม่ส่ง, ตารางการส่งย้อนหลัง 7 วัน, ย้อนดูวันก่อน ๆ และประวัติรายคน
- **ทีมซ้อนกันได้ 2 ชั้น** (ทีมใหญ่ → ทีมย่อย) และคนหนึ่งอยู่ได้หลายทีม
- **หัวหน้ารายทีม** — ติ๊ก ★ หัวหน้าให้สมาชิกในแต่ละทีม หัวหน้าทีมใหญ่เห็นภาพรวมทุกทีมย่อย หัวหน้าทีมย่อยเห็นเฉพาะทีมตัวเอง
- **Role & Level** — สร้าง role เองได้ level กำหนดสิทธิ์ระดับระบบ:

| Level | สิทธิ์ |
|------:|--------|
| ≥ 10  | Member — ส่ง daily scrum ของตัวเอง |
| ≥ 80  | Manager — ดูภาพรวมทุกทีม |
| ≥ 100 | Admin — จัดการผู้ใช้ / role / ทีม |

  ปรับเกณฑ์ได้ที่ `src/lib/permissions.ts` · Admin กำหนด role/level สูงกว่าตัวเองไม่ได้ และลดสิทธิ์/ปิดบัญชีตัวเองไม่ได้

Role ตั้งต้น: Admin (100), Manager (80), Scrum Master (50), Team Lead (50), Developer (10), QA (10)

## ติดตั้งเป็นแอปบนมือถือ (PWA)

เปิดเว็บบนมือถือแล้วเพิ่มลงหน้าจอหลัก จะได้ไอคอน Pace และเปิดเต็มจอเหมือนแอป
- **Android (Chrome):** เมนู ⋮ → "ติดตั้งแอป" / "เพิ่มลงในหน้าจอหลัก"
- **iPhone (Safari):** ปุ่ม Share → "เพิ่มไปยังหน้าจอโฮม"

ตั้งค่าอยู่ที่ `src/app/manifest.ts` · ไอคอนอยู่ใน `public/icon-*.png` · ยังต้องมีอินเทอร์เน็ตตอนใช้งาน (ไม่มี service worker)

## แจ้งเตือนเช็กอิน (Push notification)

ผู้ใช้เปิดเองที่หน้า **บัญชี → แจ้งเตือนเช็กอิน** (ตั้งค่าแยกรายเครื่อง) ระบบจะเตือนเฉพาะคนที่ยังไม่ได้เช็กอินของวันนั้น

- เวลาเตือนกำหนดใน `vercel.json` (`0 2 * * 1-5` = 09:00 เวลาไทย จันทร์–ศุกร์) — แผน Hobby ของ Vercel รันได้วันละครั้งและเวลาอาจคลาดได้ภายในชั่วโมงนั้น
- ต้องตั้ง env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (สร้างด้วย `npx web-push generate-vapid-keys`), `VAPID_SUBJECT`, `CRON_SECRET`
- ถ้าไม่ได้ใช้ Vercel (เช่น Docker) ให้ตั้ง cron ภายนอกเรียก `GET /api/cron/checkin-reminder` พร้อม header `Authorization: Bearer $CRON_SECRET`
- iPhone รับแจ้งเตือนได้เมื่อติดตั้ง Pace ลงหน้าจอโฮมแล้ว (iOS 16.4+)

## รันด้วย Docker (แนะนำ)

```bash
cp .env.example .env         # แก้ AUTH_SECRET และ SEED_ADMIN_PASSWORD
export AUTH_SECRET=$(openssl rand -base64 32)
docker compose up -d --build
```

เปิด http://localhost:3000 แล้ว login ด้วย `admin@example.com` / `admin1234` (หรือค่าที่ตั้งใน env) — **เปลี่ยนรหัสผ่านทันที**

- ถ้าพอร์ตชน: `APP_PORT=3100 DB_PORT=5433 docker compose up -d`
- container จะรัน `prisma migrate deploy` + seed (idempotent) ทุกครั้งที่ start
- ข้อมูลตัวอย่าง: `docker compose exec app node prisma/seed-demo.mjs` (รหัสผ่านทุกคน `password123`, เช่น `lead@example.com`, `manager@example.com`)

## รันแบบ dev

```bash
docker compose up -d db      # หรือใช้ Postgres ของตัวเอง
cp .env.example .env
npm install
npm run db:deploy && npm run db:seed
npm run db:seed-demo         # (ไม่บังคับ) ข้อมูลตัวอย่าง
npm run dev
```

แก้ schema: แก้ `prisma/schema.prisma` แล้ว `npm run db:migrate -- --name <ชื่อ>`

## Environment variables

| ตัวแปร | คำอธิบาย |
|--------|---------|
| `DATABASE_URL` | Postgres connection string (runtime — บน Supabase ใช้ pooler 6543) |
| `DIRECT_URL` | connection string สำหรับ migrate (local/docker ใช้ค่าเดียวกับ `DATABASE_URL`) |
| `AUTH_SECRET` | secret สำหรับเซ็น session (≥ 32 ตัวอักษร) |
| `APP_TIMEZONE` | timezone ที่ใช้ตัดวัน (default `Asia/Bangkok`) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | admin คนแรก (สร้างครั้งเดียว) |
| `COOKIE_SECURE` | ตั้ง `false` เฉพาะตอนรัน production ผ่าน http |
| `SKIP_SEED` | `true` = ไม่รัน seed ตอน start |

## โครงสร้าง

```
prisma/                 schema, migrations, seed
src/proxy.ts            กัน route ที่ต้อง login
src/lib/                auth/session (JWT cookie), permissions, dates, scope
src/app/actions/        server actions (auth, standup, admin)
src/app/(app)/standup   ฟอร์ม daily scrum + ประวัติ
src/app/(app)/dashboard ภาพรวมทีม + ประวัติรายคน
src/app/(app)/admin     จัดการผู้ใช้ / roles & levels / ทีม
```

## Deploy ฟรีด้วย Vercel + Supabase

1. **Supabase** — สมัครที่ [supabase.com](https://supabase.com) → New project (region Southeast Asia / Singapore) → จดรหัสผ่าน database ไว้
2. ไปที่ **Connect** (ปุ่มด้านบนของ project) → แท็บ **ORMs → Prisma** จะได้ 2 URL:
   - `DATABASE_URL` — Transaction pooler (port **6543**) ต่อท้าย `?pgbouncer=true&connection_limit=1`
   - `DIRECT_URL` — Session pooler (port **5432**) ใช้ตอน migrate
3. **Vercel** — [vercel.com/new](https://vercel.com/new) → Import repo นี้ → เพิ่ม Environment Variables:

| ตัวแปร | ค่า |
|--------|-----|
| `DATABASE_URL` | Transaction pooler URL (6543) |
| `DIRECT_URL` | Session pooler URL (5432) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_TIMEZONE` | `Asia/Bangkok` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | admin คนแรก |

4. กด Deploy — script `vercel-build` จะรัน migration + สร้าง admin (ครั้งแรกเท่านั้น) + build ให้เอง
5. เปิด `https://<project>.vercel.app` แล้ว login ด้วย admin ที่ตั้งไว้ · push เข้า `main` = deploy ใหม่อัตโนมัติ

หมายเหตุ
- `vercel.json` กำหนดให้ function รันที่ `bom1` (Mumbai) ให้อยู่ region เดียวกับ Supabase — ถ้าย้าย DB ไป region อื่น ให้เปลี่ยนตามกัน (เช่น Singapore = `sin1`) ไม่งั้นทุก query จะช้ามาก
- ตารางเปิด Row Level Security ไว้ (migration `0002_enable_rls`) เพื่อไม่ให้เข้าถึงข้อมูลผ่าน Supabase Data API ได้ — แอปต่อผ่าน Prisma จึงไม่กระทบ
- Supabase free จะ **pause project ถ้าไม่มีการใช้งาน 7 วัน** (กด Restore ใน dashboard ได้) — ถ้าทีมใช้ทุกวันทำงานจะไม่เจอ
- Vercel Hobby ฟรีสำหรับใช้งานที่ไม่ใช่เชิงพาณิชย์

## Deploy ที่ไหนดี

| ตัวเลือก | เหมาะกับ | หมายเหตุ |
|---------|---------|---------|
| **Railway** ⭐ | ทีมเล็ก-กลาง อยากง่ายสุด | build จาก Dockerfile ได้เลย + Postgres ในคลิกเดียว, ~$5–10/เดือน |
| **Render** | คล้าย Railway | Web Service (Docker) + Render Postgres, free tier มี cold start |
| **VPS + Docker Compose** (DigitalOcean / Hetzner / Vultr) | คุมเองทั้งหมด ถูกสุดระยะยาว | ใช้ `docker-compose.yml` นี้ + Caddy/Nginx ทำ HTTPS, ~$5–6/เดือน |
| **Coolify / Dokploy บน VPS** | อยากได้ UI แบบ PaaS แต่ถือเครื่องเอง | deploy จาก git push, จัดการ SSL/backup ให้ |
| **Vercel + Supabase** ⭐ ฟรี | ไม่ต้องใช้ Docker | ตั้งค่าไว้แล้วใน repo (ดูหัวข้อด้านบน) |
| **Google Cloud Run + Cloud SQL** | องค์กร / scale อัตโนมัติ | จ่ายตามใช้งาน แต่ Cloud SQL มีค่าใช้จ่ายขั้นต่ำ |

คำแนะนำ: เริ่มที่ **Railway** (ง่ายและเร็ว) หรือ **VPS + Coolify** ถ้าอยากคุมค่าใช้จ่ายและข้อมูลเอง
ทุกแบบต้องตั้ง `AUTH_SECRET` และใช้ HTTPS (อย่าตั้ง `COOKIE_SECURE=false` บน production)
