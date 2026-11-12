/**
 * SKY38 — save Daily Report / Daily Request files to Google Drive.
 * Deploy: Deploy → New deployment → type "Web app"
 *         Execute as: Me   ·   Who has access: Anyone
 * Then put the Web app URL in Vercel as DRIVE_URL and the TOKEN below as DRIVE_TOKEN.
 */
const TOKEN = 'sky38-change-this-word';      // ← เปลี่ยนเป็นคำลับของคุณ แล้วใส่คำเดียวกันใน Vercel (DRIVE_TOKEN)
const ROOT_FOLDER_NAME = 'SKY38 Reports';    // โฟลเดอร์หลักใน My Drive (สร้างให้อัตโนมัติ)

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) return out({ ok: false, error: 'bad_token' });

    const root = getOrCreate(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const kind = getOrCreate(root, data.kind === 'Daily Request' ? 'Daily Request' : 'Daily Report');
    const month = getOrCreate(kind, Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM'));

    (data.files || []).forEach(function (f) {
      const name = String(f.filename || 'file');
      // ส่งซ้ำ (ฉบับแก้ไข) → ย้ายไฟล์ชื่อเดิมไปถังขยะ แล้วเก็บไฟล์ล่าสุด
      const old = month.getFilesByName(name);
      while (old.hasNext()) old.next().setTrashed(true);
      const mime = /\.pdf$/i.test(name)
        ? MimeType.PDF
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      month.createFile(Utilities.newBlob(Utilities.base64Decode(f.content), mime, name));
    });

    return out({ ok: true, folderUrl: month.getUrl() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function getOrCreate(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
