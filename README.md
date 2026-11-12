# SciPark

ระบบจองที่จอดรถล่วงหน้าสำหรับคณะวิทยาศาสตร์ สจล. — ดูที่ว่างแบบเรียลไทม์ จองด้วยค่าธรรมเนียม
20 บาท ระบบเลือกช่องจอดให้อัตโนมัติ แล้วยืนยันการมาถึงภายใน 30 นาที ด้วยการสแกน QR ที่ติดอยู่ที่ช่องจอด (ไม่ต้องมีเจ้าหน้าที่) ให้เจ้าหน้าที่สแกน หรือเช็คอินด้วย GPS เมื่ออยู่ในลาน

```
React 18 + Vite 8 + React Router 7 + Tailwind 3   →   Express 5 + Mongoose   →   MongoDB
```

---

## บน AWS

ระบบจริงรันบน AWS ตามสถาปัตยกรรมใน [`infra/README.md`](infra/README.md):
CloudFront + S3 (หน้าเว็บ) → ALB → EC2 Auto Scaling 2 AZ (API, stateless) → MongoDB ใน private subnet
พร้อม Secrets Manager, S3 สำหรับรูปรถ, CloudWatch dashboard/alarm และ CI/CD ด้วย GitHub Actions แบบ zero-downtime

| ไฟล์ | คืออะไร |
|---|---|
| [`infra/scipark.yaml`](infra/scipark.yaml) | CloudFormation: ทั้งระบบในไฟล์เดียว |
| [`infra/github-deploy.yaml`](infra/github-deploy.yaml) | สิทธิ์ให้ GitHub Actions deploy (OIDC หรือ IAM user ที่ทำได้แค่ deploy) |
| [`.github/workflows/`](.github/workflows) | `ci.yml` ทดสอบทุก push · `deploy.yml` deploy เมื่อ push เข้า main |
| [`infra/scripts/`](infra/scripts) | สร้าง stack, scale, pause/resume, เดโม zero-downtime |

## เริ่มใช้งานใน 30 วินาที

ต้องใช้ **Node.js 20.19+ หรือ 22.12+** (Vite 8 และ nodemailer รุ่นปัจจุบันต้องการ)

ไม่ต้องติดตั้ง MongoDB ไม่ต้องสร้างไฟล์ `.env`:

```bash
npm run install:all          # ติดตั้ง dependencies ทั้งหมด
npm run build:frontend       # build หน้าเว็บ
cd backend && npm run dev:local
```

คำสั่งนี้จะเปิด MongoDB แบบ in-memory (replica set) พร้อม seed ข้อมูลตัวอย่าง แล้วรันเซิร์ฟเวอร์ที่
<http://localhost:3000> ข้อมูลจะหายเมื่อปิดโปรแกรม

บัญชีทดสอบ: `iron@test.com` / `password123`

## ติดตั้งแบบเต็ม (ใช้ฐานข้อมูลจริง)

```bash
# 1) Backend
cd backend
npm install
cp .env.example .env         # แล้วใส่ MONGO_URI และ JWT_SECRET
npm run seed                 # สร้างโซน ช่องจอด โปรโมโค้ด และผู้ใช้ทดสอบ
npm run dev                  # http://localhost:3000

# 2) Frontend (อีก terminal)
cd frontend
npm install
cp .env.example .env
npm run dev                  # http://localhost:5173
```

หรือรันทั้งคู่พร้อมกันจาก root ด้วย `npm run dev`

## คำสั่งที่มีให้ใช้

| คำสั่ง | ที่ | ทำอะไร |
|---|---|---|
| `npm run dev` | root | รัน backend + frontend พร้อมกัน |
| `npm run dev:local` | backend | รันเซิร์ฟเวอร์กับ MongoDB in-memory (ไม่ต้องตั้งค่าอะไร) |
| `npm run seed` | backend | ล้างและใส่ข้อมูลตัวอย่างลงฐานข้อมูล |
| `npm run smoke` | backend | รันเทสต์ครอบคลุม booking lifecycle ทั้งหมด (83 เคส) |
| `npm run secure-seed` | backend | ปิดบัญชี/โปรโมโค้ดตัวอย่างบนฐานข้อมูลจริง (dry run ก่อน, `-- --apply` เพื่อทำจริง) |
| `npm run migrate` | backend | แก้ข้อมูลเก่าในฐานข้อมูลจริง (dry run ก่อน, `-- --apply` เพื่อทำจริง) |
| `npm run set-role` | backend | ตั้ง/ถอนสิทธิ์เจ้าหน้าที่สแกน: `-- staff <email>`, `-- unstaff <email>`, `-- list` |
| `npm run auto-cancel` | backend | รันงานยกเลิกการจองที่หมดเวลาแบบครั้งเดียว |
| `npm run build` | root | build frontend ลง `frontend/dist` |
| `npm test` | backend | เทียบเท่า `npm run smoke` |

## เมนูผู้ดูแลระบบ

บัญชีแอดมินเห็นเฉพาะเมนูของผู้ดูแล (เมนูของผู้ใช้ทั่วไปถูกซ่อน ถ้าจะลองจองให้ใช้บัญชีทดสอบ) ล็อกอินแล้วเข้าแดชบอร์ดทันที

| เมนู | ทำอะไรได้ |
|---|---|
| แดชบอร์ด (`/app/admin`) | ช่องว่างตอนนี้แยกตามลาน การจองวันนี้ (เช็คอิน รอ ไม่มา) รายได้วันนี้และ 7 วัน ช่วงเวลาที่มีคนจอง และรายการที่ต้องจัดการ: รถที่จอดเกิน 12 ชม. (น่าจะลืมเช็คเอาต์) กับยอดที่ตัดเงินไม่ผ่าน อัปเดตทุก 30 วินาที |
| การจอง (`/app/admin/bookings`) | ค้นหาด้วยทะเบียน อีเมล ชื่อ หรือเลขช่อง ยกเลิกการจองที่ค้าง เช็คเอาต์แทนผู้ใช้ |
| ลานและช่องจอด (`/app/admin/lots`) | เพิ่มลาน เพิ่มช่องเป็นช่วง (`A01-A20`) ปิดหรือเปิดช่อง (ช่องที่ปิดจะไม่ถูกจองและไม่นับในจำนวนที่ผู้ใช้เห็น) ระบุว่าลานไหนติดสติกเกอร์ QR แล้ว ตั้งพิกัด GPS และพิมพ์ QR ของช่อง |
| ผู้ใช้ (`/app/admin/users`) | ค้นหาผู้ใช้ ตั้งหรือถอนสิทธิ์เจ้าหน้าที่ |

รายได้ในแดชบอร์ดนับค่าจองตามวันที่จอง (ไม่นับครั้งที่ใช้สิทธิ์จองฟรีจากแต้ม) และค่าจอดเกินเวลาตามวันที่เช็คเอาต์ที่ตัดเงินผ่าน ยังไม่รวมค่าสมาชิก วันใช้เวลาไทย

## การเช็คอิน

การยืนยันว่ามาถึงลานจริงทำได้ 3 ทาง:

หน้าการจองแสดง "บัตรจอด" (ช่อง ลาน ทะเบียน และ QR ของการจอง) และแสดงเฉพาะปุ่มเช็คอินที่ลานนั้นรองรับ: ปุ่ม GPS เมื่อลานตั้งพิกัดไว้ ปุ่มสแกนสติกเกอร์เมื่อแอดมินติ๊กว่าติดสติกเกอร์แล้ว ถ้ามีทั้งสองแบบ GPS เป็นปุ่มหลัก ถ้าไม่มีเลยจะบอกให้แสดง QR บนบัตรกับเจ้าหน้าที่

QR บนบัตรคงเดิมจนกว่าจะเช็คอิน (สร้างจาก HMAC ของรหัสการจองกับเวลาที่ออก ด้วย secret ของเซิร์ฟเวอร์) จึงแคปเก็บไว้หรือเปิดบนอีกจอได้ กดที่รูปเพื่อขยาย ตัวสแกนในแอปเลือกรูปจากเครื่องได้ด้วย เพราะมือถือเครื่องเดียวส่องจอตัวเองไม่ได้

โหมดเดโม: ในเมนูลานและช่องจอด ติ๊ก "โหมดเดโม: สแกน QR บนบัตรจอดเพื่อเช็คอิน" ผู้จองในลานนั้นสแกน QR บนบัตรของตัวเองแล้วเช็คอินได้ทันที (ถ้าลานมีพิกัดยังต้องอยู่ในรัศมี) ใช้สำหรับนำเสนอเท่านั้น ห้ามเปิดในลานจริง เพราะบัตรอยู่กับผู้จอง สแกนจากที่ไหนก็ได้

1. QR ประจำช่องจอด (ใช้กับลานที่ไม่มีเจ้าหน้าที่ และลานในอาคารที่ GPS ไม่แม่น) แต่ละช่องมีสติกเกอร์ QR ของตัวเอง ผู้จองจอดแล้วกด "สแกน QR ที่ช่องจอด" ในหน้าการจอง (หรือใช้แอปกล้องของมือถือสแกนก็ได้ QR เป็นลิงก์ `/app/arrive?s=<ช่อง>&c=<รหัส>`) หน้าเว็บแสดงช่องที่สแกนเทียบกับช่องที่จอง แล้วให้กด "ยืนยันว่าถึงแล้ว"
   - สแกนผิดช่อง ระบบบอกว่าจองช่องไหนไว้และไม่ให้เช็คอิน
   - ปุ่มสแกนแสดงเฉพาะลานที่แอดมินติ๊ก "ติดสติกเกอร์ QR ที่ช่องจอดของลานนี้แล้ว" ในเมนูลานและช่องจอด
   - ถ้าลานนั้นตั้งพิกัดไว้ ต้องเปิด GPS และอยู่ในรัศมีด้วย (กันคนถ่ายรูปสติกเกอร์ไปใช้จากที่อื่น) ลานที่ไม่ตั้งพิกัดใช้สติกเกอร์อย่างเดียว
   - พิมพ์สติกเกอร์: เมนู "ลานและช่องจอด" แท็บ "พิมพ์ QR" เลือกลาน แล้วกด "พิมพ์ทั้งลาน" (A4 แผ่นละ 6 ช่อง) ถ้ารูป QR ของช่องไหนหลุดออกไป กด "เปลี่ยน QR" ของช่องนั้น สติกเกอร์เดิมใช้ไม่ได้ทันที แล้วพิมพ์ช่องนั้นใหม่
   - QR เก็บที่อยู่เว็บที่ใช้ตอนพิมพ์ไว้ในลิงก์ ให้พิมพ์จากโดเมนที่ผู้ใช้จะเข้าจริง ถ้าย้ายโดเมนต้องพิมพ์ใหม่
2. **เจ้าหน้าที่สแกน QR** — ผู้จองเปิด QR บนมือถือ เจ้าหน้าที่เปิดเมนู "สแกนเช็คอิน" (`/app/staff`) แล้วสแกนด้วยกล้อง ระบบแสดงป้ายทะเบียนให้ตรวจกับรถ ใช้ได้ทุกลาน
3. **GPS** — ผู้จองกดเช็คอินเองได้เมื่ออยู่ในรัศมีของลาน (ค่าเริ่มต้น 100 ม. และ GPS ต้องแม่นยำไม่เกิน 100 ม.) ใช้ได้เฉพาะลานที่แอดมินตั้งพิกัดไว้ และเหมาะกับลานโล่งที่สุดเพราะไม่มีอะไรบังสัญญาณ ลานที่ตั้งพิกัดแล้วจะมีปุ่มนี้เป็นปุ่มหลักในหน้าการจอง
   ตั้งพิกัด: แอดมินเปิดเมนู "ลานและช่องจอด" แท็บ "พิกัด GPS" แล้ววางพิกัดที่คัดลอกจาก Google Maps (คลิกขวาที่กลางลาน กดตัวเลขพิกัด) หรือวางลิงก์ Google Maps ที่มี `@lat,lng` ก็ได้ แล้วกด "บันทึกพิกัด" ไม่ต้องไปที่ลาน หรือไปยืนกลางลานแล้วกด "ใช้ตำแหน่งที่ยืนอยู่"

QR token ไม่สามารถใช้เช็คอินเองจากมือถือของผู้จองได้อีก (เดิมกดเช็คอินจากที่ไหนก็ได้) และเจ้าหน้าที่สแกนการจองของตัวเองไม่ได้
ตั้งเจ้าหน้าที่ได้จากเมนู "ผู้ใช้" ของแอดมิน (`/app/admin/users`) หรือ `npm run set-role -- staff <email>` (บัญชีต้องสมัครในแอปก่อน)

การจองต้องมีรถลงทะเบียนไว้ (ใช้คันหลักถ้าไม่ได้เลือก) เพื่อให้เจ้าหน้าที่เทียบป้ายทะเบียนได้

### การยืนยันอีเมล

ถ้าตั้งค่า SMTP (`EMAIL_USER`/`EMAIL_PASS`) ไว้ ผู้ใช้ต้องยืนยันอีเมลก่อนจอง ถ้ายังไม่ตั้ง ระบบจะไม่บังคับ
(เพราะไม่มีทางรับรหัสได้) บังคับเองได้ด้วย `REQUIRE_EMAIL_VERIFICATION=true|false`
ระหว่างพัฒนา ถ้าไม่มี SMTP รหัส OTP จะแสดงใน log ของเซิร์ฟเวอร์ (ไม่แสดงเมื่อ `NODE_ENV=production`)

## กติกาของระบบ

ตัวเลขทุกตัวมาจากไฟล์เดียว: [`backend/config/pricing.js`](backend/config/pricing.js)
หน้าเว็บอ่านค่าเหล่านี้ผ่าน `GET /api/pricing` ตอนเปิดแอป จึงไม่มีการเขียนตัวเลขซ้ำไว้ในฝั่ง UI

| รายการ | ค่า |
|---|---|
| ค่าธรรมเนียมการจอง | 20 บาท/ครั้ง (ไม่คืนทุกกรณี) |
| จอดฟรี | 3 ชั่วโมงแรก |
| เกินเวลา | 10 บาท/ชม. (ปัดขึ้นเป็นชั่วโมง) |
| ต้องเช็คอินภายใน | 30 นาที มิฉะนั้นยกเลิกอัตโนมัติ |
| Diamond | 199 บาท/เดือน · ลดค่าจอดเกิน 10% |
| Predator | 399 บาท/เดือน · ลดค่าจอดเกิน 15% |

ส่วนลดสมาชิกใช้กับ**ค่าจอดเกินเวลาเท่านั้น** ไม่ลดค่าธรรมเนียมการจอง

การสมัคร/แลกโค้ดสมาชิก (`services/membershipService.js`):

- **แพ็กเกจเดิม** — ต่อท้ายวันหมดอายุเดิม ไม่เริ่มนับใหม่
- **แพ็กเกจสูงกว่า** — ได้ทันที แพ็กเกจเดิมยังอยู่และกลับมาใช้ต่อหลังแพ็กเกจใหม่หมด ถ้ายังเหลือวัน
- **แพ็กเกจต่ำกว่า** — ปฏิเสธระหว่างที่แพ็กเกจสูงกว่ายังใช้อยู่ (ไม่ตัดเงิน และโปรโมโค้ดไม่ถูกใช้)
- โค้ดส่วนลดค่าจอดเกินเวลาจะถูกใช้เฉพาะเมื่อลดเงินได้จริง

### แต้มสะสม

ตัวเลขทั้งหมดอยู่ใน `POINTS` / `REWARDS` ใน [`backend/config/pricing.js`](backend/config/pricing.js)
ทุกการได้/ใช้แต้มถูกบันทึกในตาราง `PointTransaction`

| ได้แต้ม | แต้ม |
|---|---|
| จองแล้วเช็คอินและเช็คเอาต์ (ชำระครบ) | 10 |
| ออกภายใน 3 ชั่วโมงฟรี | +5 |
| จองแล้วไม่มา | 0 |
| ตัวคูณตามระดับ | Iron ×1 · Diamond ×1.5 · Predator ×2 |

| แลกได้ | แต้ม |
|---|---|
| จองฟรี 1 ครั้ง (ไม่เสียค่าจอง) | 150 |
| คูปองลดค่าจอดเกินเวลา 50% (30 วัน) | 80 |
| ทดลอง Diamond 7 วัน (ต่อท้ายถ้าเป็นอยู่แล้ว ไม่ได้ถ้าเป็น Predator) | 400 |

แต้มหมดอายุเมื่อไม่มีการได้หรือใช้แต้มเลย 365 วัน

### สถานะช่องจอด

```
available  ──จอง──▶  reserved  ──QR ช่อง / สแกน / GPS──▶  occupied  ──เช็คเอาต์──▶  available
                         │
                         └──ไม่มาใน 30 นาที / ยกเลิก──▶ available
```

### สถานะการจอง

`pending` (จ่ายแล้ว รอเช็คอิน) → `confirmed` (จอดอยู่) → `completed`
โดยยกเลิกได้เฉพาะตอน `pending` เท่านั้น เมื่อเช็คอินแล้วต้องเช็คเอาต์

## โครงสร้างโปรเจกต์

```
backend/
├── config/pricing.js        ค่าธรรมเนียม ส่วนลด และการคำนวณทั้งหมด
├── config/db.js             การเชื่อมต่อ MongoDB
├── controllers/             business logic ต่อ resource
├── middleware/security.js   helmet, sanitizer, rate limiters
├── middleware/userAuth.js   ตรวจ JWT + requireAdmin
├── models/                  Mongoose schemas
├── routes/                  การผูก URL กับ controller
├── services/
│   ├── paymentService.js    ขอบเขตการชำระเงิน (จำลอง แต่ล้มเหลวได้จริง)
│   ├── qrCodeService.js     ออกและตรวจสอบ QR credential
│   ├── autoCancelService.js cron ยกเลิกการจองที่หมดเวลา
│   └── subscriptionService.js cron ลดระดับสมาชิกที่หมดอายุ
└── scripts/smokeTest.js     เทสต์ end-to-end

frontend/src/
├── components/ui/           Button, Card, Input, Modal, Badge, Progress…
├── components/layout/       TopBar, SideNav, TabBar
├── components/CampusMap.jsx แผนที่ลานจอดพร้อมหมุดที่ว่างสด
├── components/ZoneCard.jsx  การ์ดลานจอด (ตัวเลขว่าง + ระยะเดิน)
├── components/LotPlan.jsx   ผังช่องจอดแบบมีช่องทางเดินรถ
├── pages/                   หนึ่งไฟล์ต่อหนึ่งหน้าจอ
├── stores/                  Zustand (auth, booking, theme)
└── utils/                   axios client, formatters
```

## API

ทุก endpoint ขึ้นต้นด้วย `/api` และตอบเป็น `{ success, ... }`

<details>
<summary><strong>Authentication</strong></summary>

```
POST   /api/auth/register          สมัครสมาชิก (รหัสผ่านอย่างน้อย 8 ตัว)
POST   /api/auth/login             เข้าสู่ระบบ
POST   /api/auth/logout            ออกจากระบบ
GET    /api/auth/me                ข้อมูลผู้ใช้ปัจจุบัน
POST   /api/auth/send-verify-otp   ส่ง OTP ไปอีเมล (ขอใหม่ได้ทุก 60 วินาที)
POST   /api/auth/verify-account    ยืนยันด้วย OTP (ผิดได้ 5 ครั้งต่อรหัส)
POST   /api/auth/forgot-password   ส่งรหัสตั้งรหัสผ่านใหม่ (ตอบเหมือนกันไม่ว่าอีเมลจะมีบัญชีหรือไม่)
POST   /api/auth/reset-password    ตั้งรหัสผ่านใหม่ด้วยรหัสจากอีเมล และออกจากระบบทุกอุปกรณ์
```
</details>

<details>
<summary><strong>Parking</strong></summary>

```
GET    /api/parking/zones              ทุกโซนพร้อมจำนวนที่ว่างสด
GET    /api/parking/zones/:id          รายละเอียดโซน + ผังช่องจอด
GET    /api/parking/zones/:id/spots    ช่องจอดในโซน
GET    /api/parking/spots              ค้นหาช่องจอด
GET    /api/parking/stats              สถิติรวม
PUT    /api/parking/spots/:id/status   เปลี่ยนสถานะ (ผู้ดูแลระบบเท่านั้น)
GET    /api/pricing                    ค่าธรรมเนียม เวลาฟรี และแพ็กเกจ (สาธารณะ)
```
</details>

<details>
<summary><strong>Bookings</strong></summary>

```
POST   /api/bookings                   จอง + เก็บค่าธรรมเนียม (402 ถ้าจ่ายไม่ผ่าน) · { useFreeBooking: true } ใช้สิทธิ์จองฟรี
GET    /api/bookings/active            การจองที่ใช้งานอยู่ + นับถอยหลัง
GET    /api/bookings/history           ประวัติ (แบ่งหน้า)
GET    /api/bookings/:id/qr            QR บนบัตร (ได้อันเดิมทุกครั้ง; ?rotate=1 ออกใหม่และอันเดิมใช้ไม่ได้)
POST   /api/bookings/spot-scan         อ่าน QR ของช่องจอด { spotId, code } บอกว่าตรงกับการจองไหม (ไม่เปลี่ยนข้อมูล)
PUT    /api/bookings/:id/checkin       เช็คอินเอง: { spotId, code } จาก QR ของช่อง (ลานที่มีพิกัดต้องส่ง GPS ด้วย)
                                       หรือ { qrPayload } QR บนบัตร (เฉพาะลานที่เปิดโหมดเดโม)
                                       หรือ { latitude, longitude, accuracy } ด้วย GPS (เฉพาะลานที่ตั้งพิกัดแล้ว)
PUT    /api/bookings/:id/checkout      เช็คเอาต์ คิดเงิน คืนช่องจอด
DELETE /api/bookings/:id               ยกเลิก (เฉพาะก่อนเช็คอิน)
```
</details>

<details>
<summary><strong>เจ้าหน้าที่และผู้ดูแลระบบ</strong></summary>

```
POST   /api/staff/scan                 สแกน QR ของผู้จองเพื่อเช็คอิน (เจ้าหน้าที่/แอดมิน)
GET    /api/staff/zones                ลานจอดและสถานะการเช็คอินด้วย GPS
PUT    /api/staff/zones/:id/location   ตั้งพิกัด/รัศมีของลาน หรือ { clear: true } (แอดมินเท่านั้น)
GET    /api/admin/bookings             การจองทั้งหมด ?status=active|pending|confirmed|unpaid|completed|cancelled&q=
POST   /api/admin/bookings/:id/cancel  ยกเลิกการจองที่ค้าง คืนช่องจอด { note }
POST   /api/admin/bookings/:id/force-checkout  เช็คเอาต์แทน ถ้าตัดเงินไม่ผ่านจะบันทึกเป็นค้างชำระ
GET    /api/admin/users                รายชื่อผู้ใช้ ?q=
PUT    /api/admin/users/:id/staff      ตั้ง/ถอนเจ้าหน้าที่ { isStaff }
GET    /api/admin/spot-codes?zone=     รหัส QR ของทุกช่องในลาน (ออกรหัสให้ช่องที่ยังไม่มี)
POST   /api/admin/spots/:id/rotate-code  เปลี่ยนรหัส QR ของช่อง (สติกเกอร์เดิมใช้ไม่ได้)
GET    /api/admin/dashboard            ตัวเลขของแดชบอร์ด
GET    /api/admin/lots                 ลานทั้งหมดพร้อมจำนวนช่องแยกสถานะ
POST   /api/admin/lots                 เพิ่มลาน { zoneName, name, building? }
GET    /api/admin/lots/:id/spots       ช่องของลาน พร้อมทะเบียนรถที่ถือช่องอยู่
POST   /api/admin/lots/:id/spots       เพิ่มช่อง { spots: "A01-A20, B1", floor? } ช่องที่มีแล้วจะข้าม
PUT    /api/admin/spots/:id/closed     ปิด/เปิดช่อง { closed } (ปิดได้เฉพาะช่องว่าง)
PUT    /api/admin/lots/:id             แก้ลาน { spotStickers?, ticketSelfScan?, name?, building? }
```
</details>

<details>
<summary><strong>อื่น ๆ</strong></summary>

```
GET    /api/privileges                 แพ็กเกจสมาชิกและสถานะปัจจุบัน
GET    /api/points                     แต้มคงเหลือ กติกา รางวัล และประวัติ
POST   /api/points/redeem              แลกแต้ม { rewardId: free_booking | overtime_voucher | diamond_trial }
POST   /api/privileges/subscribe       สมัครสมาชิก
POST   /api/privileges/redeem          แลกโปรโมโค้ด
GET    /api/vehicles                   ยานพาหนะ (POST/PUT/DELETE)
GET    /api/payment-methods            วิธีชำระเงิน (POST/PUT/DELETE)
GET    /api/notifications              การแจ้งเตือน
GET    /api/user/profile               โปรไฟล์ + สถิติ
GET    /health                         สถานะเซิร์ฟเวอร์และการเชื่อมต่อฐานข้อมูล
```
</details>

## บัญชีและโค้ดทดสอบ (หลัง `npm run seed`)

> ⚠️ **ห้ามใช้บัญชีและโค้ดเหล่านี้บนเซิร์ฟเวอร์จริง** — รหัสผ่านถูกเผยแพร่อยู่ในไฟล์นี้ ถ้าเคยรัน `npm run seed` บน production ให้รัน `npm run secure-seed` (ดูก่อนแบบ dry run) แล้ว `npm run secure-seed -- --apply` เพื่อปิดบัญชีทดสอบ เปลี่ยนรหัสแอดมิน และปิดโปรโมโค้ดตัวอย่าง เซิร์ฟเวอร์จะเตือนใน log ทุกครั้งที่เปิดจนกว่าจะแก้

| อีเมล | รหัสผ่าน | ระดับ |
|---|---|---|
| `iron@test.com` | `password123` | Iron |
| `diamond@test.com` | `password123` | Diamond |
| `predator@test.com` | `password123` | Predator |
| `admin@scipark.app` | `admin12345` | ผู้ดูแลระบบ |

โปรโมโค้ด: `SCIPARK2026` (Diamond 30 วัน) · `WELCOME100` (100 แต้ม) ·
`PREDATOR30` (Predator 30 วัน) · `DISCOUNT50` (ลด 50% ค่าจอดเกิน) · `FREEPARKING` (500 แต้ม)

## ความปลอดภัย

- รหัสผ่านแฮชด้วย bcrypt และไม่ถูกส่งกลับไม่ว่ากรณีใด (`select: false`)
- JWT อยู่ใน httpOnly cookie เท่านั้น (ไม่ส่งใน response body และไม่เก็บใน localStorage) รองรับ Authorization header สำหรับ API client
- Logout เพิกถอน token จริง (เก็บ `jti` ไว้จนหมดอายุ) และการเปลี่ยนรหัสผ่านทำให้ทุกเซสชันเดิมใช้ไม่ได้
- Username ห้ามมี `@` และเทียบแบบไม่สนตัวพิมพ์ ป้องกันการตั้ง username ให้ซ้อนอีเมลของคนอื่น
- การจองของผู้ใช้คนเดียวกันถูก serialize ใน transaction จึงมีการจองที่ใช้งานอยู่ได้ครั้งละ 1 รายการแม้ยิงพร้อมกัน
- ข้อความ error จากฐานข้อมูลไม่ถูกส่งถึงผู้ใช้ (`utils/httpError.js`)
- helmet ตั้ง CSP, HSTS, `X-Content-Type-Options` ฯลฯ
- Sanitizer ตัด Mongo operator (`$ne`, คีย์ที่มีจุด) และ escape markup ออกจากทุก request
- Rate limit: 300 req/15 นาทีต่อ IP, login ผิด 10 ครั้ง/15 นาทีต่อ (IP + บัญชี) และ 100 ครั้งต่อ IP สำหรับ endpoint รหัสผ่าน — ผู้ใช้ที่ใช้ IP เดียวกันทั้งวิทยาเขตจึงไม่ล็อกกันเอง
- OTP สร้างด้วย `crypto.randomInt` และทิ้งเมื่อกรอกผิด 5 ครั้ง
- **เก็บเลขบัตรเครดิตแค่ 4 ตัวท้าย** ไม่เก็บหมายเลขเต็มหรือ CVV
- QR เก็บเป็นค่าแฮช ใช้ได้ครั้งเดียว และหมดอายุพร้อม deadline
- เส้นทางของผู้ดูแลระบบต้องมี `isAdmin`

## การออกแบบ

ระบบดีไซน์อยู่ใน [`DESIGN.md`](DESIGN.md) — สี ฟอนต์ ระยะ มุมโค้ง และกฎการใช้ motion
ทุกค่าใน `tailwind.config.js` และ `src/index.css` อ้างอิงจากไฟล์นั้น

รองรับ dark mode ตามระบบปฏิบัติการและสลับเองได้ และเคารพ `prefers-reduced-motion`

## เทสต์

```bash
cd backend && npm run smoke
```

ครอบคลุม Test Case ในเอกสาร `Test_Case_SciPark.pdf`: การจอง (TC1–3),
การยกเลิก (TC4–5), เช็คอินและ timer (TC6–7), การเฝ้าดู (TC8–9),
ออกและชำระเงิน (TC10–11), และหน้ายืนยันการจอง (TC19–21)

## License

MIT

**ผู้พัฒนา:** Nattawut Chaturaponkul — [@hhonn](https://github.com/hhonn)
