import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { config } from './config.js';

const require = createRequire(import.meta.url);
const GTTS = require('gtts');

export async function synthesizeTextToMp3({ text, lang = 'th', speed = 1 }) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    throw new Error('Text is required for T2S.');
  }

  const normalizedSpeed = clamp(
    Number.isFinite(Number(speed)) ? Number(speed) : 1,
    0.6,
    3.0,
  );
  // Always generate base voice at normal speed, then remap with FFmpeg for exact speed control.
  const tts = new GTTS(normalizedText, String(lang || 'th'), false);
  const stream = tts.stream();
  const baseAudio = await streamToBuffer(stream);

  // gTTS supports only normal/slow modes, so apply exact speed with FFmpeg in-memory.
  if (Math.abs(normalizedSpeed - 1) < 0.01) {
    return baseAudio;
  }
  return await remapAudioSpeed(baseAudio, normalizedSpeed);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function remapAudioSpeed(inputBuffer, speed) {
  const atempoFilter = buildAtempoFilter(speed);
  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-filter:a',
    atempoFilter,
    '-f',
    'mp3',
    'pipe:1',
  ];

  return await new Promise((resolve, reject) => {
    const ffmpeg = spawn(config.ffmpegPath, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = [];
    let stderr = '';

    ffmpeg.stdout.on('data', (chunk) => {
      output.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on('error', (error) => {
      reject(new Error(`Could not start FFmpeg for speed processing: ${error.message}`));
    });
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `FFmpeg speed processing failed with code ${code}.`));
        return;
      }
      resolve(Buffer.concat(output));
    });

    ffmpeg.stdin.end(inputBuffer);
  });
}

function buildAtempoFilter(speed) {
  // FFmpeg atempo accepts each stage between 0.5 and 2.0, so chain filters for wider ratios.
  const parts = [];
  let ratio = speed;

  while (ratio > 2.0) {
    parts.push('atempo=2.0');
    ratio /= 2.0;
  }
  while (ratio < 0.5) {
    parts.push('atempo=0.5');
    ratio /= 0.5;
  }
  parts.push(`atempo=${ratio.toFixed(4)}`);
  return parts.join(',');
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
