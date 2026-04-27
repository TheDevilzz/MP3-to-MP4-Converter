# Production notes for convert.kindeeyudee.com

## What changed in this deployment prep

- Production SEO now points to `https://convert.kindeeyudee.com/`.
- Google Search Console verification meta tag was added to `client/index.html`.
- `robots.txt` and `sitemap.xml` now point to the production domain.
- Apache reverse proxy config was added for `convert.kindeeyudee.com`.
- PM2 config was added for the Node.js backend on port `4000`.
- Production env template was added for same-domain `/api` routing.
- Backend can bind to `HOST=127.0.0.1` so Node.js stays behind Apache in production.

## Deployment performed

Date: 2026-04-27

Server:

```text
root@80.209.226.158
Ubuntu 24.04.3 LTS
Domain: convert.kindeeyudee.com
```

Paths:

```text
Frontend web root: /var/www/convert
Backend app root:  /var/www/server/mp3
Release clone:     /var/www/convert-release
Backups:           /var/backups/convert-deploy
Apache vhost:      /etc/apache2/sites-available/002-Convert.conf
PM2 process:       convert
```

Actions completed:

- Pulled the latest repository from GitHub.
- Installed dependencies and built the Vite frontend.
- Deployed `client/dist` to `/var/www/convert`.
- Deployed backend source to `/var/www/server/mp3` while preserving `server/.env`.
- Reinstalled backend `node_modules` on Ubuntu so `ffmpeg-static` uses the Linux binary instead of the old Windows `ffmpeg.exe`.
- Updated production env values for same-domain API and OAuth callback.
- Replaced the Apache vhost with a static frontend + `/api` reverse proxy setup.
- Disabled the duplicate `API.conf` vhost for the same domain.
- Restarted PM2 process `convert`.
- Enabled PM2 startup under systemd.

## Production routing

The frontend and API should be served from the same domain:

```text
https://convert.kindeeyudee.com/
https://convert.kindeeyudee.com/api/health
https://convert.kindeeyudee.com/api/youtube/callback
```

In production, the client uses `window.location.origin` for API calls, so `/api` stays on the same domain and avoids CORS issues.

## Security checks to run after server access is available

```bash
whoami
hostnamectl
sudo ufw status verbose
sudo ss -tulpn
sudo apache2ctl -M
sudo apache2ctl configtest
pm2 status
curl -I https://convert.kindeeyudee.com
curl https://convert.kindeeyudee.com/api/health
```

Expected server exposure:

- Public: `22/tcp`, `80/tcp`, `443/tcp`
- Local only: Node.js app on `127.0.0.1:4000`

Current observed exposure after deploy:

- Public: `22/tcp`, `80/tcp`
- Local only: `127.0.0.1:4000`
- HTTPS is handled by Cloudflare in front of the origin.

## Verified after deploy

```text
https://convert.kindeeyudee.com/              200
https://convert.kindeeyudee.com/api/health   200
https://convert.kindeeyudee.com/api/youtube/status 200
https://convert.kindeeyudee.com/sitemap.xml  200
```

Health result:

```json
{
  "ok": true,
  "ffmpeg": true,
  "youtubeConfigured": true,
  "tempRoot": "/var/tmp/mp3-to-mp4-converter"
}
```

SEO verification:

- Google verification meta tag is present in production HTML.
- Canonical URL points to `https://convert.kindeeyudee.com/`.
- Sitemap points to `https://convert.kindeeyudee.com/`.

## Security findings

Found on server:

```text
PermitRootLogin yes
PasswordAuthentication yes
No ufw command installed
```

Completed:

- Node.js no longer listens publicly on `*:4000`; it listens on `127.0.0.1:4000`.
- Duplicate Apache vhost for `convert.kindeeyudee.com` was disabled.
- `server/.env` is set to `600`.
- Apache directory listing is disabled for `/var/www/convert`.

Recommended next hardening:

- Create a non-root deploy user with sudo access.
- Move SSH access to key-only login.
- Set `PasswordAuthentication no` after confirming key login works.
- Set `PermitRootLogin prohibit-password` or disable direct root login after creating a deploy user.
- Install and enable a firewall allowing only SSH and HTTP from the origin side, for example `ufw allow OpenSSH` and `ufw allow 80/tcp`.
- If Cloudflare is the only public entry, restrict origin HTTP to Cloudflare IP ranges at the firewall or provider firewall.
- Remove the temporary deploy SSH key from `/root/.ssh/authorized_keys` after deployment access is no longer needed.

## Google OAuth production callback

Add this URI in Google Cloud Console:

```text
https://convert.kindeeyudee.com/api/youtube/callback
```

Use these production env values:

```env
CLIENT_URL=https://convert.kindeeyudee.com
SERVER_PUBLIC_URL=https://convert.kindeeyudee.com
GOOGLE_REDIRECT_URI=https://convert.kindeeyudee.com/api/youtube/callback
COOKIE_SECURE=true
HOST=127.0.0.1
```
