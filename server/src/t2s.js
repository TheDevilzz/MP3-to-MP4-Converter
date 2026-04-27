import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { config } from './config.js';

const require = createRequire(import.meta.url);
const GTTS = require('gtts');

const MAX_CHARS_PER_SEGMENT = 90;

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
  if (!baseAudio.length) {
    throw new Error('gTTS returned empty audio. Please try again or check outbound network access to Google TTS.');
  }
  // Requested behavior:
  // - speed <= 1.10: return raw chunk and let client merge chunks directly.
  // - speed > 1.10: process each chunk through FFmpeg before returning.
  if (normalizedSpeed <= 1.1) {
    return baseAudio;
  }
  return await remapAudioSpeed(baseAudio, normalizedSpeed);
}

export async function synthesizeLongTextToMp3({ text, lang = 'th', speed = 1 }) {
  const normalizedText = String(text || '').replace(/\r/g, '').trim();
  if (!normalizedText) {
    throw new Error('Text is required for T2S.');
  }

  const segments = splitForTts(normalizedText, MAX_CHARS_PER_SEGMENT);
  if (!segments.length) {
    throw new Error('No valid text segments for T2S.');
  }

  // Process each segment through the same FFmpeg speed pipeline first.
  const segmentBuffers = [];
  for (const segment of segments) {
    const segmentAudio = await synthesizeTextToMp3({ text: segment, lang, speed });
    if (segmentAudio.length) {
      segmentBuffers.push(segmentAudio);
    }
  }

  if (!segmentBuffers.length) {
    throw new Error('T2S could not generate audio segments.');
  }

  // Merge all processed segments and normalize again as one clean MP3 stream.
  const mergedBuffer = Buffer.concat(segmentBuffers);
  return await normalizeMp3Buffer(mergedBuffer);
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
    '-f',
    'mp3',
    '-i',
    'pipe:0',
    '-filter:a',
    atempoFilter,
    '-map_metadata',
    '-1',
    '-id3v2_version',
    '0',
    '-write_xing',
    '0',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-f',
    'mp3',
    'pipe:1',
  ];

  return await runFfmpegMp3Transform(inputBuffer, ffmpegArgs);
}

async function normalizeMp3Buffer(inputBuffer) {
  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'mp3',
    '-i',
    'pipe:0',
    '-map_metadata',
    '-1',
    '-id3v2_version',
    '0',
    '-write_xing',
    '0',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-f',
    'mp3',
    'pipe:1',
  ];

  return await runFfmpegMp3Transform(inputBuffer, ffmpegArgs);
}

async function runFfmpegMp3Transform(inputBuffer, ffmpegArgs) {
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

function splitForTts(text, maxChars) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return [];

  const sentenceChunks = cleaned
    .split(/(?<=[.!?।。！？\n])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const output = [];
  let current = '';
  for (const sentence of sentenceChunks) {
    if (sentence.length > maxChars) {
      if (current) {
        output.push(current);
        current = '';
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        output.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxChars) {
      if (current) output.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) output.push(current);
  return output;
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
