# SciPark

ระบบจองที่จอดรถล่วงหน้าสำหรับคณะวิทยาศาสตร์ สจล. — ดูที่ว่างแบบเรียลไทม์ จองด้วยค่าธรรมเนียม
20 บาท ระบบเลือกช่องจอดให้อัตโนมัติ แล้วสแกน QR เพื่อยืนยันการมาถึงภายใน 30 นาที

```
React 18 + Vite 5 + Tailwind 3   →   Express 5 + Mongoose   →   MongoDB
```

---

## เริ่มใช้งานใน 30 วินาที

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
| `npm run smoke` | backend | รันเทสต์ครอบคลุม booking lifecycle ทั้งหมด (27 เคส) |
| `npm run auto-cancel` | backend | รันงานยกเลิกการจองที่หมดเวลาแบบครั้งเดียว |
| `npm run build` | root | build frontend ลง `frontend/dist` |
| `npm test` | backend | เทียบเท่า `npm run smoke` |

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

### สถานะช่องจอด

```
available  ──จอง──▶  reserved  ──สแกน QR──▶  occupied  ──เช็คเอาต์──▶  available
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
POST   /api/auth/send-verify-otp   ส่ง OTP ไปอีเมล
POST   /api/auth/verify-account    ยืนยันด้วย OTP
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
POST   /api/bookings                   จอง + เก็บค่าธรรมเนียม (402 ถ้าจ่ายไม่ผ่าน)
GET    /api/bookings/active            การจองที่ใช้งานอยู่ + นับถอยหลัง
GET    /api/bookings/history           ประวัติ (แบ่งหน้า)
GET    /api/bookings/:id/qr            ออก QR ใหม่ (ของเดิมใช้ไม่ได้ทันที)
PUT    /api/bookings/:id/checkin       เช็คอิน ต้องแนบ QR token
PUT    /api/bookings/:id/checkout      เช็คเอาต์ คิดเงิน คืนช่องจอด
DELETE /api/bookings/:id               ยกเลิก (เฉพาะก่อนเช็คอิน)
```
</details>

<details>
<summary><strong>อื่น ๆ</strong></summary>

```
GET    /api/privileges                 แพ็กเกจสมาชิกและสถานะปัจจุบัน
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
- JWT อยู่ใน httpOnly cookie และรองรับ Authorization header
- helmet ตั้ง CSP, HSTS, `X-Content-Type-Options` ฯลฯ
- Sanitizer ตัด Mongo operator (`$ne`, คีย์ที่มีจุด) และ escape markup ออกจากทุก request
- Rate limit: 300 req/15 นาทีต่อ IP และ 10 ครั้ง/15 นาทีสำหรับ endpoint รหัสผ่าน
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
