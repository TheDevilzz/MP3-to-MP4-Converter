import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CORE_URL = '/ffmpeg/ffmpeg-core.js';
const WASM_URL = '/ffmpeg/ffmpeg-core.wasm';
const CORE_ASSET_VERSION = 'esm-0.12.10';
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const VIDEO_CRF = 30;
const AUDIO_BITRATE = '192k';

let ffmpeg;
let loadingPromise;
let progressListenerRegistered = false;
let currentProgressHandler = null;
let coreAssetPromise;

export async function convertMp3ImageToMp4({ audioFile, imageFile, onStage, onProgress }) {
  if (!audioFile) {
    throw new Error('Missing MP3 file.');
  }

  const engine = await loadFfmpeg((percent) => {
    onStage?.('loading');
    onProgress?.(Math.min(10, Math.round(percent * 10)));
  });

  const audioName = `input-audio.${extensionFor(audioFile, 'mp3')}`;
  const hasImage = Boolean(imageFile);
  const imageName = hasImage ? `input-cover.${extensionFor(imageFile, 'png')}` : '';
  const outputName = 'output.mp4';

  try {
    onStage?.('preparing');
    onProgress?.(10);

    await engine.writeFile(audioName, await fetchFile(audioFile));
    if (hasImage) {
      await engine.writeFile(imageName, await fetchFile(imageFile));
    }

    const coverWidth = Math.round(VIDEO_WIDTH * 0.72);
    const coverHeight = Math.round(VIDEO_HEIGHT * 0.76);
    const filter = hasImage
      ? [
          `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},boxblur=18:1,eq=brightness=-0.08:saturation=0.85[bg]`,
          `[0:v]scale=${coverWidth}:${coverHeight}:force_original_aspect_ratio=decrease,format=rgba[cover]`,
          `[bg][cover]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`,
        ].join(';')
      : '[0:v]format=yuv420p[v]';

    currentProgressHandler = (progress) => {
      onStage?.('converting');
      onProgress?.(Math.max(0, Math.min(99, Math.round(progress * 100))));
    };

    const args = hasImage
      ? [
          '-loop',
          '1',
          '-framerate',
          '2',
          '-i',
          imageName,
          '-i',
          audioName,
          '-filter_complex',
          filter,
          '-map',
          '[v]',
          '-map',
          '1:a:0',
        ]
      : [
          '-f',
          'lavfi',
          '-i',
          `color=c=0x0f172a:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:r=2`,
          '-i',
          audioName,
          '-filter_complex',
          filter,
          '-map',
          '[v]',
          '-map',
          '1:a:0',
        ];

    const exitCode = await engine.exec([
      ...args,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'stillimage',
      '-crf',
      String(VIDEO_CRF),
      '-r',
      '2',
      '-g',
      '4',
      '-c:a',
      'aac',
      '-b:a',
      AUDIO_BITRATE,
      '-ar',
      '44100',
      '-movflags',
      '+faststart',
      '-shortest',
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`Browser FFmpeg exited with code ${exitCode}.`);
    }

    onProgress?.(100);
    const output = await engine.readFile(outputName);
    return new Blob([output], { type: 'video/mp4' });
  } finally {
    currentProgressHandler = null;
    await cleanupVirtualFile(engine, audioName);
    if (hasImage) {
      await cleanupVirtualFile(engine, imageName);
    }
    await cleanupVirtualFile(engine, outputName);
  }
}

async function loadFfmpeg(onLoadProgress) {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }

  if (!progressListenerRegistered) {
    ffmpeg.on('progress', ({ progress }) => {
      currentProgressHandler?.(progress);
    });
    progressListenerRegistered = true;
  }

  if (ffmpeg.loaded) return ffmpeg;

  if (!loadingPromise) {
    onLoadProgress?.(0.1);
    loadingPromise = ffmpeg
      .load(await getFfmpegCoreAssets())
      .then(() => {
        onLoadProgress?.(1);
        return ffmpeg;
      })
      .catch((error) => {
        loadingPromise = null;
        throw error;
      });
  }

  return loadingPromise;
}

async function getFfmpegCoreAssets() {
  if (!coreAssetPromise) {
    const coreUrl = versionedAssetUrl(CORE_URL);
    const wasmUrl = versionedAssetUrl(WASM_URL);

    coreAssetPromise = Promise.all([
      toBlobURL(coreUrl, 'text/javascript'),
      toBlobURL(wasmUrl, 'application/wasm'),
    ]).then(([coreURL, wasmURL]) => ({ coreURL, wasmURL }));
  }

  return coreAssetPromise;
}

function versionedAssetUrl(pathname) {
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set('v', CORE_ASSET_VERSION);
  return url.toString();
}

async function cleanupVirtualFile(engine, filename) {
  try {
    await engine.deleteFile(filename);
  } catch {
    // The file may not have been created if conversion failed early.
  }
}

function extensionFor(file, fallback) {
  const fromName = file.name?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const fromType = file.type?.split('/').pop()?.replace('mpeg', 'mp3');
  return fromType || fallback;
}
