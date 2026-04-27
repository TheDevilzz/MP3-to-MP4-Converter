# MP3 to MP4 Studio Usage Guide (EN/TH)

## English

### What is new in this version

- Multi-item queue conversion
- Ordered processing (first to last)
- Per-item YouTube metadata (title, description, privacy)
- In-app `Docs` page
- In-app `Donate` page with PromptPay QR

### Basic workflow

1. Open the Studio page.
2. Add one MP3 file and one cover image.
3. Select destination mode:
   - `Download`
   - `YouTube`
4. If `YouTube` mode:
   - Connect YouTube account/channel.
   - Set item title, description, and privacy.
5. Click `Add Item to Queue`.
6. Repeat for more items.
7. Reorder queue using Up/Down controls.
8. Click `Start Queue`.

### Queue behavior

- Items run one by one in queue order.
- Each item has its own status and progress.
- Download items produce a direct MP4 download link.
- YouTube items upload to the selected channel.
- Failed items stay marked as `error` for inspection.

### YouTube upload details

- Browser performs MP3+image conversion.
- Converted MP4 is uploaded to backend in chunks.
- Backend assembles temporary MP4, uploads to YouTube, then cleans temporary files.
- Realtime status is displayed in the progress panel.

### Tips

- Keep the tab open while queue is running.
- Large files may take longer during browser conversion.
- Use shorter, clear titles per queue item to keep uploads organized.

## ภาษาไทย

### ฟีเจอร์ใหม่ในเวอร์ชันนี้

- รองรับการแปลงแบบคิวหลายรายการ
- รองรับการเรียงลำดับก่อนหลังในการประมวลผล
- ตั้งค่า YouTube แยกรายการได้ (ชื่อ, คำอธิบาย, สถานะการมองเห็น)
- มีหน้า `Docs` ภายในแอป
- มีหน้า `Donate` พร้อม QR PromptPay

### ขั้นตอนใช้งานหลัก

1. เปิดหน้า Studio
2. เพิ่มไฟล์ MP3 1 ไฟล์ และรูปปก 1 รูป
3. เลือกปลายทาง:
   - `Download`
   - `YouTube`
4. หากเลือก `YouTube`:
   - เชื่อมต่อบัญชี/ช่อง YouTube
   - ตั้งชื่อคลิป, คำอธิบาย และสถานะการมองเห็นของรายการนั้น
5. กด `Add Item to Queue`
6. ทำซ้ำเพื่อเพิ่มรายการอื่น
7. จัดลำดับคิวด้วยปุ่มขึ้น/ลง
8. กด `Start Queue`

### พฤติกรรมของคิว

- ระบบรันทีละรายการตามลำดับในคิว
- แต่ละรายการมีสถานะและความคืบหน้าแยกกัน
- รายการแบบ Download จะมีลิงก์ดาวน์โหลด MP4
- รายการแบบ YouTube จะอัปโหลดไปยังช่องที่เชื่อมต่อไว้
- หากรายการผิดพลาดจะถูกทำเครื่องหมายเป็น `error`

### รายละเอียดการอัปโหลด YouTube

- การแปลง MP3 + รูปปกทำบนเบราว์เซอร์
- MP4 ที่แปลงเสร็จจะถูกส่งไป backend แบบ chunk
- Backend ประกอบไฟล์ชั่วคราว อัปโหลดขึ้น YouTube แล้วลบไฟล์ชั่วคราว
- มีการแสดงสถานะแบบ realtime ในแผง progress

### คำแนะนำ

- ระหว่างรันคิวให้เปิดแท็บไว้ตลอด
- ไฟล์ขนาดใหญ่อาจใช้เวลาแปลงนานขึ้น
- ตั้งชื่อแต่ละรายการให้ชัดเจนเพื่อจัดการงานง่ายขึ้น
