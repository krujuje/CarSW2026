/**
 * ระบบจองรถส่วนกลาง โรงเรียนสุวรรณภูมิวิทยาลัย
 * Backend: Google Apps Script
 *
 * ติดตั้ง:
 * 1) วาง Code.gs และ Index.html ในโปรเจกต์ Apps Script
 * 2) แก้ไข/ตรวจสอบค่าคงที่ด้านล่าง
 * 3) รัน setupDatabase() ด้วยบัญชีเจ้าของระบบและอนุญาตสิทธิ์
 * 4) Deploy > New deployment > Web app
 *    Execute as: Me; Who has access: ตามนโยบายโรงเรียน
 *
 * Security: no private IDs, admin email list, or passwords are embedded in source.
 * Configure Script Properties privately before database setup.
 */

function requiredScriptProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value || !String(value).trim()) {
    throw new Error('กรุณาตั้งค่า Script Property: ' + key + ' ก่อนใช้งาน');
  }
  return String(value).trim();
}

const CONFIG = Object.freeze({
  get SHEET_ID() { return requiredScriptProperty_('SHEET_ID'); },
  get SLIDE_TEMPLATE_ID() { return requiredScriptProperty_('SLIDE_TEMPLATE_ID'); },
  get DRIVE_FOLDER_ID() { return requiredScriptProperty_('DRIVE_FOLDER_ID'); },
  LOGO_URL: 'https://lh3.googleusercontent.com/d/19sFO8y8GKvWHBA76t9rSH7CLcejrKjlM',
  SCHOOL_NAME: 'โรงเรียนสุวรรณภูมิวิทยาลัย',
  DISTRICT_NAME: 'สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาร้อยเอ็ด',
  get ADMIN_EMAILS() {
    return requiredScriptProperty_('ADMIN_EMAILS').split(',').map(x => x.trim()).filter(Boolean);
  },
  TIMEZONE: 'Asia/Bangkok',
  SESSION_SECONDS: 21600
});

const SHEETS = {
  bookings: {
    name: 'การจองรถ',
    headers: [
      'หมายเลขการจอง','วันเวลาบันทึก','อีเมลผู้จอง','คำนำหน้า','ชื่อ','นามสกุล',
      'เบอร์โทรผู้จอง','กลุ่มงาน/กลุ่มสาระ','ใช้ในราชการเพื่อ','สถานที่ไป','จังหวัด',
      'วันที่เดินทางไป','เวลาออกจากโรงเรียน','วันที่เดินทางกลับ','เวลาถึงโรงเรียน',
      'รวมวัน','จำนวนผู้โดยสาร','รถที่จอง','คนขับที่เลือก','เบอร์โทรคนขับ',
      'คนขับระบุเอง','สถานะ','ผู้อนุมัติ','วันเวลาอนุมัติ','วันเวลาคืนรถ',
      'ลิงก์ใบจอง PDF','หมายเหตุ','แก้ไขล่าสุด'
    ]
  },
  vehicles: {
    name: 'ข้อมูลรถ',
    headers: ['รหัสรถ','ชื่อรถ','ทะเบียนรถ','สถานะใช้งาน','หมายเหตุ','วันที่สร้าง','แก้ไขล่าสุด']
  },
  drivers: {
    name: 'ข้อมูลพลขับ',
    headers: ['รหัสพลขับ','ชื่อพลขับ','เบอร์โทรศัพท์','ประเภท','สถานะใช้งาน','หมายเหตุ','วันที่สร้าง','แก้ไขล่าสุด']
  },
  admins: {
    name: 'ผู้ดูแลระบบ',
    headers: ['รหัสแอดมิน','ชื่อ','อีเมล','เบอร์โทรศัพท์','สถานะใช้งาน','วันที่สร้าง','แก้ไขล่าสุด']
  },
  audit: {
    name: 'ประวัติระบบ',
    headers: ['วันเวลา','ผู้ดำเนินการ','การกระทำ','หมายเลขการจอง/รหัส','รายละเอียด']
  }
};

const DEFAULT_VEHICLES = [
  ['รถตู้ใหญ่','นข 5381 ร้อยเอ็ด'],
  ['รถตู้กลาง','40-0240 ร้อยเอ็ด'],
  ['รถตู้เล็ก','นข-0240 ร้อยเอ็ด'],
  ['รถ 6 ล้อใหญ่','40-0453 ร้อยเอ็ด'],
  ['รถ 6 ล้อเล็ก','40-0303 ร้อยเอ็ด'],
  ['รถกระบะสีน้ำตาล','นก 2632 ร้อยเอ็ด'],
  ['รถกระบะสีขาว','ม 3720 ร้อยเอ็ด']
];

const DEFAULT_DRIVERS = [
  ['นายบุญศรี เอี่ยมศรี','0800635789','ประจำ'],
  ['นายเชิด แปวประเสริฐ','0938107288','ประจำ'],
  ['นายเชษฐวงศ์ เขตเจริญ','0822796847','ประจำ'],
  ['นายพงศ์สุดา ศรีโคตร','0984629813','ประจำ'],
  ['ตามโรงเรียนจัดให้','','จัดสรร'],
  ['ขับเอง','','ผู้จองขับเอง']
];

const DEPARTMENTS = [
  'กลุ่มบริหารวิชาการ','กลุ่มบริหารงานบุคคล','กลุ่มบริหารงบประมาณ',
  'กลุ่มบริหารทั่วไป','ภาษาไทย','คณิตศาสตร์','วิทยาศาสตร์และเทคโนโลยี',
  'สังคมศึกษาศาสนาและวัฒนธรรม','สุขศึกษาและพลศึกษา','ศิลปะ',
  'การงานอาชีพ','ภาษาต่างประเทศ','งานอื่นๆ'
];

function doGet() {
  // ใช้ Index.html ในโปรเจกต์ที่ติดตั้งตรงจาก Apps Script หรือ App.html จาก GitHub
  let page;
  try {
    page = HtmlService.createHtmlOutputFromFile('Index');
  } catch (indexError) {
    page = HtmlService.createHtmlOutputFromFile('App');
  }
  return page
    .setTitle('ระบบจองรถส่วนกลาง | โรงเรียนสุวรรณภูมิวิทยาลัย')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** สร้างชีต/หัวตารางไทย และเพิ่มข้อมูลตั้งต้นโดยไม่ลบข้อมูลเดิม */
function setupDatabase() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  Object.keys(SHEETS).forEach(key => {
    const def = SHEETS[key];
    let sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    const first = sh.getRange(1, 1, 1, def.headers.length).getValues()[0];
    if (first.every(v => v === '')) {
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    } else {
      // หัวตารางมีอยู่แล้ว: ไม่เขียนทับข้อมูลโดยอัตโนมัติ
      const existing = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), def.headers.length)).getValues()[0];
      const same = def.headers.every((h, i) => existing[i] === h);
      if (!same) throw new Error('หัวตารางชีต "' + def.name + '" ไม่ตรงกับระบบ กรุณาสำรองข้อมูลและตรวจสอบก่อนแก้ไข');
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, def.headers.length)
      .setBackground('#174f38').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
    sh.autoResizeColumns(1, def.headers.length);
  });

  seedDefaults_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD_HASH')) {
    const initialPassword = props.getProperty('MASTER_ADMIN_INITIAL_PASSWORD');
    if (!initialPassword || initialPassword.length < 10) {
      throw new Error('กรุณาตั้ง Script Property MASTER_ADMIN_INITIAL_PASSWORD เป็นรหัสผ่านส่วนตัวอย่างน้อย 10 ตัวอักษร แล้วรัน setupDatabase() อีกครั้ง');
    }
    const salt = Utilities.getUuid();
    props.setProperty('ADMIN_USERNAME', props.getProperty('ADMIN_USERNAME') || 'admin');
    props.setProperty('AUTH_SALT', salt);
    props.setProperty('ADMIN_PASSWORD_HASH', hashPassword_(initialPassword, salt));
    props.setProperty('PASSWORD_CHANGE_REQUIRED', 'true');
    props.deleteProperty('MASTER_ADMIN_INITIAL_PASSWORD');
  }
  return 'ตั้งค่าฐานข้อมูลเรียบร้อยแล้ว';
}

function seedDefaults_() {
  const vehicles = getSheet_('vehicles');
  if (vehicles.getLastRow() < 2) {
    DEFAULT_VEHICLES.forEach((v, i) => vehicles.appendRow([
      'CAR' + String(i + 1).padStart(3, '0'), v[0], v[1], 'ใช้งาน', '', new Date(), new Date()
    ]));
  }
  const drivers = getSheet_('drivers');
  if (drivers.getLastRow() < 2) {
    DEFAULT_DRIVERS.forEach((d, i) => drivers.appendRow([
      'DRV' + String(i + 1).padStart(3, '0'), d[0], d[1], d[2], 'ใช้งาน', '', new Date(), new Date()
    ]));
  }
  const admins = getSheet_('admins');
  if (admins.getLastRow() < 2) {
    admins.appendRow(['ADM001','ผู้ดูแลระบบ',CONFIG.ADMIN_EMAILS[0],'','ใช้งาน',new Date(),new Date()]);
  }
}

function getPublicData() {
  const bookings = rowsAsObjects_('bookings');
  const safeBookings = bookings.map(b => ({
    bookingId: b['หมายเลขการจอง'],
    purpose: b['ใช้ในราชการเพื่อ'],
    destination: b['สถานที่ไป'],
    province: b['จังหวัด'],
    departDate: b['วันที่เดินทางไป'],
    departTime: b['เวลาออกจากโรงเรียน'],
    returnDate: b['วันที่เดินทางกลับ'],
    returnTime: b['เวลาถึงโรงเรียน'],
    duration: b['รวมวัน'],
    vehicle: b['รถที่จอง'],
    status: b['สถานะ']
  }));
  return {
    schoolName: CONFIG.SCHOOL_NAME,
    districtName: CONFIG.DISTRICT_NAME,
    logoUrl: CONFIG.LOGO_URL,
    departments: DEPARTMENTS,
    vehicles: rowsAsObjects_('vehicles').filter(x => x['สถานะใช้งาน'] === 'ใช้งาน').map(x => ({
      id: x['รหัสรถ'], name: x['ชื่อรถ'], plate: x['ทะเบียนรถ']
    })),
    drivers: rowsAsObjects_('drivers').filter(x => x['สถานะใช้งาน'] === 'ใช้งาน').map(x => ({
      id: x['รหัสพลขับ'], name: x['ชื่อพลขับ'], phone: x['เบอร์โทรศัพท์'], type: x['ประเภท']
    })),
    bookings: safeBookings
  };
}

function submitBooking(form) {
  validateBooking_(form);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let bookingId = '';
  try {
    const all = rowsAsObjects_('bookings');
    const conflict = findConflict_(form, all);
    if (conflict) throw new Error(conflict);

    bookingId = nextBookingId_();
    const driverName = String(form.driverName || '');
    const driver = rowsAsObjects_('drivers').find(d => d['ชื่อพลขับ'] === driverName);
    const now = new Date();
    const days = durationDays_(form.departDate, form.returnDate);
    const row = [
      bookingId, now, String(form.email).trim(), String(form.prefix), String(form.firstName).trim(),
      String(form.lastName).trim(), "'" + String(form.phone).trim(), String(form.department),
      String(form.purpose).trim(), String(form.destination).trim(), String(form.province).trim(),
      String(form.departDate), String(form.departTime), String(form.returnDate), String(form.returnTime),
      days, Number(form.passengers), String(form.vehicleName), driverName,
      driver ? String(driver['เบอร์โทรศัพท์'] || '') : '',
      String(form.customDriver || ''), 'รออนุมัติ', '', '', '', '', '', now
    ];
    const sh = getSheet_('bookings');
    sh.appendRow(row);
    const rowNo = sh.getLastRow();
    sh.getRange(rowNo, 7).setNumberFormat('@'); // เบอร์โทรเป็นข้อความ
    sh.getRange(rowNo, 20).setNumberFormat('@');
    let pdfUrl = '';
    try {
      pdfUrl = createBookingPdf_(bookingId, form, days);
      sh.getRange(rowNo, 26).setValue(pdfUrl);
    } catch (pdfErr) {
      audit_('ระบบ', 'สร้าง PDF ไม่สำเร็จ', bookingId, String(pdfErr));
    }
    audit_(form.email, 'ส่งคำขอจอง', bookingId, 'สถานะ: รออนุมัติ');
    sendBookingEmails_(bookingId, form, days, pdfUrl);
    return { ok: true, bookingId, status: 'รออนุมัติ', pdfUrl };
  } finally {
    lock.releaseLock();
  }
}

/** ซ่อมบัญชีแอดมินหลักกรณีรหัสเดิม/รหัสใหม่เข้าไม่ได้
 * ให้เจ้าของโปรเจกต์รันฟังก์ชันนี้จาก Apps Script Editor เพียงครั้งเดียว
 * จากนั้น Deploy เป็น New version แล้วเข้าสู่ระบบด้วยบัญชีที่กำหนดไว้ใน Script Properties
 */
function repairMasterAdminLogin() {
  const props = PropertiesService.getScriptProperties();
  const resetPassword = props.getProperty('MASTER_ADMIN_RESET_PASSWORD');
  if (!resetPassword || resetPassword.length < 10) {
    throw new Error('กรุณาตั้ง Script Property MASTER_ADMIN_RESET_PASSWORD เป็นรหัสผ่านใหม่อย่างน้อย 10 ตัวอักษรก่อนรันฟังก์ชันนี้');
  }
  const salt = Utilities.getUuid();
  props.setProperty('ADMIN_USERNAME', 'admin');
  props.setProperty('AUTH_SALT', salt);
  props.setProperty('ADMIN_PASSWORD_HASH', hashPassword_(resetPassword, salt));
  props.setProperty('PASSWORD_CHANGE_REQUIRED', 'true');
  props.deleteProperty('MASTER_ADMIN_RESET_PASSWORD');
  audit_('ระบบ', 'ซ่อมบัญชีแอดมินหลัก', 'admin', 'รีเซ็ตรหัสผ่านโดยเจ้าของ Apps Script');
  return 'รีเซ็ตบัญชีแอดมินหลักสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้ใน Script Properties แล้วเปลี่ยนรหัสผ่าน';
}

function adminLogin(username, password) {
  const props = PropertiesService.getScriptProperties();
  const user = String(username || '').trim();
  const pass = String(password || '');
  let ok = false, changeRequired = false, sessionActor = 'admin';
  const masterSalt = props.getProperty('AUTH_SALT');
  if (user === (props.getProperty('ADMIN_USERNAME') || 'admin') && masterSalt && hashPassword_(pass, masterSalt) === props.getProperty('ADMIN_PASSWORD_HASH')) {
    ok = true; changeRequired = props.getProperty('PASSWORD_CHANGE_REQUIRED') === 'true';
  }
  // รองรับบัญชีแอดมินเพิ่มเติม: ใช้ username ที่กำหนด หรืออีเมลที่ลงทะเบียนไว้
  if (!ok) {
    const admins = rowsAsObjects_('admins');
    const matched = admins.find(a => String(a['สถานะใช้งาน'] || 'ใช้งาน') === 'ใช้งาน' &&
      (String(props.getProperty('ADMIN_LOGIN_' + a['รหัสแอดมิน']) || '').toLowerCase() === user.toLowerCase() || String(a['อีเมล'] || '').toLowerCase() === user.toLowerCase()));
    if (matched) {
      const id = String(matched['รหัสแอดมิน']);
      const salt = props.getProperty('ADMIN_SALT_' + id);
      if (salt && hashPassword_(pass, salt) === props.getProperty('ADMIN_HASH_' + id)) { ok = true; sessionActor = id; }
    }
  }
    if (!ok) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกปิดใช้งาน');
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token, sessionActor, CONFIG.SESSION_SECONDS);
  return { token, expiresIn: CONFIG.SESSION_SECONDS, changeRequired };
}

function requestAdminPasswordReset(usernameOrEmail) {
  const input = String(usernameOrEmail || '').trim().toLowerCase();
  if (!input) throw new Error('กรุณากรอกชื่อผู้ใช้หรืออีเมลแอดมิน');
  const props = PropertiesService.getScriptProperties();
  const admins = rowsAsObjects_('admins');
  if (input === String(props.getProperty('ADMIN_USERNAME') || 'admin').toLowerCase()) {
    const email = CONFIG.ADMIN_EMAILS[0];
    const temporary = 'SW' + Utilities.getUuid().replace(/-/g, '').slice(0, 10) + '!';
    const salt = Utilities.getUuid(); props.setProperty('AUTH_SALT', salt); props.setProperty('ADMIN_PASSWORD_HASH', hashPassword_(temporary, salt)); props.setProperty('PASSWORD_CHANGE_REQUIRED', 'true');
    MailApp.sendEmail({to:email, subject:'รีเซ็ตรหัสผ่านแอดมินหลักระบบจองรถ', body:'รหัสผ่านชั่วคราวสำหรับบัญชี admin: ' + temporary + '\nกรุณาเข้าสู่ระบบและเปลี่ยนรหัสผ่านทันที'});
    audit_('ระบบ', 'รีเซ็ตรหัสผ่านแอดมินหลัก', 'admin', 'ส่งรหัสชั่วคราวไปยังอีเมลแอดมินหลักที่กำหนดใน CONFIG');
    return {ok:true, message:'ส่งรหัสผ่านชั่วคราวไปยังอีเมลแอดมินหลักที่กำหนดไว้ในระบบแล้ว'};
  }
  const admin = admins.find(a => String(a['สถานะใช้งาน'] || 'ใช้งาน') === 'ใช้งาน' &&
    (String(a['อีเมล'] || '').toLowerCase() === input || String(props.getProperty('ADMIN_LOGIN_' + a['รหัสแอดมิน']) || '').toLowerCase() === input));
  if (!admin) {
    if (input === String(props.getProperty('ADMIN_USERNAME') || 'admin').toLowerCase()) throw new Error('บัญชีแอดมินหลักไม่มีอีเมลที่ยืนยันไว้ในระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน');
    throw new Error('ไม่พบบัญชีแอดมินที่ใช้งานด้วยข้อมูลนี้');
  }
  const id = String(admin['รหัสแอดมิน']), email = String(admin['อีเมล'] || '').trim();
  if (!email) throw new Error('บัญชีนี้ยังไม่มีอีเมลสำหรับรับรหัสใหม่ กรุณาให้แอดมินหลักเพิ่มอีเมลก่อน');
  const temporary = 'SW' + Utilities.getUuid().replace(/-/g, '').slice(0, 10) + '!';
  const salt = Utilities.getUuid();
  props.setProperty('ADMIN_SALT_' + id, salt); props.setProperty('ADMIN_HASH_' + id, hashPassword_(temporary, salt));
  MailApp.sendEmail({to:email, subject:'รีเซ็ตรหัสผ่านระบบจองรถส่วนกลาง', body:'มีคำขอสร้างรหัสผ่านใหม่สำหรับบัญชีแอดมินของท่าน\nชื่อผู้ใช้: ' + (props.getProperty('ADMIN_LOGIN_' + id) || email) + '\nรหัสผ่านชั่วคราว: ' + temporary + '\nกรุณาเข้าสู่ระบบและเปลี่ยนรหัสผ่านทันที หากท่านไม่ได้ร้องขอ โปรดติดต่อแอดมินหลัก'});
  audit_(email, 'ขอรหัสผ่านใหม่', id, 'ส่งรหัสชั่วคราวทางอีเมล');
  return {ok:true, message:'ส่งรหัสผ่านชั่วคราวไปยังอีเมลแอดมินที่ลงทะเบียนแล้ว'};
}

function setAdminLoginCredentials_(id, username, password) {
  const props = PropertiesService.getScriptProperties();
  const u = String(username || '').trim();
  if (u) {
    if (!/^[A-Za-z0-9._@-]{3,80}$/.test(u)) throw new Error('ชื่อผู้ใช้ต้องมี 3–80 ตัว และใช้ตัวอักษรอังกฤษ ตัวเลข . _ @ - เท่านั้น');
    const all = rowsAsObjects_('admins');
    const duplicate = all.find(a => String(a['รหัสแอดมิน']) !== id && String(props.getProperty('ADMIN_LOGIN_' + a['รหัสแอดมิน']) || '').toLowerCase() === u.toLowerCase());
    if (duplicate) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
    props.setProperty('ADMIN_LOGIN_' + id, u);
  }
  if (password) {
    if (String(password).length < 10) throw new Error('รหัสผ่านแอดมินต้องมีอย่างน้อย 10 ตัวอักษร');
    const salt = Utilities.getUuid(); props.setProperty('ADMIN_SALT_' + id, salt); props.setProperty('ADMIN_HASH_' + id, hashPassword_(password, salt));
  }
}


function adminLogout(token) {
  if (token) CacheService.getScriptCache().remove('sess_' + token);
  return { ok: true };
}

function changeAdminPassword(token, oldPassword, newPassword) {
  const actor = requireAdmin_(token);
  if (String(newPassword).length < 10) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร');
  const props = PropertiesService.getScriptProperties();
  if (actor === 'admin') {
    const salt = props.getProperty('AUTH_SALT');
    if (hashPassword_(String(oldPassword), salt) !== props.getProperty('ADMIN_PASSWORD_HASH')) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
    const newSalt = Utilities.getUuid(); props.setProperty('AUTH_SALT', newSalt); props.setProperty('ADMIN_PASSWORD_HASH', hashPassword_(String(newPassword), newSalt)); props.setProperty('PASSWORD_CHANGE_REQUIRED', 'false');
  } else {
    const salt = props.getProperty('ADMIN_SALT_' + actor);
    if (!salt || hashPassword_(String(oldPassword), salt) !== props.getProperty('ADMIN_HASH_' + actor)) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
    const newSalt = Utilities.getUuid(); props.setProperty('ADMIN_SALT_' + actor, newSalt); props.setProperty('ADMIN_HASH_' + actor, hashPassword_(String(newPassword), newSalt));
  }
  audit_(actor, 'เปลี่ยนรหัสผ่าน', '', 'เปลี่ยนรหัสผ่านผู้ดูแลระบบ');
  return { ok: true };
}

function getAdminData(token) {
  requireAdmin_(token);
  const bookings = rowsAsObjects_('bookings').map(b => ({
    bookingId: b['หมายเลขการจอง'], createdAt: displayDateTime_(b['วันเวลาบันทึก']),
    email: b['อีเมลผู้จอง'], prefix: b['คำนำหน้า'], firstName: b['ชื่อ'], lastName: b['นามสกุล'],
    fullName: [b['คำนำหน้า'],b['ชื่อ'],b['นามสกุล']].filter(Boolean).join(' '),
    phone: String(b['เบอร์โทรผู้จอง'] || '').replace(/^'/, ''), department: b['กลุ่มงาน/กลุ่มสาระ'],
    purpose: b['ใช้ในราชการเพื่อ'], destination: b['สถานที่ไป'], province: b['จังหวัด'],
    departDate: normalizeDate_(b['วันที่เดินทางไป']), departTime: b['เวลาออกจากโรงเรียน'],
    returnDate: normalizeDate_(b['วันที่เดินทางกลับ']), returnTime: b['เวลาถึงโรงเรียน'],
    duration: b['รวมวัน'], passengers: b['จำนวนผู้โดยสาร'], vehicle: b['รถที่จอง'],
    driver: b['คนขับที่เลือก'], driverPhone: b['เบอร์โทรคนขับ'], customDriver: b['คนขับระบุเอง'],
    status: b['สถานะ'], approver: b['ผู้อนุมัติ'], approvedAt: displayDateTime_(b['วันเวลาอนุมัติ']),
    returnedAt: displayDateTime_(b['วันเวลาคืนรถ']), pdfUrl: b['ลิงก์ใบจอง PDF'], note: b['หมายเหตุ']
  }));
  const vehicles = rowsAsObjects_('vehicles').map(v => ({
    id:v['รหัสรถ'], name:v['ชื่อรถ'], plate:v['ทะเบียนรถ'], active:v['สถานะใช้งาน'],
    note:v['หมายเหตุ']
  }));
  const drivers = rowsAsObjects_('drivers').map(d => ({
    id:d['รหัสพลขับ'], name:d['ชื่อพลขับ'], phone:String(d['เบอร์โทรศัพท์'] || '').replace(/^'/, ''),
    type:d['ประเภท'], active:d['สถานะใช้งาน'], note:d['หมายเหตุ']
  }));
  const admins = rowsAsObjects_('admins').map(a => ({
    id:a['รหัสแอดมิน'], name:a['ชื่อ'], email:a['อีเมล'], username:PropertiesService.getScriptProperties().getProperty('ADMIN_LOGIN_' + a['รหัสแอดมิน']) || '', phone:String(a['เบอร์โทรศัพท์'] || '').replace(/^'/, ''),
    active:a['สถานะใช้งาน']
  }));
  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const activeStatuses = ['อนุมัติ','กำลังใช้งาน'];
  const todays = bookings.filter(b => b.departDate <= today && b.returnDate >= today && activeStatuses.includes(b.status));
  return {
    bookings, vehicles, drivers, admins, today,
    spreadsheetUrl: SpreadsheetApp.openById(CONFIG.SHEET_ID).getUrl(),
    metrics: {
      pending: bookings.filter(b => b.status === 'รออนุมัติ').length,
      today: todays.length,
      vehicleTotal: vehicles.filter(v => v.active === 'ใช้งาน').length,
      vehicleReady: vehicles.filter(v => v.active === 'ใช้งาน' && !todays.some(b => b.vehicle === v.name)).length,
      vehicleInUse: vehicles.filter(v => v.active === 'ใช้งาน' && todays.some(b => b.vehicle === v.name)).length,
      driverTotal: drivers.filter(d => d.active === 'ใช้งาน').length,
      driverReady: drivers.filter(d => d.active === 'ใช้งาน' && !todays.some(b => b.driver === d.name)).length
    }
  };
}

function updateBookingStatus(token, bookingId, newStatus, note, approverName) {
  requireAdmin_(token);
  const allowed = ['อนุมัติ','ไม่อนุมัติ','กำลังใช้งาน','คืนรถแล้ว','ยกเลิก'];
  if (!allowed.includes(newStatus)) throw new Error('สถานะไม่ถูกต้อง');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = getSheet_('bookings');
    const records = rowsAsObjects_('bookings');
    const idx = records.findIndex(b => b['หมายเลขการจอง'] === bookingId);
    if (idx < 0) throw new Error('ไม่พบหมายเลขการจอง');
    const b = records[idx];
    if (newStatus === 'อนุมัติ') {
      const form = {
        departDate: normalizeDate_(b['วันที่เดินทางไป']), departTime: b['เวลาออกจากโรงเรียน'],
        returnDate: normalizeDate_(b['วันที่เดินทางกลับ']), returnTime: b['เวลาถึงโรงเรียน'],
        vehicleName: b['รถที่จอง'], driverName: b['คนขับที่เลือก']
      };
      const other = records.filter(x => x['หมายเลขการจอง'] !== bookingId && ['รออนุมัติ','อนุมัติ','กำลังใช้งาน'].includes(x['สถานะ']));
      const conflict = findConflict_(form, other, true);
      if (conflict) throw new Error(conflict);
    }
    const rowNo = idx + 2;
    const now = new Date();
    const headers = SHEETS.bookings.headers;
    // ตรวจสอบผู้อนุมัติก่อนเขียนสถานะ เพื่อไม่ให้ข้อมูลเปลี่ยนครึ่งทางเมื่อ validation ล้มเหลว
    let selectedApprover = '';
    if (newStatus === 'อนุมัติ') {
      const activeAdmins = rowsAsObjects_('admins').filter(a => String(a['สถานะใช้งาน'] || 'ใช้งาน').trim() === 'ใช้งาน' && String(a['ชื่อ'] || '').trim());
      selectedApprover = String(approverName || '').trim();
      if (!selectedApprover || !activeAdmins.some(a => String(a['ชื่อ']).trim() === selectedApprover)) {
        throw new Error('กรุณาเลือกชื่อแอดมินผู้อนุมัติจากรายชื่อที่ใช้งาน');
      }
      // ตรวจสอบช่วงวันเวลาเดิมอย่างชัดเจนก่อนอนุมัติ
      const start = dateTime_(normalizeDate_(b['วันที่เดินทางไป']), b['เวลาออกจากโรงเรียน']);
      const end = dateTime_(normalizeDate_(b['วันที่เดินทางกลับ']), b['เวลาถึงโรงเรียน']);
      if (!start || !end || end.getTime() <= start.getTime()) {
        throw new Error('วันเวลาเดินทางกลับต้องอยู่หลังวันเวลาเดินทางไป กรุณาตรวจสอบวันที่และเวลาในรายการจอง');
      }
    }
    const statusCol = headers.indexOf('สถานะ') + 1;
    sh.getRange(rowNo, statusCol).setValue(newStatus);
    sh.getRange(rowNo, headers.indexOf('แก้ไขล่าสุด') + 1).setValue(now);
    if (newStatus === 'อนุมัติ') {
      sh.getRange(rowNo, headers.indexOf('ผู้อนุมัติ') + 1).setValue(selectedApprover);
      sh.getRange(rowNo, headers.indexOf('วันเวลาอนุมัติ') + 1).setValue(now);
    }
    if (newStatus === 'คืนรถแล้ว') sh.getRange(rowNo, headers.indexOf('วันเวลาคืนรถ') + 1).setValue(now);
    if (note !== undefined) sh.getRange(rowNo, headers.indexOf('หมายเหตุ') + 1).setValue(String(note));
    const updated = rowsAsObjects_('bookings').find(x => x['หมายเลขการจอง'] === bookingId);
    sendStatusEmails_(updated, newStatus, note || '');
    audit_('admin', 'เปลี่ยนสถานะ', bookingId, newStatus + (note ? ' | ' + note : ''));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Full CRUD สำหรับรถ / พลขับ / แอดมิน ใช้ฟังก์ชันเดียวแบบ allow-list */
function saveEntity(token, entityType, data) {
  if (entityType === 'admin') requireMasterAdmin_(token); else requireAdmin_(token);
  const map = {
    vehicle: {key:'vehicles', id:'รหัสรถ', fields:['ชื่อรถ','ทะเบียนรถ','สถานะใช้งาน','หมายเหตุ'], prefix:'CAR'},
    driver: {key:'drivers', id:'รหัสพลขับ', fields:['ชื่อพลขับ','เบอร์โทรศัพท์','ประเภท','สถานะใช้งาน','หมายเหตุ'], prefix:'DRV'},
    admin: {key:'admins', id:'รหัสแอดมิน', fields:['ชื่อ','อีเมล','เบอร์โทรศัพท์','สถานะใช้งาน'], prefix:'ADM'}
  };
  const cfg = map[entityType];
  if (!cfg) throw new Error('ประเภทข้อมูลไม่ถูกต้อง');
  const sh = getSheet_(cfg.key);
  const all = rowsAsObjects_(cfg.key);
  const id = String(data.id || '').trim();
  const isNew = !id;
  const recordId = id || nextEntityId_(cfg.prefix, all, cfg.id);
  const requiredName = entityType === 'vehicle' ? data.name : entityType === 'driver' ? data.name : data.name;
  if (!String(requiredName || '').trim()) throw new Error(entityType === 'admin' ? 'กรุณากรอกชื่อแอดมิน' : entityType === 'driver' ? 'กรุณากรอกชื่อพลขับ' : 'กรุณากรอกชื่อรถ');
  if (entityType === 'admin') {
    const email = String(data.email || '').trim().toLowerCase();
    if (!email) throw new Error('กรุณากรอกอีเมลแอดมิน');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('รูปแบบอีเมลแอดมินไม่ถูกต้อง');
    if (all.some(a => String(a['อีเมล'] || '').trim().toLowerCase() === email && a[cfg.id] !== recordId)) throw new Error('อีเมลนี้มีอยู่ในรายชื่อแอดมินแล้ว');
    data.email = email;
  }
  if (entityType === 'admin') {
    if (isNew && (!String(data.username || '').trim() || !String(data.password || ''))) throw new Error('การเพิ่มแอดมินต้องกำหนดชื่อผู้ใช้และรหัสผ่าน');
    if (data.password && String(data.password).length < 10) throw new Error('รหัสผ่านแอดมินต้องมีอย่างน้อย 10 ตัวอักษร');
    const rawUsername = String(data.username || '').trim();
    if (rawUsername && !/^[A-Za-z0-9._@-]{3,80}$/.test(rawUsername)) throw new Error('ชื่อผู้ใช้ต้องมี 3–80 ตัว และใช้ตัวอักษรอังกฤษ ตัวเลข . _ @ - เท่านั้น');
    const u = rawUsername.toLowerCase();
    if (u && all.some(a => String(a['รหัสแอดมิน']) !== recordId && String(PropertiesService.getScriptProperties().getProperty('ADMIN_LOGIN_' + a['รหัสแอดมิน']) || '').toLowerCase() === u)) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
  }
  let rowValues;
  if (entityType === 'vehicle') rowValues = [recordId, data.name || '', data.plate || '', data.active || 'ใช้งาน', data.note || '', new Date(), new Date()];
  if (entityType === 'driver') rowValues = [recordId, data.name || '', "'" + String(data.phone || ''), data.type || 'ประจำ', data.active || 'ใช้งาน', data.note || '', new Date(), new Date()];
  if (entityType === 'admin') rowValues = [recordId, data.name || '', data.email || '', "'" + String(data.phone || ''), data.active || 'ใช้งาน', new Date(), new Date()];
  const row = all.findIndex(x => x[cfg.id] === recordId);
  if (row >= 0) {
    const existingRow = sh.getRange(row + 2, 1, 1, sh.getLastColumn()).getValues()[0];
    const headers = SHEETS[cfg.key].headers;
    const fieldMap = entityType === 'vehicle'
      ? {'name':'ชื่อรถ','plate':'ทะเบียนรถ','active':'สถานะใช้งาน','note':'หมายเหตุ'}
      : entityType === 'driver'
        ? {'name':'ชื่อพลขับ','phone':'เบอร์โทรศัพท์','type':'ประเภท','active':'สถานะใช้งาน','note':'หมายเหตุ'}
        : {'name':'ชื่อ','email':'อีเมล','phone':'เบอร์โทรศัพท์','active':'สถานะใช้งาน'};
    Object.keys(fieldMap).forEach(k => {
      if (data[k] !== undefined) {
        let value = data[k];
        if (k === 'phone') value = "'" + String(value || '');
        existingRow[headers.indexOf(fieldMap[k])] = value;
      }
    });
    existingRow[headers.indexOf('แก้ไขล่าสุด') >= 0 ? headers.indexOf('แก้ไขล่าสุด') : headers.length - 1] = new Date();
    sh.getRange(row + 2, 1, 1, existingRow.length).setValues([existingRow]);
  } else {
    sh.appendRow(rowValues);
  }
  if (entityType === 'admin') setAdminLoginCredentials_(recordId, data.username || '', data.password || '');
  audit_('admin', isNew ? 'เพิ่มข้อมูล' : 'แก้ไขข้อมูล', recordId, entityType);
  return { ok: true, id: recordId };
}

function deleteEntity(token, entityType, id) {
  if (entityType === 'admin') requireMasterAdmin_(token); else requireAdmin_(token);
  const map = {vehicle:{key:'vehicles',id:'รหัสรถ',name:'ชื่อรถ'},driver:{key:'drivers',id:'รหัสพลขับ',name:'ชื่อพลขับ'},admin:{key:'admins',id:'รหัสแอดมิน',name:'ชื่อ'}};
  const cfg = map[entityType];
  if (!cfg) throw new Error('ประเภทข้อมูลไม่ถูกต้อง');
  const bookings = rowsAsObjects_('bookings');
  const entity = rowsAsObjects_(cfg.key).find(x => x[cfg.id] === id);
  if (!entity) throw new Error('ไม่พบข้อมูล');
  const field = entityType === 'vehicle' ? 'รถที่จอง' : entityType === 'driver' ? 'คนขับที่เลือก' : null;
  if (field && bookings.some(b => b[field] === entity[cfg.name] && !['คืนรถแล้ว','ยกเลิก','ไม่อนุมัติ'].includes(b['สถานะ']))) {
    throw new Error('ไม่สามารถลบได้ เพราะมีรายการจองที่ยังดำเนินการอยู่ แนะนำให้เปลี่ยนสถานะเป็นไม่ใช้งาน');
  }
  const sh = getSheet_(cfg.key);
  const idx = rowsAsObjects_(cfg.key).findIndex(x => x[cfg.id] === id);
  sh.deleteRow(idx + 2);
  audit_('admin', 'ลบข้อมูล', id, entityType);
  return { ok: true };
}

function getReport(token, vehicleName) {
  requireAdmin_(token);
  const bookings = rowsAsObjects_('bookings').filter(b => !vehicleName || vehicleName === 'ทั้งหมด' || b['รถที่จอง'] === vehicleName);
  return bookings.map(b => ({
    bookingId:b['หมายเลขการจอง'], name:[b['คำนำหน้า'],b['ชื่อ'],b['นามสกุล']].filter(Boolean).join(' '),
    phone:String(b['เบอร์โทรผู้จอง'] || '').replace(/^'/,''), destination:b['สถานที่ไป'],
    departDate:normalizeDate_(b['วันที่เดินทางไป']), returnDate:normalizeDate_(b['วันที่เดินทางกลับ']),
    vehicle:b['รถที่จอง'], driver:b['คนขับที่เลือก'], status:b['สถานะ'], pdfUrl:b['ลิงก์ใบจอง PDF']
  }));
}

function nextBookingId_() {
  const records = rowsAsObjects_('bookings');
  let max = 0;
  records.forEach(r => {
    const m = String(r['หมายเลขการจอง'] || '').match(/^CarSW(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'CarSW' + String(max + 1).padStart(3, '0');
}

function findConflict_(form, bookings, includePending) {
  const statuses = includePending ? ['รออนุมัติ','อนุมัติ','กำลังใช้งาน'] : ['อนุมัติ','กำลังใช้งาน'];
  const start = dateTime_(form.departDate, form.departTime);
  const end = dateTime_(form.returnDate, form.returnTime);
  if (!start || !end || end <= start) throw new Error('วันเวลาเดินทางกลับต้องอยู่หลังวันเวลาเดินทางไป');
  for (const b of bookings) {
    if (!statuses.includes(b['สถานะ'])) continue;
    const bStart = dateTime_(normalizeDate_(b['วันที่เดินทางไป']), b['เวลาออกจากโรงเรียน']);
    const bEnd = dateTime_(normalizeDate_(b['วันที่เดินทางกลับ']), b['เวลาถึงโรงเรียน']);
    if (!bStart || !bEnd) continue;
    const overlap = start < bEnd && end > bStart;
    if (overlap && form.vehicleName && form.vehicleName === b['รถที่จอง']) return 'ติดจองรถ: ' + form.vehicleName + ' ในช่วงเวลาที่เลือก กรุณาเลือกเวลา/รถอื่น หรือติดต่อแอดมิน';
    if (overlap && form.driverName && form.driverName === b['คนขับที่เลือก']) return 'ติดจองคนขับ: ' + form.driverName + ' ในช่วงเวลาที่เลือก กรุณาเลือกคนขับอื่น หรือติดต่อแอดมิน';
  }
  return '';
}

function validateBooking_(f) {
  if (!f || !f.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email))) throw new Error('กรุณากรอกอีเมลให้ถูกต้อง');
  ['prefix','firstName','lastName','phone','department','purpose','destination','province','departDate','departTime','returnDate','returnTime','vehicleName','driverName'].forEach(k => {
    if (!String(f[k] || '').trim()) throw new Error('กรุณากรอกข้อมูลให้ครบ: ' + k);
  });
  if (!/^0\d{8,9}$/.test(String(f.phone).trim())) throw new Error('เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก');
  if (!Number.isInteger(Number(f.passengers)) || Number(f.passengers) < 1) throw new Error('จำนวนผู้โดยสารไม่ถูกต้อง');
  if (f.driverName === 'ขับเอง' && !String(f.customDriver || '').trim()) throw new Error('กรุณาระบุชื่อผู้ขับรถเอง');
  const s = dateTime_(f.departDate, f.departTime), e = dateTime_(f.returnDate, f.returnTime);
  if (!s || !e || e <= s) throw new Error('วันและเวลากลับต้องอยู่หลังวันและเวลาเดินทางไป');
}

function createBookingPdf_(bookingId, form, days) {
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const template = DriveApp.getFileById(CONFIG.SLIDE_TEMPLATE_ID);
  const copy = template.makeCopy('ใบจองรถ_' + bookingId, folder);
  const presentation = SlidesApp.openById(copy.getId());
  const values = {
    '{{หมายเลขการจอง}}': bookingId,
    '{{อีเมลผู้จอง}}': form.email,
    '{{ชื่อผู้จอง}}': [form.prefix,form.firstName,form.lastName].join(' '),
    '{{เบอร์โทรผู้จอง}}': form.phone,
    '{{กลุ่มงาน}}': form.department,
    '{{วัตถุประสงค์}}': form.purpose,
    '{{สถานที่ไป}}': form.destination,
    '{{จังหวัด}}': form.province,
    '{{วันที่ไป}}': thaiDateFull_(form.departDate),
    '{{เวลาไป}}': thaiTime_(form.departTime),
    '{{วันที่กลับ}}': thaiDateFull_(form.returnDate),
    '{{เวลากลับ}}': thaiTime_(form.returnTime),
    '{{รวมวัน}}': String(days),
    '{{จำนวนผู้โดยสาร}}': String(form.passengers),
    '{{รถที่จอง}}': form.vehicleName,
    '{{คนขับ}}': form.driverName === 'ขับเอง' ? 'ขับเอง: ' + form.customDriver : form.driverName,
    '{{วันที่จัดทำ}}': thaiDateFull_(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd')),
  };
  presentation.getSlides().forEach(slide => {
    Object.keys(values).forEach(k => slide.replaceAllText(k, String(values[k] == null ? '' : values[k])));
  });
  presentation.saveAndClose();
  const pdfBlob = copy.getAs(MimeType.PDF).setName('ใบจองรถ_' + bookingId + '.pdf');
  const pdfFile = folder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // เก็บสำเนา Google Slides ไว้ในโฟลเดอร์เพื่อแก้ไขย้อนหลังได้
  copy.setDescription('ต้นฉบับใบจองที่สร้างอัตโนมัติสำหรับ ' + bookingId);
  return pdfFile.getUrl();
}

function sendBookingEmails_(id, f, days, pdfUrl) {
  const subject = '[ระบบจองรถ] รับคำขอจอง ' + id;
  const body = 'ระบบได้รับคำขอจองรถของท่านแล้ว\nหมายเลขการจอง: ' + id +
    '\nผู้จอง: ' + [f.prefix,f.firstName,f.lastName].join(' ') +
    '\nสถานที่ไป: ' + f.destination + ' จังหวัด' + f.province +
    '\nวันเดินทาง: ' + thaiDate_(f.departDate) + ' ' + f.departTime +
    '\nวันกลับ: ' + thaiDate_(f.returnDate) + ' ' + f.returnTime +
    '\nรวมวัน: ' + days + '\nรถ: ' + f.vehicleName + '\nคนขับ: ' + f.driverName +
    '\nสถานะ: รออนุมัติ' + (pdfUrl ? '\nใบจอง PDF: ' + pdfUrl : '') +
    '\n\n' + warningText_();
  sendEmail_(f.email, subject, body);
  sendEmail_(CONFIG.ADMIN_EMAILS.join(','), subject, body);
}

function sendStatusEmails_(b, status, note) {
  const subject = '[ระบบจองรถ] ' + b['หมายเลขการจอง'] + ' — ' + status;
  const body = 'มีการเปลี่ยนสถานะการจองรถ\nหมายเลขการจอง: ' + b['หมายเลขการจอง'] +
    '\nผู้จอง: ' + [b['คำนำหน้า'],b['ชื่อ'],b['นามสกุล']].filter(Boolean).join(' ') +
    '\nสถานที่ไป: ' + b['สถานที่ไป'] + '\nรถ: ' + b['รถที่จอง'] +
    '\nคนขับ: ' + b['คนขับที่เลือก'] + '\nสถานะใหม่: ' + status +
    (note ? '\nหมายเหตุ: ' + note : '') +
    (b['ลิงก์ใบจอง PDF'] ? '\nใบจอง PDF: ' + b['ลิงก์ใบจอง PDF'] : '') +
    '\n\n' + warningText_();
  const email = String(b['อีเมลผู้จอง'] || '');
  if (email) sendEmail_(email, subject, body);
  sendEmail_(CONFIG.ADMIN_EMAILS.join(','), subject, body);
}

function sendEmail_(to, subject, body) {
  if (!to) return;
  try {
    MailApp.sendEmail({to, subject, body, name:'ระบบจองรถส่วนกลาง โรงเรียนสุวรรณภูมิวิทยาลัย'});
  } catch (e) {
    audit_('ระบบ', 'ส่งอีเมลไม่สำเร็จ', '', String(e));
  }
}

function warningText_() {
  return '⚠️ ผู้ขออนุญาตใช้รถจะต้องรับผิดชอบความเสียหายที่เกิดจากการนำรถไปใช้ผิดวัตถุประสงค์ที่แจ้งและนอกเส้นทางที่ระบุ';
}

function requireAdmin_(token) {
  const actor = token ? CacheService.getScriptCache().get('sess_' + token) : null;
  if (!actor) throw new Error('เซสชันหมดอายุหรือไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่');
  return actor;
}

function requireMasterAdmin_(token) {
  const actor = requireAdmin_(token);
  if (actor !== 'admin') throw new Error('เฉพาะแอดมินหลักเท่านั้นที่จัดการบัญชีแอดมินได้');
  return actor;
}

function getSheet_(key) {
  const def = SHEETS[key];
  if (!def) throw new Error('ไม่พบชีต');
  const sh = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(def.name);
  if (!sh) throw new Error('ไม่พบชีต "' + def.name + '" กรุณารัน setupDatabase()');
  return sh;
}

function rowsAsObjects_(key) {
  const sh = getSheet_(key);
  if (sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().map(row => {
    const obj = {};
    headers.forEach((h, i) => { const v = row[i]; if (v instanceof Date) { if (h.includes('เวลา') && !h.includes('วันเวลา')) obj[h] = Utilities.formatDate(v, CONFIG.TIMEZONE, 'HH:mm'); else if (h.includes('วันเวลา') || h.includes('ล่าสุด') || h.includes('อนุมัติ') || h.includes('คืนรถ')) obj[h] = displayDateTime_(v); else obj[h] = normalizeDate_(v); } else obj[h] = v; });
    return obj;
  });
}

function audit_(actor, action, id, details) {
  try { getSheet_('audit').appendRow([new Date(), actor, action, id, details]); } catch (e) {}
}

function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + ':' + String(password), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function nextEntityId_(prefix, records, idKey) {
  let max = 0;
  records.forEach(r => {
    const m = String(r[idKey] || '').match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + String(max + 1).padStart(3, '0');
}

function dateTime_(date, time) {
  if (date == null || time == null || date === '' || time === '') return null;
  // รองรับค่า Date จากชีต, ISO yyyy-MM-dd และเวลา HH:mm / H:mm
  let dateText = date instanceof Date
    ? Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy-MM-dd')
    : String(date).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateText)) {
    const parts = dateText.split('/').map(Number); // dd/MM/yyyy
    let year = parts[2]; if (year > 2400) year -= 543;
    dateText = String(year).padStart(4,'0') + '-' + String(parts[1]).padStart(2,'0') + '-' + String(parts[0]).padStart(2,'0');
  }
  const dm = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const tm = String(time).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!dm || !tm) return null;
  const y=Number(dm[1]), mo=Number(dm[2]), day=Number(dm[3]), hh=Number(tm[1]), mm=Number(tm[2]);
  if (mo<1 || mo>12 || day<1 || day>31 || hh<0 || hh>23 || mm<0 || mm>59) return null;
  const result = new Date(y, mo-1, day, hh, mm, 0, 0);
  // ป้องกันวันที่ผิดรูปแบบที่ Date ปรับข้ามเดือนไปให้อัตโนมัติ
  if (result.getFullYear()!==y || result.getMonth()!==mo-1 || result.getDate()!==day) return null;
  return result;
}

function durationDays_(startDate, endDate) {
  const a = String(startDate).split('-').map(Number), b = String(endDate).split('-').map(Number);
  const start = Date.UTC(a[0], a[1] - 1, a[2]), end = Date.UTC(b[0], b[1] - 1, b[2]);
  return Math.floor((end - start) / 86400000) + 1;
}

function normalizeDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  return s;
}

function displayDateTime_(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
}

function thaiDateFull_(value) {
  // รูปแบบสำหรับใบจอง PDF: วันศุกร์ที่ 23 ตุลาคม พ.ศ. 2569
  let d = null;
  if (value instanceof Date) {
    d = new Date(value.getTime());
  } else {
    const s = String(value || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    else {
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        let y = Number(m[3]);
        if (y > 2400) y -= 543;
        d = new Date(y, Number(m[2]) - 1, Number(m[1]));
      }
    }
  }
  if (!d || isNaN(d.getTime())) return String(value == null ? '' : value);
  const weekdays = ['วันอาทิตย์','วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสบดี','วันศุกร์','วันเสาร์'];
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return weekdays[d.getDay()] + 'ที่ ' + d.getDate() + ' ' + months[d.getMonth()] + ' พ.ศ. ' + (d.getFullYear() + 543);
}

function thaiDate_(iso) {
  let s = String(iso || '').trim();
  if (iso instanceof Date) s = Utilities.formatDate(iso, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) { let y = Number(slash[3]); if (y < 2400) y += 543; return String(Number(slash[1])).padStart(2,'0') + '/' + String(Number(slash[2])).padStart(2,'0') + '/' + y; }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return m[3] + '/' + m[2] + '/' + (Number(m[1]) + 543);
}

function thaiTime_(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m ? String(Number(m[1])).padStart(2,'0') + '.' + m[2] + ' น.' : s;
}