import LegalPage from './LegalPage'
import { usePricingStore } from '../stores/pricingStore'

// Every fee quoted below comes from the server (see stores/pricingStore), not
// from numbers typed into this file. These are the terms a user is agreeing to,
// so they are the last place that should be allowed to drift from what the
// billing code actually charges.
const buildSections = ({ bookingFee, freeHours, overtimeRate, graceMinutes }, tierDiscount) => [
  {
    heading: 'การใช้บริการ',
    body: 'SciPark เป็นระบบจองที่จอดรถสำหรับนักศึกษาและบุคลากรคณะวิทยาศาสตร์ สจล. ผู้ใช้ต้องลงทะเบียนด้วยข้อมูลที่เป็นจริงและรับผิดชอบต่อการรักษาความปลอดภัยของบัญชีตนเอง',
  },
  {
    heading: 'ค่าบริการ',
    items: [
      `ค่าธรรมเนียมการจอง ${bookingFee} บาทต่อครั้ง เรียกเก็บทันทีที่ยืนยันการจอง`,
      `การจอด ${freeHours} ชั่วโมงแรกรวมอยู่ในค่าธรรมเนียมแล้ว`,
      `เกิน ${freeHours} ชั่วโมง คิดเพิ่มชั่วโมงละ ${overtimeRate} บาท โดยนับเป็นชั่วโมง (เศษของชั่วโมงปัดขึ้น)`,
      `สมาชิก Diamond ลดค่าจอดเกินเวลา ${tierDiscount.diamond}% และ Predator ลด ${tierDiscount.predator}% ส่วนลดไม่ใช้กับค่าธรรมเนียมการจอง`,
    ],
  },
  {
    heading: 'การยืนยันการมาถึงและการยกเลิก',
    items: [
      `ผู้ใช้ต้องยืนยันการมาถึงภายใน ${graceMinutes} นาทีหลังชำระเงิน โดยให้เจ้าหน้าที่สแกน QR Code หรือเช็คอินด้วยตำแหน่ง (GPS) เมื่ออยู่ในลาน สำหรับลานที่เปิดใช้`,
      'การเช็คอินด้วยตำแหน่งจากนอกลานจอดจะถูกปฏิเสธ และการปลอมตำแหน่งถือเป็นการละเมิดข้อกำหนด',
      'ระบบจะแจ้งเตือนล่วงหน้าก่อนหมดเวลายืนยันการมาถึง',
      'หากไม่ยืนยันภายในเวลาที่กำหนด ระบบจะยกเลิกการจองอัตโนมัติและปล่อยช่องจอดคืน',
      `ค่าธรรมเนียมการจอง ${bookingFee} บาทไม่สามารถขอคืนได้ในทุกกรณี รวมถึงกรณีที่ผู้ใช้ยกเลิกเอง`,
    ],
  },
  {
    heading: 'ความรับผิดชอบ',
    body: 'SciPark ให้บริการจัดสรรช่องจอดเท่านั้น ไม่รับผิดชอบต่อความเสียหาย การสูญหาย หรือการโจรกรรมที่เกิดกับยานพาหนะและทรัพย์สินภายในลานจอด ผู้ใช้ควรล็อกรถและไม่ทิ้งของมีค่าไว้ในรถ',
  },
  {
    heading: 'การระงับบัญชี',
    body: 'เราขอสงวนสิทธิ์ระงับบัญชีที่ใช้งานผิดวัตถุประสงค์ เช่น จองค้างไว้โดยไม่เข้าจอดซ้ำ ๆ ใช้ข้อมูลเท็จ หรือพยายามเข้าถึงระบบโดยไม่ได้รับอนุญาต',
  },
  {
    heading: 'การเปลี่ยนแปลงข้อกำหนด',
    body: 'เราอาจปรับปรุงข้อกำหนดนี้เป็นครั้งคราว การใช้บริการต่อหลังจากมีการเปลี่ยนแปลงถือว่ายอมรับข้อกำหนดฉบับใหม่',
  },
]

const Terms = () => {
  const pricing = usePricingStore((s) => s.pricing)
  const tierDiscount = usePricingStore((s) => s.tierDiscount)

  return (
    <LegalPage
      title="ข้อกำหนดการใช้งาน"
      updated="18 กันยายน 2569"
      sections={buildSections(pricing, tierDiscount)}
    />
  )
}

export default Terms
