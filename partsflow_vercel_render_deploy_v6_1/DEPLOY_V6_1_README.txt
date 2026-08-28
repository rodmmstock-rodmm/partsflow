PartsFlow V6.1 - Vercel Frontend + Render Django Backend
========================================================

ไฟล์ชุดนี้เป็น Deployment Patch วางทับที่ root ของ repo /workspaces/partsflow
ไม่แก้ Mobile UI และไม่แก้ styles.css

สถาปัตยกรรม Production
-----------------------
Vercel (frontend React/Vite)
        -> Render (Django API)
        -> Supabase PostgreSQL

1) วางไฟล์
-----------
แตก ZIP แล้ว copy ทุกอย่างไปที่:
/workspaces/partsflow

2) Commit + Push GitHub
-----------------------
cd /workspaces/partsflow
git add .
git commit -m "Prepare PartsFlow V6.1 for Vercel and Render"
git push

3) Deploy Backend บน Render ก่อน
----------------------------------
Render -> New -> Blueprint -> เลือก GitHub repo PartsFlow
Render จะอ่าน render.yaml ที่ root

ตั้ง Environment Variables ที่ Render:

DATABASE_URL
  = Supabase PostgreSQL connection string
  แนะนำ Session Pooler :5432 สำหรับ Render persistent backend ถ้า Render ใช้ IPv4

ALLOWED_HOSTS
  = partsflow-api.onrender.com
  เปลี่ยนให้ตรงกับ hostname Render จริง (ไม่มี https://)

CORS_ALLOWED_ORIGINS
  = ตอนแรกสามารถเว้นไว้จนได้ Vercel URL แล้วค่อยใส่
  เช่น https://partsflow.vercel.app

CSRF_TRUSTED_ORIGINS
  = URL Vercel เดียวกัน
  เช่น https://partsflow.vercel.app

SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
  = ใช้ค่าเดียวกับ backend ปัจจุบัน ถ้ามีการใช้ Supabase Storage

APPSHEET_SHARED_KEY
  = เก็บไว้ถ้ายังต้องการให้ AppSheet webhook ใช้งานต่อ

ถ้าโปรเจกต์มี Google Drive/OAuth env เพิ่มเติม ให้ย้าย env เหล่านั้นจาก backend .env ปัจจุบันไป Render ด้วย
ห้ามใส่ secret ลง GitHub

เมื่อ Backend deploy สำเร็จ จะได้ URL เช่น:
https://partsflow-api.onrender.com

ทดสอบ:
https://partsflow-api.onrender.com/api/appsheet/health/

4) Deploy Frontend บน Vercel
-----------------------------
Vercel -> Add New Project -> Import GitHub repo

Root Directory:
frontend

Framework Preset:
Vite

Build Command:
npm run build

Output Directory:
dist

Environment Variable:
VITE_API_BASE_URL=https://partsflow-api.onrender.com/api

Deploy

5) หลังได้ Vercel URL
----------------------
สมมุติได้:
https://partsflow.vercel.app

กลับไป Render -> Environment แล้วตั้ง:
CORS_ALLOWED_ORIGINS=https://partsflow.vercel.app
CSRF_TRUSTED_ORIGINS=https://partsflow.vercel.app

ถ้ามี Custom Domain ให้ใส่หลายค่าโดยคั่น comma เช่น:
CORS_ALLOWED_ORIGINS=https://partsflow.vercel.app,https://partsflow.example.com
CSRF_TRUSTED_ORIGINS=https://partsflow.vercel.app,https://partsflow.example.com

แล้ว Redeploy Render 1 ครั้ง

6) ทดสอบ Production
--------------------
Desktop:
- Login Employee Code
- Dashboard
- Stock
- History
- Safety Stock
- Order
- Order Step
- Fast Order
- Vendor
- Machine
- Role

Mobile:
- เปิด Vercel URL จากมือถือ
- Login
- เบิกอะไหล่
- รับเข้าอะไหล่
- ตรวจ stock หลังบันทึก
- Order / Fast Order

7) สำคัญ
--------
- Vercel host เฉพาะ React/Vite frontend
- Django อยู่ Render
- Database ยังคง Supabase เดิม ไม่สร้าง Render PostgreSQL ใหม่
- อย่าใช้ DATABASE_URL ของฐานใหม่จาก Render เพราะ PartsFlow ต้องใช้ Supabase Source of Truth เดิม
- อย่าใส่ SUPABASE_SERVICE_ROLE_KEY หรือ DATABASE_URL ใน Vercel frontend
- frontend ต้องรู้เพียง VITE_API_BASE_URL
- settings.py ชุดนี้คง CONN_MAX_AGE=0 เพื่อช่วยลดปัญหา Supabase connection/session exhaustion ตามสถาปัตยกรรมปัจจุบัน

