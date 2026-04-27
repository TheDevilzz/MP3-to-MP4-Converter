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
const clientYoutubeChunkBytes = 8 * 1024 * 1024;
const clientYoutubeChunkLimit = '10mb';

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
    const isVideo = file.fieldname === 'video' && file.mimetype.includes('video');
    cb(null, isAudio || isImage || isVideo);
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
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      throw new Error(String(errorDescription || error));
    }
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

app.post('/api/jobs/client-youtube/uploads', async (req, res, next) => {
  try {
    const session = getYoutubeSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Connect YouTube before uploading.' });
    }

    const body = req.body || {};
    const fileSize = Number(body.fileSize || 0);
    const maxBytes = config.maxUploadMb * 1024 * 1024;
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return res.status(400).json({ error: 'Invalid converted MP4 size.' });
    }
    if (fileSize > maxBytes) {
      return res.status(413).json({
        error: `Converted MP4 is larger than the ${config.maxUploadMb}MB server limit.`,
      });
    }

    const uploadId = randomUUID();
    const uploadDir = uploadDirForId(uploadId);
    await fs.mkdir(uploadDir, { recursive: true });
    await writeClientUploadMetadata(uploadId, {
      uploadId,
      youtubeSessionId: session.id,
      title: String(body.title || 'Converted MP3 Video').trim(),
      description: String(body.description || '').trim(),
      privacyStatus: String(body.privacyStatus || 'private'),
      categoryId: normalizeCategoryId(body.categoryId),
      publishAt: normalizePublishAt(body.scheduleEnabled, body.scheduledAt),
      fileName: String(body.fileName || 'converted-mp3-video.mp4'),
      fileSize,
      receivedBytes: 0,
      chunks: 0,
      createdAt: Date.now(),
    });

    res.status(201).json({ uploadId, chunkBytes: clientYoutubeChunkBytes });
  } catch (error) {
    next(error);
  }
});

app.put(
  '/api/jobs/client-youtube/uploads/:uploadId/chunks',
  express.raw({ type: 'application/octet-stream', limit: clientYoutubeChunkLimit }),
  async (req, res, next) => {
    try {
      const { uploadId } = req.params;
      const metadata = await readClientUploadMetadata(uploadId);
      const session = getYoutubeSession(req);
      if (!session || session.id !== metadata.youtubeSessionId) {
        await cleanupUploadDir(uploadDirForId(uploadId));
        return res.status(401).json({ error: 'YouTube session expired. Please connect again.' });
      }

      const chunk = Buffer.isBuffer(req.body) ? req.body : null;
      if (!chunk?.length) {
        return res.status(400).json({ error: 'Missing MP4 chunk.' });
      }
      if (chunk.length > clientYoutubeChunkBytes) {
        return res.status(413).json({ error: 'MP4 chunk is too large.' });
      }

      const range = parseContentRange(req.get('content-range'));
      if (
        !range ||
        range.total !== metadata.fileSize ||
        range.start !== metadata.receivedBytes ||
        range.end - range.start + 1 !== chunk.length
      ) {
        return res.status(409).json({ error: 'MP4 chunks arrived out of order.' });
      }

      const videoPath = path.join(uploadDirForId(uploadId), 'video.mp4');
      const handle = await fs.open(videoPath, 'a');
      try {
        await handle.writeFile(chunk);
      } finally {
        await handle.close();
      }

      metadata.receivedBytes += chunk.length;
      metadata.chunks += 1;
      await writeClientUploadMetadata(uploadId, metadata);

      res.json({
        receivedBytes: metadata.receivedBytes,
        percent: Math.round((metadata.receivedBytes / metadata.fileSize) * 100),
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post('/api/jobs/client-youtube/uploads/:uploadId/complete', async (req, res, next) => {
  try {
    const { uploadId } = req.params;
    const metadata = await readClientUploadMetadata(uploadId);
    const session = getYoutubeSession(req);
    if (!session || session.id !== metadata.youtubeSessionId) {
      await cleanupUploadDir(uploadDirForId(uploadId));
      return res.status(401).json({ error: 'YouTube session expired. Please connect again.' });
    }

    const uploadDir = uploadDirForId(uploadId);
    const videoPath = path.join(uploadDir, 'video.mp4');
    const videoStat = await fs.stat(videoPath);
    if (videoStat.size !== metadata.fileSize || metadata.receivedBytes !== metadata.fileSize) {
      return res.status(409).json({ error: 'The converted MP4 upload is incomplete.' });
    }

    const job = createJob({
      dir: uploadDir,
      audioPath: null,
      imagePath: null,
      outputPath: videoPath,
      mode: 'youtube',
      title: metadata.title,
      description: metadata.description,
      privacyStatus: metadata.privacyStatus,
      categoryId: metadata.categoryId,
      publishAt: metadata.publishAt,
      youtubeSessionId: metadata.youtubeSessionId,
      downloadUrl: null,
      youtubeUrl: null,
      youtubeVideoId: null,
      outputBytes: videoStat.size,
      convertProgress: 100,
      uploadProgress: 0,
      progress: 82,
      status: 'queued',
      stage: 'uploading',
      message: 'Converted MP4 received. Queued for YouTube upload.',
    });

    res.status(202).json({
      jobId: job.id,
      eventUrl: `/api/jobs/${job.id}/events`,
      statusUrl: `/api/jobs/${job.id}`,
    });

    setImmediate(() => {
      processClientYoutubeJob(job.id).catch((error) => {
        patchJob(job.id, {
          status: 'error',
          stage: 'error',
          error: error.message,
          message: 'The YouTube upload failed.',
        });
        cleanupJobFiles(job.id).catch(() => {});
      });
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/jobs/client-youtube', upload.single('video'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const video = req.file;
    const session = getYoutubeSession(req);
    const title = String(body.title || 'Converted MP3 Video').trim();
    const description = String(body.description || '').trim();
    const privacyStatus = String(body.privacyStatus || 'private');
    const categoryId = normalizeCategoryId(body.categoryId);
    const publishAt = normalizePublishAt(body.scheduleEnabled, body.scheduledAt);

    if (!video) {
      await cleanupUploadDir(req.uploadDir);
      return res.status(400).json({ error: 'Please send the converted MP4 file.' });
    }

    if (!session) {
      await cleanupUploadDir(req.uploadDir);
      return res.status(401).json({ error: 'Connect YouTube before uploading.' });
    }

    const job = createJob({
      dir: req.uploadDir,
      audioPath: null,
      imagePath: null,
      outputPath: video.path,
      mode: 'youtube',
      title,
      description,
      privacyStatus,
      categoryId,
      publishAt,
      youtubeSessionId: session.id,
      downloadUrl: null,
      youtubeUrl: null,
      youtubeVideoId: null,
      outputBytes: video.size,
      convertProgress: 100,
      uploadProgress: 0,
      progress: 82,
      status: 'queued',
      stage: 'uploading',
      message: 'Converted MP4 received. Queued for YouTube upload.',
    });

    res.status(202).json({
      jobId: job.id,
      eventUrl: `/api/jobs/${job.id}/events`,
      statusUrl: `/api/jobs/${job.id}`,
    });

    setImmediate(() => {
      processClientYoutubeJob(job.id).catch((error) => {
        patchJob(job.id, {
          status: 'error',
          stage: 'error',
          error: error.message,
          message: 'The YouTube upload failed.',
        });
        cleanupJobFiles(job.id).catch(() => {});
      });
    });
  } catch (error) {
    next(error);
  }
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
    const categoryId = normalizeCategoryId(body.categoryId);
    const publishAt = normalizePublishAt(body.scheduleEnabled, body.scheduledAt);

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
      categoryId,
      publishAt,
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
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(config.clientDistDir, 'index.html'));
  });
}

app.use(async (error, req, res, _next) => {
  await cleanupUploadDir(req.uploadDir);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  if (error.status === 413 || error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Uploaded data is too large.' });
  }
  if (error.status && Number.isInteger(error.status)) {
    return res.status(error.status).json({ error: error.message });
  }

  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

setInterval(() => {
  sweepStaleJobs().catch(() => {});
}, 1000 * 60 * 10).unref();

app.listen(config.port, config.host, () => {
  console.log(`Server listening on ${config.serverPublicUrl} (${config.host}:${config.port})`);
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
      if (!Number.isFinite(percent)) return;

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
      categoryId: job.categoryId,
      publishAt: job.publishAt,
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

async function processClientYoutubeJob(id) {
  const job = getJob(id);
  if (!job) return;

  const session = getYoutubeSessionById(job.youtubeSessionId);
  if (!session) throw new Error('YouTube session expired. Please connect again.');

  patchJob(id, {
    status: 'running',
    stage: 'uploading',
    convertProgress: 100,
    uploadProgress: 0,
    progress: 82,
    message: 'Uploading browser-converted MP4 to YouTube.',
  });

  const result = await uploadVideoToYoutube({
    session,
    filePath: job.outputPath,
    title: job.title,
    description: job.description,
    privacyStatus: job.privacyStatus,
    categoryId: job.categoryId,
    publishAt: job.publishAt,
    onProgress: (percent) => {
      patchJob(id, {
        stage: 'uploading',
        uploadProgress: percent,
        progress: Math.min(99, 82 + Math.round(percent * 0.18)),
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
}

function safeExtension(filename, mimeType) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext && ext.length <= 8) return ext;
  if (mimeType.includes('mpeg')) return '.mp3';
  if (mimeType.includes('mp4')) return '.mp4';
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

function uploadDirForId(uploadId) {
  assertValidUploadId(uploadId);
  return path.join(config.tempRoot, uploadId);
}

function uploadMetadataPath(uploadId) {
  return path.join(uploadDirForId(uploadId), 'upload.json');
}

function assertValidUploadId(uploadId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(uploadId || ''))) {
    throw Object.assign(new Error('Invalid upload id.'), { status: 400 });
  }
}

async function readClientUploadMetadata(uploadId) {
  try {
    return JSON.parse(await fs.readFile(uploadMetadataPath(uploadId), 'utf8'));
  } catch {
    throw Object.assign(new Error('Upload session not found.'), { status: 404 });
  }
}

async function writeClientUploadMetadata(uploadId, metadata) {
  await fs.writeFile(uploadMetadataPath(uploadId), `${JSON.stringify(metadata)}\n`);
}

function parseContentRange(value) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(value || ''));
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: Number(match[3]),
  };
}

function normalizeCategoryId(value) {
  const stringValue = String(value || '').trim();
  return /^\d+$/.test(stringValue) ? stringValue : '22';
}

function normalizePublishAt(scheduleEnabled, scheduledAt) {
  if (!(scheduleEnabled === true || scheduleEnabled === 'true')) return null;
  const date = new Date(scheduledAt || '');
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
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
