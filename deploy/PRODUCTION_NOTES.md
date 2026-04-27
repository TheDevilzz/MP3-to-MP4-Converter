# Production notes for convert.kindeeyudee.com

## What changed in this deployment prep

- Production SEO now points to `https://convert.kindeeyudee.com/`.
- Google Search Console verification meta tag was added to `client/index.html`.
- `robots.txt` and `sitemap.xml` now point to the production domain.
- Apache reverse proxy config was added for `convert.kindeeyudee.com`.
- PM2 config was added for the Node.js backend on port `4000`.
- Production env template was added for same-domain `/api` routing.

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
