# MP3 to MP4 Studio + T2S (TH/EN)

Live demo: [https://convert.kindeeyudee.com/](https://convert.kindeeyudee.com/)

---

## EN

### Overview
Full-stack project with React (Vite) + Express:
- MP3 + cover image to MP4 conversion
- YouTube queue upload
- Text-to-Speech queue with multiple engines

### Features
- Modern responsive UI (dark/light)
- Realtime queue progress
- Browser-side conversion flow
- YouTube OAuth + upload metadata (title, description, privacy, category, playlist, schedule)
- T2S with selectable model:
  - `gTTS`
  - `PiperTTS`
  - `VITS`

### Stack
- Frontend: React, Vite, Tailwind
- Backend: Express
- Media: FFmpeg / FFprobe
- YouTube: Google OAuth2 + YouTube Data API v3
- T2S: gtts + external Piper/VITS runtime support

### Local Run
```powershell
npm.cmd install
npm.cmd run install:all
npm.cmd run dev
```

Default:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

### Server `.env` (minimum)
```env
PORT=4000
HOST=0.0.0.0
CLIENT_URL=http://localhost:5173
SERVER_PUBLIC_URL=http://localhost:4000

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/youtube/callback
COOKIE_SECURE=false
```

### T2S Model Config
#### gTTS
No extra config required.

#### PiperTTS
```env
PIPER_PATH=piper
PIPER_MODEL=/absolute/path/to/model.onnx
# optional per-language mapping
# PIPER_MODEL_MAP={"th":"/models/th.onnx","en":"/models/en.onnx"}
```

#### VITS
```env
VITS_PATH=vits
VITS_MODEL=/absolute/path/to/model.pth
# optional per-language mapping
# VITS_MODEL_MAP={"th":"/models/th.pth","en":"/models/en.pth"}
# optional command args template
# VITS_ARGS=["--model","{model}","--output","{output}"]
```

`{model}`, `{output}`, `{lang}` can be used in `VITS_ARGS`.

### Production (Apache + PM2)
- Serve frontend from Apache
- Proxy `/api` to Node backend (PM2)
- Keep `.env` private
- Use HTTPS

---

## TH

### ภาพรวม
โปรเจกต์ Full-stack ด้วย React (Vite) + Express:
- แปลง MP3 + รูปปกเป็น MP4
- อัปโหลด YouTube แบบคิว
- แปลงข้อความเป็นเสียงแบบคิว พร้อมเลือกโมเดลเสียงได้

### ฟีเจอร์หลัก
- UI รองรับ Desktop/Mobile และธีมมืด/สว่าง
- แสดงความคืบหน้าคิวแบบเรียลไทม์
- รองรับ YouTube OAuth และตั้งค่า metadata ก่อนอัปโหลด
- T2S เลือกโมเดลได้ 3 แบบ:
  - `gTTS`
  - `PiperTTS`
  - `VITS`

### การรันในเครื่อง
```powershell
npm.cmd install
npm.cmd run install:all
npm.cmd run dev
```

ค่าเริ่มต้น:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

### การตั้งค่า `.env` สำหรับ T2S

#### gTTS
ไม่ต้องตั้งค่าเพิ่มเติม

#### PiperTTS
```env
PIPER_PATH=piper
PIPER_MODEL=/absolute/path/to/model.onnx
# ไม่บังคับ: แยกโมเดลตามภาษา
# PIPER_MODEL_MAP={"th":"/models/th.onnx","en":"/models/en.onnx"}
```

#### VITS
```env
VITS_PATH=vits
VITS_MODEL=/absolute/path/to/model.pth
# ไม่บังคับ: แยกโมเดลตามภาษา
# VITS_MODEL_MAP={"th":"/models/th.pth","en":"/models/en.pth"}
# ไม่บังคับ: กำหนด argument ของคำสั่งเอง
# VITS_ARGS=["--model","{model}","--output","{output}"]
```

ตัวแปรที่ใช้ใน `VITS_ARGS`:
- `{model}`
- `{output}`
- `{lang}`

### หมายเหตุ
- ถ้าเลือก Piper/VITS แล้วขึ้น error ให้ตรวจ:
  - มี binary อยู่ในเครื่องจริง
  - path ของโมเดลถูกต้อง
  - สิทธิ์อ่านไฟล์โมเดลครบ

---

## API (quick)
- `POST /api/t2s/chunk` (รองรับ `model`)
- `POST /api/t2s/synthesize` (รองรับ `model`)
- `GET /api/health`
- YouTube routes under `/api/youtube/*`
- Job routes under `/api/jobs/*`
