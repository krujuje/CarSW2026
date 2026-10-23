# ระบบจองรถส่วนกลาง — โรงเรียนสุวรรณภูมิวิทยาลัย

ซอร์สโค้ด Google Apps Script Web App ซึ่งเชื่อม Google Sheets, Google Slides, Drive และ Gmail/MailApp โดยใช้ GitHub เป็นที่เก็บ source และ GitHub Actions สำหรับสั่ง push/deploy ไปยัง Apps Script

> **สำคัญ:** GitHub Pages ใช้โฮสต์ไฟล์ static เท่านั้น จึงไม่รัน `Code.gs` หรือ `google.script.run` โดยตรง ระบบนี้ใช้ Google Apps Script เป็น runtime; GitHub เป็นที่เก็บ source และตัวสั่ง deploy

## ไฟล์หลัก

- `Code.gs` — Backend / Google Services / ระบบจองและแอดมิน
- `Index.html` — UI responsive, ฟอร์มจอง, Dashboard, ปฏิทิน และหน้าจัดการ
- `appsscript.json` — manifest สำหรับ Apps Script
- `.github/workflows/deploy-apps-script.yml` — workflow สำหรับ deploy จาก GitHub Actions

## 1. ตั้งค่า Google Apps Script

เปิดโปรเจกต์ Apps Script ที่ต้องการใช้เป็น backend แล้วไปที่ **Project Settings → Script Properties** กำหนดค่าต่อไปนี้ ค่าเหล่านี้ให้เก็บใน Apps Script เท่านั้น ห้าม commit ลง repository:

| Property | ความหมาย |
|---|---|
| `SHEET_ID` | ID ของ Google Spreadsheet ฐานข้อมูล |
| `SLIDE_TEMPLATE_ID` | ID ของ Google Slides Template ใบจอง |
| `DRIVE_FOLDER_ID` | ID โฟลเดอร์ Drive สำหรับ PDF |
| `ADMIN_EMAILS` | อีเมลแจ้งเตือน คั่นแต่ละอีเมลด้วย comma |
| `MASTER_ADMIN_INITIAL_PASSWORD` | รหัสผ่านเริ่มต้นส่วนตัว อย่างน้อย 10 ตัวอักษร ใช้ครั้งเดียว |
| `ADMIN_USERNAME` | ชื่อผู้ใช้แอดมินหลัก ปกติใช้ `admin` |

ตั้งค่า Script Properties ก่อนรัน `setupDatabase()` ครั้งแรก เพราะขั้นตอน setup ต้องเข้าถึง Spreadsheet และอีเมลแจ้งเตือน

1. เปิด Apps Script Editor
2. เพิ่มไฟล์ `Code.gs` และ HTML file ชื่อ `Index` โดยใช้โค้ดจาก repository นี้
3. ตั้งค่า Script Properties ตามตาราง
4. รัน `setupDatabase()` และอนุญาตสิทธิ์ Google Services
5. Deploy → New deployment → Web app แล้วทดสอบกับข้อมูลสมมติก่อนใช้จริง

หากเป็นระบบเดิมที่มีฐานข้อมูลและบัญชีอยู่แล้ว ไม่ต้องรัน setup ซ้ำโดยไม่จำเป็น ให้สำรองข้อมูลก่อนอัปเดต และตรวจสอบ Script Properties ให้ครบ

### รีเซ็ตรหัสผ่านแอดมินหลัก

กำหนด `MASTER_ADMIN_RESET_PASSWORD` เป็นรหัสใหม่อย่างน้อย 10 ตัวอักษรใน Script Properties แล้วรัน `repairMasterAdminLogin()` จาก Apps Script Editor ด้วยบัญชีเจ้าของโปรเจกต์ ฟังก์ชันใช้ค่านี้ครั้งเดียวและลบทิ้งหลังตั้งรหัสผ่านสำเร็จ

## 2. ตั้งค่า GitHub Actions

ก่อนเริ่ม ต้องมีสิทธิ์แก้ไข Apps Script project และอนุญาต OAuth ให้ `clasp` ด้วยบัญชี Google ที่เป็นเจ้าของ Apps Script

ในคอมพิวเตอร์ส่วนตัวของผู้ดูแล ทำขั้นตอนนี้ก่อนสร้าง Secret:

1. ติดตั้ง Node.js และรัน `npm install --global @google/clasp`
2. รัน `clasp login` แล้วเลือกบัญชี Google ที่มีสิทธิ์แก้ไข Apps Script project
3. เปิดไฟล์ credential ที่ clasp สร้างขึ้น: Windows `%USERPROFILE%\\.clasprc.json`; macOS/Linux `~/.clasprc.json`
4. คัดลอก **เนื้อหา JSON ทั้งก้อน** ซึ่งมักมี property `token` และ `oauth2ClientSettings` ใส่ใน Secret ชื่อ `CLASPRC_JSON` โดยตรง ห้ามพิมพ์คำอธิบายหรือข้อความอื่นแทนไฟล์ และห้ามส่งไฟล์นี้ให้ผู้อื่น
5. อย่านำเนื้อหา credential ไปวางใน chat, issue, commit หรือ log

ใน GitHub เปิด **Settings → Secrets and variables → Actions → New repository secret** แล้วเพิ่ม:

- `GAS_SCRIPT_ID` — Script ID ของโปรเจกต์ Apps Script (ดูใน Apps Script Project Settings)
- `CLASPRC_JSON` — เนื้อหาไฟล์ `~/.clasprc.json` ที่สร้างจากการล็อกอิน `clasp` ของบัญชี Google เจ้าของโปรเจกต์
- `GAS_DEPLOYMENT_ID` — ไม่บังคับในครั้งแรก; เมื่อมี deployment แล้วให้บันทึก Deployment ID ที่ต้องการอัปเดต เพื่อรักษา URL เดิม

ห้าม commit `.clasprc.json`, `.clasp.json`, access token, รหัสผ่าน, Script Properties หรือข้อมูลผู้จองจริง

จากนั้นไปที่ **Actions → Deploy Google Apps Script → Run workflow** เพื่อ push source และ deploy

ถ้ายังไม่มี `GAS_DEPLOYMENT_ID` workflow จะสร้าง deployment ใหม่; หากต้องการรักษา URL เดิม ให้เพิ่ม ID ของ deployment เดิมเป็น secret ก่อนรันครั้งต่อไป

## 3. ความปลอดภัยและการทดสอบ

- โค้ดใน repository ไม่ฝัง Spreadsheet ID, Slides ID, Folder ID, รายการอีเมลแอดมิน หรือรหัสผ่าน
- จำกัดสิทธิ์เข้าถึง Web App ตามนโยบายของโรงเรียน
- ไฟล์ PDF มีข้อมูลส่วนบุคคล ควรตั้งสิทธิ์ Drive ให้เหมาะสม
- ทดสอบการจองทับซ้อน, การอนุมัติ, การคืนรถ, การสร้าง PDF, การส่งอีเมล และการจัดการแอดมิน ก่อนให้บุคลากรใช้จริง

GitHub Actions สามารถ push/deploy source ได้เมื่อ secrets และการอนุญาต OAuth ถูกตั้งค่าแล้วเท่านั้น และไม่ได้ยืนยันโดยตัวมันเองว่าบริการ Sheets/Slides/Drive/Gmail ทำงานครบจนกว่าจะทดสอบในบัญชี Google จริง
