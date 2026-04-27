import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const defaultPort = Number(process.env.PORT || 4000);
const serverPublicUrl =
  process.env.SERVER_PUBLIC_URL || `http://localhost:${defaultPort}`;
const bundledFfmpegPath = ffmpegStatic || 'ffmpeg';
const bundledFfprobePath = ffprobeStatic?.path || 'ffprobe';

export const config = {
  port: defaultPort,
  host: process.env.HOST || '0.0.0.0',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  serverPublicUrl,
  clientDistDir:
    process.env.CLIENT_DIST_DIR || path.resolve(serverRoot, '..', 'client', 'dist'),
  tempRoot:
    process.env.TEMP_DIR || path.join(os.tmpdir(), 'mp3-to-mp4-converter'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 250),
  clientYoutubeMaxUploadMb: Number(process.env.CLIENT_YOUTUBE_MAX_UPLOAD_MB || 2048),
  maxJobAgeMs: Number(process.env.MAX_JOB_AGE_MS || 1000 * 60 * 60),
  ffmpegPath: process.env.FFMPEG_PATH || bundledFfmpegPath,
  ffprobePath: process.env.FFPROBE_PATH || bundledFfprobePath,
  videoWidth: Number(process.env.VIDEO_WIDTH || 1280),
  videoHeight: Number(process.env.VIDEO_HEIGHT || 720),
  videoCrf: Number(process.env.VIDEO_CRF || 30),
  ffmpegPreset: process.env.FFMPEG_PRESET || 'veryfast',
  audioBitrate: process.env.AUDIO_BITRATE || '192k',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ||
    `${serverPublicUrl}/api/youtube/callback`,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};

export const youtubeScopes = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];
