# ระบบจองรถส่วนกลาง — โรงเรียนสุวรรณภูมิวิทยาลัย

โปรเจกต์นี้แยกเป็น 2 ส่วน:

1. **Frontend** สำหรับเปิดหน้าเว็บ (GitHub Pages เป็นตัวเลือกได้)
2. **Backend** ทำงานด้วย Google Apps Script เพื่อเชื่อม Google Sheets, Slides, Drive และ Gmail

> GitHub Pages ให้บริการไฟล์หน้าเว็บแบบ static เท่านั้น ไม่สามารถรัน `Code.gs` โดยตรงหรือซ่อนข้อมูลลับได้ สำหรับระบบนี้ให้ใช้ Google Apps Script Web App เป็น backend

## แนะนำวิธีติดตั้ง (Apps Script เป็นแอปหลัก)

1. เปิด [Google Apps Script](https://script.google.com/) และสร้างโปรเจกต์ใหม่
2. เพิ่มไฟล์ `Code.gs` และไฟล์ HTML ชื่อ `Index` จากชุดโค้ดต้นฉบับที่ผู้ดูแลระบบตรวจสอบแล้ว
3. ตรวจสอบค่า `SHEET_ID`, `SLIDE_TEMPLATE_ID` และ `DRIVE_FOLDER_ID` ในส่วนตั้งค่าของ backend
4. เรียกใช้ `setupDatabase()` เพียงครั้งเดียวสำหรับฐานข้อมูลใหม่ และอนุญาตสิทธิ์ Google Services ตามที่ระบบร้องขอ
5. ทดสอบการจองด้วยข้อมูลสมมติ ก่อนใช้ข้อมูลจริง
6. เลือก **Deploy → New deployment → Web app** และกำหนด Execute as / Who has access ให้เหมาะสมกับนโยบายโรงเรียน
7. เปิด URL Web App ที่ Deploy แล้ว และทดสอบการจอง PDF อีเมล และระบบแอดมิน

## ใช้ GitHub Pages เป็นหน้าเว็บ

หากต้องการโฮสต์หน้าเว็บบน GitHub Pages จะต้องปรับ frontend ให้เรียก backend ผ่าน endpoint HTTPS ที่ออกแบบมาโดยเฉพาะ พร้อมการตรวจสอบสิทธิ์, CORS และ CSRF ที่เหมาะสม ห้ามใช้ JSONP สำหรับการแก้ไขข้อมูลสำคัญ และห้ามใส่รหัสผ่าน/token/API secret หรือ Script Properties ลงในไฟล์ frontend หรือ repository สาธารณะ

หน้าเว็บที่ใช้ `google.script.run` ทำงานได้เมื่อ HTML ถูกเสิร์ฟจาก Google Apps Script HTML Service โดยตรงเท่านั้น; หากย้าย HTML ไป GitHub Pages ต้องเปลี่ยนวิธีเชื่อม backend ก่อน

## ความปลอดภัยก่อนเผยแพร่

- ห้าม commit รหัสผ่าน, session token, app secrets หรือข้อมูลผู้จองจริง
- ใช้ repository Private หากเก็บข้อมูลที่ไม่ควรเปิดเผย
- ใช้รหัสผ่านแอดมินแบบไม่ซ้ำและบังคับเปลี่ยนรหัสเริ่มต้น
- จำกัดผู้มีสิทธิ์ใช้ Web App และทดสอบการอนุมัติจากบัญชีที่ได้รับสิทธิ์
- ลิงก์ PDF ที่มีข้อมูลบุคคลควรจำกัดสิทธิ์การเข้าถึง ไม่ควรตั้งเป็น Anyone with the link โดยไม่มีการพิจารณานโยบายข้อมูลส่วนบุคคล

## สถานะ

README นี้เป็นคู่มือติดตั้ง ไม่ได้ยืนยันว่า backend ถูก Deploy หรือเชื่อม Google Services สำเร็จแล้ว
