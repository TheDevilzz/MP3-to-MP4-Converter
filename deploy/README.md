# Production deploy: Apache + PM2 + Node.js

ชุดนี้ใช้ Apache เป็น HTTPS reverse proxy ไปยัง Node.js ที่รันด้วย PM2 บน `127.0.0.1:4000`
สำหรับโดเมน production: `convert.kindeeyudee.com`

## Server requirements

- Ubuntu/Debian server with sudo access
- Apache 2
- Node.js 20+ and npm
- PM2
- Git
- Certbot for HTTPS

## 1. Install packages

```bash
sudo apt update
sudo apt install -y apache2 git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo a2enmod proxy proxy_http headers rewrite ssl
```

## 2. Clone and build

```bash
sudo mkdir -p /var/www/mp3-to-mp4-studio
sudo chown -R "$USER":"$USER" /var/www/mp3-to-mp4-studio
git clone https://github.com/TheDevilzz/MP3-to-MP4-Converter.git /var/www/mp3-to-mp4-studio
cd /var/www/mp3-to-mp4-studio
npm install
npm run install:all
npm run build
mkdir -p server/logs
```

## 3. Production env

```bash
cp deploy/production.env.example server/.env
nano server/.env
```

Set these values to your Google OAuth credentials:

```env
CLIENT_URL=https://convert.kindeeyudee.com
SERVER_PUBLIC_URL=https://convert.kindeeyudee.com
GOOGLE_REDIRECT_URI=https://convert.kindeeyudee.com/api/youtube/callback
COOKIE_SECURE=true
HOST=127.0.0.1
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

In Google Cloud Console, add this Authorized redirect URI:

```text
https://convert.kindeeyudee.com/api/youtube/callback
```

## 4. Start Node with PM2

```bash
cd /var/www/mp3-to-mp4-studio
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

After `pm2 startup`, run the command that PM2 prints.

Check health:

```bash
curl http://127.0.0.1:4000/api/health
```

Expected: `"ok":true` and `"ffmpeg":true`

## 5. Apache vhost

Copy the vhost template:

```bash
sudo cp deploy/apache/mp3-to-mp4.conf /etc/apache2/sites-available/mp3-to-mp4.conf
sudo nano /etc/apache2/sites-available/mp3-to-mp4.conf
```

Enable site:

```bash
sudo a2ensite mp3-to-mp4.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

## 6. HTTPS

If the server does not have a certificate yet:

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d convert.kindeeyudee.com
```

## Deploy updates

```bash
cd /var/www/mp3-to-mp4-studio
git pull
npm install
npm run install:all
npm run build
pm2 reload mp3-to-mp4-studio --update-env
```

## Useful checks

```bash
pm2 status
pm2 logs mp3-to-mp4-studio
sudo tail -f /var/log/apache2/mp3-to-mp4-error.log
curl -I https://convert.kindeeyudee.com
curl https://convert.kindeeyudee.com/api/health
```

## Security checklist

- Run the app with PM2 behind Apache and set `HOST=127.0.0.1`; do not expose port `4000` publicly.
- Keep `server/.env` out of git and set permissions with `chmod 600 server/.env`.
- Use HTTPS and set `COOKIE_SECURE=true`.
- In Google Cloud Console, keep only the production redirect URI needed for this domain.
- Set `MAX_UPLOAD_MB` to the largest file size you actually want to allow.
- Keep Apache modules minimal: `proxy`, `proxy_http`, `headers`, `rewrite`, `ssl`.
- Use a non-root deploy user for daily updates after the first server bootstrap.
- Enable firewall rules that allow only SSH, HTTP, and HTTPS.
- Review logs with `pm2 logs mp3-to-mp4-studio` and Apache logs after deploy.

## What this deploy config does

- Serves the built React app and backend API from the same domain.
- Keeps API paths under `/api` without CORS complexity in production.
- Supports SSE realtime progress through Apache reverse proxy.
- Supports large upload and long conversion timeouts.
- Adds production SEO URLs for `convert.kindeeyudee.com`.
