# MP3 to MP4 Studio + T2S (TH/EN)

Live / ทดลองใช้งาน: [https://convert.kindeeyudee.com/](https://convert.kindeeyudee.com/)

Full-stack app with React (Vite) + Express for:
- MP3 + cover image to MP4
- YouTube upload queue
- Text-to-Speech (gTTS)

แอป Full-stack React (Vite) + Express สำหรับ:
- แปลง MP3 + รูปปก เป็น MP4
- คิวอัปโหลด YouTube
- แปลงข้อความเป็นเสียง (gTTS)

---

## Features / ฟีเจอร์

## MP3 to MP4 Studio
- Modern dark UI (Tailwind + shadcn-style components)  
  UI โทนมืดสมัยใหม่ (Tailwind + shadcn-style)
- Drag/drop file input  
  รองรับลากวางไฟล์
- Browser conversion with FFmpeg WASM  
  แปลงบนเบราว์เซอร์ด้วย FFmpeg WASM
- Download mode (no permanent media storage on server)  
  โหมดดาวน์โหลด (ไม่เก็บไฟล์ถาวรบนเซิร์ฟเวอร์)
- YouTube mode:
  - OAuth connect / เชื่อมต่อ OAuth
  - Title, description, privacy / ตั้งค่า title, description, privacy
  - Category / หมวดหมู่
  - Schedule publish / ตั้งเวลาเผยแพร่
  - Optional playlist / เลือกเพลย์ลิสต์ (ไม่บังคับ)

Queue behavior / พฤติกรรมคิว:
- Conversion runs in parallel / แปลงหลายรายการพร้อมกัน
- YouTube uploads run one-by-one in queue order / อัปโหลด YouTube ทีละรายการตามลำดับคิว

## T2S (Text-to-Speech)
- Uses `gtts` (Google Translate TTS style voice)  
  ใช้ `gtts` (เสียงแนว Google Translate TTS)
- Input:
  - Type/paste text / พิมพ์หรือวางข้อความ
  - Upload many `.txt` files / อัปโหลด `.txt` ได้หลายไฟล์
- Per-item output filename / ตั้งชื่อไฟล์ output ต่อรายการ
- Speed slider up to `3.0x` / ปรับความเร็วสูงสุด `3.0x`
- Queue processing in client / ประมวลผลคิวฝั่ง client
- Server returns chunk audio in memory (no permanent storage)  
  เซิร์ฟเวอร์ส่งเสียงเป็น chunk ในหน่วยความจำ (ไม่เก็บถาวร)

Current speed logic / logic ความเร็วปัจจุบัน:
- `speed <= 1.10` -> return raw segment mp3  
  `speed <= 1.10` -> ส่ง mp3 ย่อยตรงๆ
- `speed > 1.10` -> process each segment with FFmpeg `atempo`  
  `speed > 1.10` -> เข้า FFmpeg `atempo` ต่อก้อน

---

## Tech Stack

- Frontend: React 19, Vite, Tailwind CSS
- Backend: Express 5
- Media:
  - Browser conversion: `@ffmpeg/ffmpeg`
  - Server conversion: `ffmpeg-static`, `ffprobe-static`
- YouTube: `googleapis`
- T2S: `gtts`

---

## Project Structure / โครงสร้างโปรเจกต์

```text
client/
  src/
    App.jsx
    components/
      T2SPanel.jsx
    lib/
      clientFfmpeg.js

server/
  src/
    index.js
    ffmpeg.js
    youtube.js
    t2s.js
    jobs.js

deploy/
  README.md
  PRODUCTION_NOTES.md
  apache/
```

---

## Local Development / การรันในเครื่อง

Requirements / สิ่งที่ต้องมี:
- Node.js 20+
- npm

Install & run:

```powershell
npm.cmd install
npm.cmd run install:all
npm.cmd run dev
```

Default URLs:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

---

## Environment Variables / ตัวแปรแวดล้อม

Create `server/.env` and set values:

```env
PORT=4000
HOST=0.0.0.0
CLIENT_URL=http://localhost:5173
SERVER_PUBLIC_URL=http://localhost:4000

MAX_UPLOAD_MB=250
CLIENT_YOUTUBE_MAX_UPLOAD_MB=2048

VIDEO_WIDTH=1280
VIDEO_HEIGHT=720
VIDEO_CRF=30
FFMPEG_PRESET=veryfast
AUDIO_BITRATE=192k

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/youtube/callback
COOKIE_SECURE=false
```

---

## Google OAuth + YouTube Setup

1. Open Google Cloud Console / เปิด Google Cloud Console
2. Enable **YouTube Data API v3** / เปิดใช้ **YouTube Data API v3**
3. Create OAuth client (Web application) / สร้าง OAuth client แบบ Web application
4. Add redirect URI:
   - Local: `http://localhost:4000/api/youtube/callback`
   - Production: `https://convert.kindeeyudee.com/api/youtube/callback`
5. Put credentials in `server/.env` / ใส่ credentials ใน `server/.env`

If app is in testing mode, add your Google account as test user.  
ถ้าแอปยังอยู่โหมดทดสอบ ให้เพิ่มบัญชี Google ของคุณเป็น test user

---

## API Overview / ภาพรวม API

Health:
- `GET /api/health`

YouTube:
- `GET /api/youtube/status`
- `GET /api/youtube/auth-url`
- `GET /api/youtube/callback`
- `POST /api/youtube/disconnect`
- `GET /api/youtube/playlists`

Jobs:
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events` (SSE)
- `GET /api/jobs/:id/download`

Client YouTube upload flow:
- `POST /api/jobs/client-youtube/uploads`
- `PUT /api/jobs/client-youtube/uploads/:uploadId/chunks`
- `POST /api/jobs/client-youtube/uploads/:uploadId/complete`

T2S:
- `POST /api/t2s/chunk`
- `POST /api/t2s/synthesize` (available in backend)

---

## Podman

Build:

```powershell
podman build -t mp3-to-mp4-youtube .
```

Run:

```powershell
podman run --rm -p 4000:4000 --env-file server/.env mp3-to-mp4-youtube
```

Compose:

```powershell
podman compose up --build
```

---

## Production Notes / หมายเหตุสำหรับ Production

- Apache serves frontend and proxies `/api` to Node (PM2).  
  Apache เสิร์ฟ frontend และ proxy `/api` ไป Node (PM2)
- Same domain for frontend + API.  
  ใช้โดเมนเดียวกันสำหรับ frontend + API
- Keep `.env` private and enable HTTPS.  
  เก็บ `.env` เป็นความลับและเปิด HTTPS

Detailed docs:
- `deploy/README.md`
- `deploy/PRODUCTION_NOTES.md`

---

## Known Constraints / ข้อจำกัด

- `gtts` is not Google Cloud Neural2/Wavenet.  
  `gtts` ไม่ใช่ Google Cloud Neural2/Wavenet
- Large text/audio jobs may still be limited by browser memory/network.  
  งานข้อความ/เสียงขนาดใหญ่ยังขึ้นกับหน่วยความจำเบราว์เซอร์และเครือข่าย
