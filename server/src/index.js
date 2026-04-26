import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { config } from './config.js';
import { assertFfmpegAvailable, convertMp3ToMp4, fileExists } from './ffmpeg.js';
import {
  cleanupAndForgetJob,
  cleanupJobFiles,
  createJob,
  getJob,
  getPublicJob,
  patchJob,
  subscribeJob,
  sweepStaleJobs,
} from './jobs.js';
import {
  completeYoutubeOAuth,
  createYoutubeAuthUrl,
  disconnectYoutubeSession,
  getYoutubeSession,
  getYoutubeSessionById,
  isYoutubeConfigured,
  publicYoutubeSession,
  uploadVideoToYoutube,
  youtubeSessionCookie,
} from './youtube.js';

const app = express();

await fs.mkdir(config.tempRoot, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        if (!req.uploadDir) {
          req.uploadId = randomUUID();
          req.uploadDir = path.join(config.tempRoot, req.uploadId);
          await fs.mkdir(req.uploadDir, { recursive: true });
        }
        cb(null, req.uploadDir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (_req, file, cb) => {
      const ext = safeExtension(file.originalname, file.mimetype);
      cb(null, `${file.fieldname}${ext}`);
    },
  }),
  limits: {
    fileSize: config.maxUploadMb * 1024 * 1024,
    files: 2,
  },
  fileFilter: (_req, file, cb) => {
    const isAudio = file.fieldname === 'mp3' && file.mimetype.includes('audio');
    const isImage = file.fieldname === 'image' && file.mimetype.includes('image');
    cb(null, isAudio || isImage);
  },
});

app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await assertFfmpegAvailable();
    res.json({
      ok: true,
      ffmpeg: true,
      youtubeConfigured: isYoutubeConfigured(),
      tempRoot: config.tempRoot,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      ffmpeg: false,
      youtubeConfigured: isYoutubeConfigured(),
      error: error.message,
    });
  }
});

app.get('/api/youtube/status', (req, res) => {
  const session = getYoutubeSession(req);
  res.json({
    configured: isYoutubeConfigured(),
    connected: Boolean(session),
    channel: publicYoutubeSession(session)?.channel || null,
  });
});

app.get('/api/youtube/auth-url', (_req, res) => {
  try {
    const { url } = createYoutubeAuthUrl();
    res.json({ url });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get('/api/youtube/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) throw new Error('Missing OAuth code or state.');

    const sessionId = await completeYoutubeOAuth({ code, state });
    res.cookie(youtubeSessionCookie, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.redirect(`${config.clientUrl}/?youtube=connected`);
  } catch (error) {
    res.redirect(
      `${config.clientUrl}/?youtube=error&message=${encodeURIComponent(
        error.message,
      )}`,
    );
  }
});

app.post('/api/youtube/disconnect', (req, res) => {
  disconnectYoutubeSession(req, res);
  res.json({ connected: false });
});

app.post('/api/jobs', upload.fields([{ name: 'mp3', maxCount: 1 }, { name: 'image', maxCount: 1 }]), async (req, res, next) => {
  try {
    const body = req.body || {};
    const audio = req.files?.mp3?.[0];
    const image = req.files?.image?.[0];
    const mode = body.mode === 'youtube' ? 'youtube' : 'download';
    const title = String(body.title || 'Converted MP3 Video').trim();
    const description = String(body.description || '').trim();
    const privacyStatus = String(body.privacyStatus || 'private');

    if (!audio || !image) {
      await cleanupUploadDir(req.uploadDir);
      return res.status(400).json({ error: 'Please upload both MP3 and cover image.' });
    }

    let youtubeSessionId = null;
    if (mode === 'youtube') {
      const session = getYoutubeSession(req);
      if (!session) {
        await cleanupUploadDir(req.uploadDir);
        return res.status(401).json({ error: 'Connect YouTube before uploading.' });
      }
      youtubeSessionId = session.id;
    }

    const outputPath = path.join(req.uploadDir, 'output.mp4');
    const job = createJob({
      dir: req.uploadDir,
      audioPath: audio.path,
      imagePath: image.path,
      outputPath,
      mode,
      title,
      description,
      privacyStatus,
      youtubeSessionId,
      downloadUrl: null,
      youtubeUrl: null,
      youtubeVideoId: null,
      outputBytes: null,
    });

    res.status(202).json({
      jobId: job.id,
      eventUrl: `/api/jobs/${job.id}/events`,
      statusUrl: `/api/jobs/${job.id}`,
    });

    setImmediate(() => {
      processJob(job.id).catch((error) => {
        patchJob(job.id, {
          status: 'error',
          stage: 'error',
          error: error.message,
          message: 'The job failed.',
        });
        cleanupJobFiles(job.id).catch(() => {});
      });
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getPublicJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json(job);
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (payload) => {
    res.write(`event: job\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const unsubscribe = subscribeJob(req.params.id, send);
  const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.get('/api/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.mode !== 'download') {
    return res.status(404).json({ error: 'Download is not available.' });
  }

  if (job.status !== 'completed' || !job.outputPath || !fileExists(job.outputPath)) {
    return res.status(409).json({ error: 'The MP4 is not ready yet.' });
  }

  const filename = `${slugify(job.title || 'converted-mp3-video')}.mp4`;
  res.download(job.outputPath, filename, async (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ error: error.message });
      return;
    }
    await cleanupAndForgetJob(job.id);
  });
});

if (await pathExists(config.clientDistDir)) {
  app.use(express.static(config.clientDistDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(config.clientDistDir, 'index.html'));
  });
}

app.use(async (error, req, res, _next) => {
  await cleanupUploadDir(req.uploadDir);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

setInterval(() => {
  sweepStaleJobs().catch(() => {});
}, 1000 * 60 * 10).unref();

app.listen(config.port, () => {
  console.log(`Server listening on ${config.serverPublicUrl}`);
});

async function processJob(id) {
  const job = getJob(id);
  if (!job) return;

  patchJob(id, {
    status: 'running',
    stage: 'converting',
    message: 'Converting MP3 and cover image into MP4.',
    convertProgress: 0,
    progress: 0,
  });

  const output = await convertMp3ToMp4(
    {
      audioPath: job.audioPath,
      imagePath: job.imagePath,
      outputPath: job.outputPath,
    },
    (percent) => {
      patchJob(id, {
        stage: 'converting',
        convertProgress: percent,
        progress: job.mode === 'youtube' ? Math.round(percent * 0.62) : percent,
        message: `Converting ${percent}%`,
      });
    },
  );

  patchJob(id, {
    outputBytes: output.size,
    convertProgress: 100,
    progress: job.mode === 'youtube' ? 65 : 100,
    message: 'MP4 compression completed.',
  });

  if (job.mode === 'youtube') {
    const session = getYoutubeSessionById(job.youtubeSessionId);
    if (!session) throw new Error('YouTube session expired. Please connect again.');

    patchJob(id, {
      stage: 'uploading',
      message: 'Uploading to YouTube.',
      uploadProgress: 0,
      progress: 65,
    });

    const result = await uploadVideoToYoutube({
      session,
      filePath: job.outputPath,
      title: job.title,
      description: job.description,
      privacyStatus: job.privacyStatus,
      onProgress: (percent) => {
        patchJob(id, {
          stage: 'uploading',
          uploadProgress: percent,
          progress: Math.min(99, 65 + Math.round(percent * 0.35)),
          message: `Uploading ${percent}%`,
        });
      },
    });

    await cleanupJobFiles(id);
    patchJob(id, {
      status: 'completed',
      stage: 'uploaded',
      progress: 100,
      uploadProgress: 100,
      youtubeVideoId: result.videoId,
      youtubeUrl: result.url,
      message: 'Uploaded to YouTube and temporary files were cleaned.',
    });
    return;
  }

  patchJob(id, {
    status: 'completed',
    stage: 'ready',
    progress: 100,
    downloadUrl: `/api/jobs/${id}/download`,
    message: 'Your MP4 is ready to download.',
  });
}

function safeExtension(filename, mimeType) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext && ext.length <= 8) return ext;
  if (mimeType.includes('mpeg')) return '.mp3';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  return '.jpg';
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'converted-mp3-video';
}

async function cleanupUploadDir(dir) {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
