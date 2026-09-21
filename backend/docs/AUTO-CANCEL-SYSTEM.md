# Auto-Cancel System

ระบบยกเลิกการจองอัตโนมัติเมื่อผู้ใช้ไม่ยืนยันการมาถึงภายในเวลาที่กำหนด

## กติกา

ค่าทั้งหมดมาจาก [`backend/config/pricing.js`](../config/pricing.js):

| ค่า | ปัจจุบัน |
|---|---|
| `CHECKIN_GRACE_MINUTES` | 30 นาที |
| ความถี่ในการตรวจ | ทุก 1 นาที |
| ค่าธรรมเนียมที่ริบ | 20 บาท (ไม่คืน) |

## สิ่งที่เกิดขึ้น

เมื่อพบการจองที่ `status: "pending"`, `isCheckedIn: false` และเลย `checkInDeadline` แล้ว:

1. `status` → `cancelled`, `cancelReason` → `auto_cancelled_timeout`
2. `refundable` → `false` — ค่าธรรมเนียมการจองถูกริบตามนโยบาย
3. `qrTokenHash` → `null` — QR ที่ออกไปใช้ไม่ได้ทันที
4. ช่องจอด `reserved` → `available` เพื่อให้คนอื่นจองได้
5. ส่ง notification แจ้งผู้ใช้ว่าการจองถูกยกเลิกเพราะเหตุใด

## การทำงาน

Scheduler เริ่มอัตโนมัติพร้อมเซิร์ฟเวอร์ (ดู `index.js`) และจะกวาดครั้งแรกหลังบูต 5 วินาที
เพื่อเก็บรายการที่หมดเวลาระหว่างเซิร์ฟเวอร์ดับ

รันแบบครั้งเดียวสำหรับทดสอบหรือสำหรับ external cron:

```bash
cd backend
npm run auto-cancel
```

## หมายเหตุการทำงาน

- ผู้ใช้ที่กดเช็คอินหลังหมดเวลาจะได้รับการยกเลิกทันทีในคำขอนั้น (`checkIn` ตรวจ deadline เอง)
  ไม่ต้องรอ scheduler รอบถัดไป
- `stopAutoCancelScheduler()` หยุดเฉพาะงานของตัวเอง ไม่ไปหยุด cron ตัวอื่นในโปรเซส
- ทดสอบพฤติกรรมนี้ได้ด้วย `npm run smoke` (เคส "TC7")
