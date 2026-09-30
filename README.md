# Scrum Framework

ระบบ Daily Scrum ด้วย Next.js 16 + PostgreSQL (Prisma) — มี login, role ที่กำหนด level ได้เอง และหน้าภาพรวมสำหรับหัวหน้า

## ฟีเจอร์

- **Daily Scrum** — ทุกคนส่งได้วันละ 1 ครั้ง (แก้ไขได้ทั้งวัน)
  - ล่าสุดทำอะไรไป (Yesterday) — ดึงแผน "วันนี้" ของครั้งก่อนมาเป็นค่าตั้งต้นให้
  - วันนี้จะทำอะไร (Today)
  - ติดปัญหาอะไร (Blockers)
  - อะไรที่ไม่เวิร์ก (Not work) / อะไรที่เวิร์ก (Work well)
- **ภาพรวมทีม** (หัวหน้า) — ส่งแล้วกี่คน, blockers ที่ต้องปลดล็อก, รวม not work / work well, การ์ดรายคน, ใครยังไม่ส่ง, ตารางการส่งย้อนหลัง 7 วัน, ย้อนดูวันก่อน ๆ และประวัติรายคน
- **Role & Level** — สร้าง role เองได้ สิทธิ์ตัดสินจาก level:

| Level | สิทธิ์ |
|------:|--------|
| ≥ 10  | Member — ส่ง daily scrum ของตัวเอง |
| ≥ 50  | Lead — ดูภาพรวมทีมตัวเอง |
| ≥ 80  | Manager — ดูภาพรวมทุกทีม |
| ≥ 100 | Admin — จัดการผู้ใช้ / role / ทีม |

  ปรับเกณฑ์ได้ที่ `src/lib/permissions.ts` · Admin กำหนด role/level สูงกว่าตัวเองไม่ได้ และลดสิทธิ์/ปิดบัญชีตัวเองไม่ได้

Role ตั้งต้น: Admin (100), Manager (80), Scrum Master (50), Team Lead (50), Developer (10), QA (10)

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
| `DATABASE_URL` | Postgres connection string |
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

## Deploy ฟรีด้วย Render + Neon

1. **Neon** — สมัครที่ [neon.tech](https://neon.tech) → สร้าง project (region Singapore) → copy connection string แบบ **direct** (ปิด "Connection pooling" — URL ต้องไม่มี `-pooler`) แล้วต่อท้ายด้วย `&connect_timeout=15`
2. **Render** — [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → เลือก repo นี้ (ใช้ `render.yaml`)
3. กรอกค่าที่ Render ถาม: `DATABASE_URL` (จาก Neon), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — `AUTH_SECRET` สร้างให้อัตโนมัติ
4. รอ deploy เสร็จ → เปิด URL `https://<ชื่อ>.onrender.com` แล้ว login ด้วย admin ที่ตั้งไว้

container จะรัน migration + สร้าง admin ให้เองตอน start · push เข้า `main` = deploy ใหม่อัตโนมัติ

ข้อจำกัดของ free tier: Render หลับเมื่อไม่มีคนใช้ 15 นาที (เปิดครั้งแรกรอ ~30–60 วิ) และ Neon พัก compute เมื่อว่าง (query แรกช้าขึ้นเล็กน้อย)

## Deploy ที่ไหนดี

| ตัวเลือก | เหมาะกับ | หมายเหตุ |
|---------|---------|---------|
| **Railway** ⭐ | ทีมเล็ก-กลาง อยากง่ายสุด | build จาก Dockerfile ได้เลย + Postgres ในคลิกเดียว, ~$5–10/เดือน |
| **Render** | คล้าย Railway | Web Service (Docker) + Render Postgres, free tier มี cold start |
| **VPS + Docker Compose** (DigitalOcean / Hetzner / Vultr) | คุมเองทั้งหมด ถูกสุดระยะยาว | ใช้ `docker-compose.yml` นี้ + Caddy/Nginx ทำ HTTPS, ~$5–6/เดือน |
| **Coolify / Dokploy บน VPS** | อยากได้ UI แบบ PaaS แต่ถือเครื่องเอง | deploy จาก git push, จัดการ SSL/backup ให้ |
| **Vercel + Neon/Supabase Postgres** | ไม่ต้องใช้ Docker | deploy Next.js ได้ดีที่สุด แต่ไม่ได้ใช้ Dockerfile |
| **Google Cloud Run + Cloud SQL** | องค์กร / scale อัตโนมัติ | จ่ายตามใช้งาน แต่ Cloud SQL มีค่าใช้จ่ายขั้นต่ำ |

คำแนะนำ: เริ่มที่ **Railway** (ง่ายและเร็ว) หรือ **VPS + Coolify** ถ้าอยากคุมค่าใช้จ่ายและข้อมูลเอง
ทุกแบบต้องตั้ง `AUTH_SECRET` และใช้ HTTPS (อย่าตั้ง `COOKIE_SECURE=false` บน production)
