import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { config } from './config.js';

export async function assertFfmpegAvailable() {
  await runProcess(config.ffmpegPath, ['-version'], { collect: false });
  await runProcess(config.ffprobePath, ['-version'], { collect: false });
}

export async function probeDuration(inputPath) {
  const output = await runProcess(config.ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);

  const duration = Number.parseFloat(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Could not read MP3 duration with ffprobe.');
  }

  return duration;
}

export async function convertMp3ToMp4({ audioPath, imagePath, outputPath }, onProgress) {
  const duration = await probeDuration(audioPath);
  const width = config.videoWidth;
  const height = config.videoHeight;
  const coverWidth = Math.round(width * 0.72);
  const coverHeight = Math.round(height * 0.76);

  const filter = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=18:1,eq=brightness=-0.08:saturation=0.85[bg]`,
    `[0:v]scale=${coverWidth}:${coverHeight}:force_original_aspect_ratio=decrease,format=rgba[cover]`,
    `[bg][cover]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`,
  ].join(';');

  const args = [
    '-hide_banner',
    '-y',
    '-loop',
    '1',
    '-framerate',
    '2',
    '-i',
    imagePath,
    '-i',
    audioPath,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    config.ffmpegPreset,
    '-tune',
    'stillimage',
    '-crf',
    String(config.videoCrf),
    '-r',
    '2',
    '-g',
    '4',
    '-c:a',
    'aac',
    '-b:a',
    config.audioBitrate,
    '-ar',
    '44100',
    '-movflags',
    '+faststart',
    '-shortest',
    '-nostats',
    '-progress',
    'pipe:1',
    outputPath,
  ];

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn(config.ffmpegPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderr = '';
    let lastProgress = 0;

    ffmpeg.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        const [key, rawValue] = line.split('=');
        if (!key || rawValue == null) continue;

        if (key === 'out_time_ms' || key === 'out_time_us' || key === 'out_time') {
          const seconds = parseProgressSeconds(key, rawValue);
          if (!Number.isFinite(seconds)) continue;

          const next = Math.min(99, Math.max(lastProgress, (seconds / duration) * 100));
          if (!Number.isFinite(next)) continue;

          lastProgress = next;
          onProgress(Math.round(next));
        }

        if (key === 'progress' && rawValue === 'end') {
          lastProgress = 100;
          onProgress(100);
        }
      }
    });

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12_000) stderr = stderr.slice(-12_000);
    });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        onProgress(100);
        resolve();
        return;
      }

      reject(new Error(`FFmpeg exited with code ${code}. ${stderr.trim()}`));
    });
  });

  return stat(outputPath);
}

function parseProgressSeconds(key, rawValue) {
  if (key === 'out_time') return parseFfmpegClockTime(rawValue);

  const microseconds = Number(rawValue);
  if (!Number.isFinite(microseconds) || microseconds < 0) return null;
  return microseconds / 1_000_000;
}

function parseFfmpegClockTime(value) {
  const match = String(value).match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return null;

  const [, hours, minutes, seconds] = match;
  const totalSeconds = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isFinite(totalSeconds) ? totalSeconds : null;
}

function runProcess(command, args, options = {}) {
  const collect = options.collect !== false;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      if (collect) stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} failed with code ${code}. ${stderr.trim()}`));
    });
  });
}

export function fileExists(filePath) {
  return fs.existsSync(filePath);
}
