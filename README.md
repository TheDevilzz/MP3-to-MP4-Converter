ทดลองใช้งานได้ที่ https://convert.kindeeyudee.com/

# MP3 to MP4 Studio

Full-stack React (Vite) + Express app สำหรับแปลง MP3 + cover image เป็น MP4 ใน browser ด้วย FFmpeg WebAssembly, ดาวน์โหลดไฟล์ หรือส่ง MP4 ที่แปลงเสร็จแล้วให้ backend อัปโหลดขึ้น YouTube ผ่าน Google OAuth2 + YouTube Data API v3

## ฟีเจอร์หลัก

- Frontend: React, Vite, Tailwind CSS, shadcn-style UI primitives, dark mode
- Browser conversion: FFmpeg WebAssembly แปลง MP3 + image เป็น H.264/AAC MP4 ในเครื่องผู้ใช้
- Backend: Express, Multer temp upload สำหรับ MP4 ที่แปลงแล้ว, SSE realtime YouTube upload progress
- YouTube: OAuth2 connect flow และ `videos.insert` upload
- Cleanup: download mode ไม่อัปโหลดไฟล์ขึ้น server; YouTube mode ลบ MP4 ชั่วคราวหลัง upload สำเร็จ, error หรือหมดอายุ
- Podman: มี `Containerfile` และ `podman-compose.yml`

## โครงสร้างโปรเจกต์

```text
client/                 React Vite frontend
server/                 Express backend
client/src/lib/clientFfmpeg.js Browser FFmpeg conversion
server/src/ffmpeg.js    Server-side fallback conversion + progress parser
server/src/youtube.js   Google OAuth2 + YouTube upload
Containerfile           Podman image build
podman-compose.yml      Podman Compose service
.env.example            Environment template
```

## ติดตั้งแบบ Development

ต้องมี Node.js และ npm ในเครื่องก่อน

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run install:all
npm.cmd run dev
```

เปิดเว็บที่ `http://localhost:5173` และ backend จะอยู่ที่ `http://localhost:4000`

ระบบจะ copy FFmpeg WASM assets จาก `node_modules/@ffmpeg/core` ไปที่ `client/public/ffmpeg` อัตโนมัติก่อน `dev` และ `build`

ถ้าต้องการตรวจ FFmpeg ฝั่ง backend fallback:

```powershell
ffmpeg -version
ffprobe -version
```

ถ้าต้องการติดตั้ง FFmpeg ลง Windows โดยตรงสำหรับ server-side fallback:

```powershell
winget install Gyan.FFmpeg
```

## ตั้งค่า Google OAuth และ YouTube

1. ไปที่ Google Cloud Console
2. สร้าง Project หรือเลือก Project เดิม
3. Enable `YouTube Data API v3`
4. สร้าง OAuth Client ID ชนิด `Web application`
5. เพิ่ม Authorized redirect URI:

```text
http://localhost:4000/api/youtube/callback
```

6. ใส่ค่าใน `.env`

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/youtube/callback
```

ถ้า OAuth app ยังอยู่ใน Testing ให้เพิ่มอีเมลของคุณเป็น Test user ก่อนใช้งานปุ่ม Connect YouTube

## วิธีทำไฟล์ Podman และติดตั้ง

โปรเจกต์นี้เตรียมไฟล์ไว้แล้ว:

- `Containerfile`: build frontend, install backend production deps, install FFmpeg ใน runtime image
- `podman-compose.yml`: เปิด service ที่ port `4000` และโหลด env จาก `.env`
- `.containerignore`: ตัด `node_modules`, build output และไฟล์ไม่จำเป็นออกจาก image context

ติดตั้ง Podman บน Windows:

```powershell
winget install RedHat.Podman
podman machine init
podman machine start
podman --version
```

Build และ run ด้วยคำสั่งตรง:

```powershell
Copy-Item .env.example .env
podman build -t mp3-to-mp4-youtube .
podman run --rm -p 4000:4000 --env-file .env mp3-to-mp4-youtube
```

หรือใช้ compose:

```powershell
Copy-Item .env.example .env
podman compose up --build
```

เปิดเว็บที่ `http://localhost:4000`

สำหรับ Podman ให้ตั้งค่า OAuth redirect URI เป็น:

```text
http://localhost:4000/api/youtube/callback
```

และใน `.env` แนะนำให้ใช้:

```env
CLIENT_URL=http://localhost:4000
SERVER_PUBLIC_URL=http://localhost:4000
GOOGLE_REDIRECT_URI=http://localhost:4000/api/youtube/callback
```

## Environment สำคัญ

```env
MAX_UPLOAD_MB=250
VIDEO_WIDTH=1280
VIDEO_HEIGHT=720
VIDEO_CRF=30
FFMPEG_PRESET=veryfast
AUDIO_BITRATE=192k
```

ค่าเริ่มต้นเน้นไฟล์เล็กและแปลงเร็วสำหรับภาพนิ่ง + audio คุณภาพดี ถ้าต้องการคุณภาพภาพสูงขึ้นให้ลด `VIDEO_CRF` เช่น `26` แต่ไฟล์จะใหญ่ขึ้น

## API โดยย่อ

- `GET /api/health`
- `GET /api/youtube/status`
- `GET /api/youtube/auth-url`
- `GET /api/youtube/callback`
- `POST /api/jobs` server-side fallback multipart fields: `mp3`, `image`, `mode`, `title`, `description`, `privacyStatus`
- `POST /api/jobs/client-youtube` multipart fields: `video`, `title`, `description`, `privacyStatus`
- `GET /api/jobs/:id/events` SSE realtime progress
- `GET /api/jobs/:id/download`

## หมายเหตุด้าน production

ตัวอย่างนี้เก็บ OAuth token ใน memory session เพื่อไม่เขียนข้อมูลถาวรลง server ถ้าจะใช้ production หลาย instance ควรเปลี่ยนเป็น encrypted session store ภายนอก และเปิด HTTPS พร้อม `COOKIE_SECURE=true`

Client-side conversion ใช้ RAM/CPU ของ browser ผู้ใช้ ไฟล์ใหญ่มากอาจช้าหรือ memory ไม่พอบนมือถือ แนะนำจำกัดขนาดไฟล์และแสดงคำเตือนใน production
