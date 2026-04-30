const MODEL_MAP = {
  th: 'Xenova/mms-tts-tha',
  en: 'Xenova/mms-tts-eng',
  ja: 'Xenova/mms-tts-jpn',
  ko: 'Xenova/mms-tts-kor',
  'zh-CN': 'Xenova/mms-tts-cmn',
};

const DEFAULT_SAMPLE_RATE = 22050;
const synthesizers = new Map();
let transformersModulePromise = null;

export async function synthesizeOnDevice(text, lang = 'th', { onStatus } = {}) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    throw new Error('Empty text for Browser TTS.');
  }

  const modelId = MODEL_MAP[lang] || MODEL_MAP.en;
  const synthesizer = await getOrCreateSynthesizer(modelId, onStatus);

  onStatus?.(`Synthesizing (${lang})...`);
  const output = await synthesizer(normalizedText);
  const normalizedOutput = normalizeTtsOutput(output);

  if (!normalizedOutput.audio.length) {
    throw new Error('Browser TTS returned empty audio.');
  }

  return normalizedOutput;
}

async function getOrCreateSynthesizer(modelId, onStatus) {
  if (synthesizers.has(modelId)) {
    return synthesizers.get(modelId);
  }

  const { pipeline, env } = await getTransformers();
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const useWebGpu = await isWebGpuAvailable();
  const device = useWebGpu ? 'webgpu' : 'wasm';
  onStatus?.(`Loading ${modelId} on ${useWebGpu ? 'WebGPU' : 'WASM'}...`);

  const synthesizer = await pipeline('text-to-speech', modelId, {
    device,
    quantized: true,
  });
  synthesizers.set(modelId, synthesizer);
  return synthesizer;
}

async function getTransformers() {
  if (!transformersModulePromise) {
    transformersModulePromise = import('@xenova/transformers');
  }
  return transformersModulePromise;
}

function normalizeTtsOutput(output) {
  const audioLike = output?.audio ?? output;
  const sampleRate = Number(
    output?.sampling_rate ?? output?.sample_rate ?? DEFAULT_SAMPLE_RATE,
  );

  const audio =
    audioLike instanceof Float32Array
      ? audioLike
      : Array.isArray(audioLike)
        ? Float32Array.from(audioLike)
        : audioLike?.data instanceof Float32Array
          ? audioLike.data
          : null;

  if (!audio) {
    throw new Error('Browser TTS output format is not supported.');
  }

  return {
    audio,
    sampling_rate: Number.isFinite(sampleRate) ? sampleRate : DEFAULT_SAMPLE_RATE,
  };
}

async function isWebGpuAvailable() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}
