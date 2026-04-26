import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const jobs = new Map();
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

function publicJob(job) {
  if (!job) return null;

  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    uploadProgress: job.uploadProgress,
    convertProgress: job.convertProgress,
    message: job.message,
    error: job.error,
    title: job.title,
    downloadUrl: job.downloadUrl,
    youtubeUrl: job.youtubeUrl,
    youtubeVideoId: job.youtubeVideoId,
    outputBytes: job.outputBytes,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    filesCleaned: job.filesCleaned,
  };
}

export function createJob(data) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const job = {
    id,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    uploadProgress: data.mode === 'youtube' ? 0 : null,
    convertProgress: 0,
    message: 'Queued',
    error: null,
    createdAt: now,
    updatedAt: now,
    filesCleaned: false,
    ...data,
  };

  jobs.set(id, job);
  emitJob(id);
  return job;
}

export function getJob(id) {
  return jobs.get(id);
}

export function getPublicJob(id) {
  return publicJob(getJob(id));
}

export function patchJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;

  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  emitJob(id);
  return job;
}

export function subscribeJob(id, listener) {
  const send = () => listener(publicJob(jobs.get(id)));
  emitter.on(id, send);
  send();
  return () => emitter.off(id, send);
}

export async function cleanupJobFiles(id) {
  const job = jobs.get(id);
  if (!job || job.filesCleaned) return;

  if (job.dir) {
    await fs.rm(job.dir, { recursive: true, force: true });
  }

  job.audioPath = null;
  job.imagePath = null;
  job.outputPath = null;
  job.filesCleaned = true;
  job.updatedAt = new Date().toISOString();
  emitJob(id);
}

export async function cleanupAndForgetJob(id) {
  await cleanupJobFiles(id);
  jobs.delete(id);
  emitter.removeAllListeners(id);
}

export async function sweepStaleJobs() {
  const now = Date.now();

  for (const job of jobs.values()) {
    const age = now - new Date(job.createdAt).getTime();
    const terminal = ['completed', 'error', 'cancelled'].includes(job.status);

    if (age > config.maxJobAgeMs || (terminal && job.filesCleaned)) {
      await cleanupAndForgetJob(job.id);
    }
  }
}

function emitJob(id) {
  emitter.emit(id);
}
