import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileText, Loader2, Play, Trash2, UploadCloud, Volume2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { Textarea } from './ui/textarea';

const T2S_LANGUAGES = [
  { value: 'th', label: 'Thai' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh-CN', label: 'Chinese (Mandarin)' },
];

export function T2SPanel({ apiUrl }) {
  const uploadRef = useRef(null);
  const queueRef = useRef([]);
  const [language, setLanguage] = useState('th');
  const [speed, setSpeed] = useState(1);
  const [typedText, setTypedText] = useState('');
  const [typedName, setTypedName] = useState('speech');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  queueRef.current = items;

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === 'queued' || item.status === 'running').length,
    [items],
  );

  function addTypedText() {
    const text = String(typedText || '').trim();
    if (!text) {
      setError('Please enter text before adding to queue.');
      return;
    }
    setError('');
    const name = sanitizeName(typedName || 'speech');
    setItems((prev) => [
      ...prev,
      createT2sItem({
        sourceName: `${name}.txt`,
        outputName: `${name}.mp3`,
        text,
      }),
    ]);
    setTypedText('');
    setNotice('Text item added.');
  }

  async function addTextFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.name.toLowerCase().endsWith('.txt'));
    if (!files.length) {
      setError('Please upload .txt files only.');
      return;
    }
    setError('');

    const nextItems = [];
    for (const file of files) {
      const text = (await file.text()).trim();
      if (!text) continue;
      const baseName = sanitizeName(file.name.replace(/\.txt$/i, '')) || 'speech';
      nextItems.push(
        createT2sItem({
          sourceName: file.name,
          outputName: `${baseName}.mp3`,
          text,
        }),
      );
    }

    if (!nextItems.length) {
      setError('Uploaded text files are empty.');
      return;
    }

    setItems((prev) => [...prev, ...nextItems]);
    setNotice(`${nextItems.length} file(s) added.`);
  }

  function clearQueue() {
    if (isRunning) return;
    for (const item of items) {
      if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
    }
    setItems([]);
    setNotice('T2S queue cleared.');
    setError('');
  }

  async function startQueue() {
    if (isRunning) return;
    const queued = queueRef.current.filter((item) => item.status === 'queued');
    if (!queued.length) {
      setError('Please add at least one text item first.');
      return;
    }

    setError('');
    setNotice('');
    setIsRunning(true);
    try {
      await runWithConcurrency(queued.map((item) => item.id), 3, processItem);
      setNotice('T2S queue finished.');
    } finally {
      setIsRunning(false);
    }
  }

  async function processItem(itemId) {
    const item = queueRef.current.find((row) => row.id === itemId);
    if (!item) return;

    const text = String(item.text || '').trim();
    if (!text) {
      patchItem(itemId, { status: 'error', message: 'No text to synthesize.', error: 'Empty content.' });
      return;
    }

    patchItem(itemId, {
      status: 'running',
      message: `Generating speech at ${Math.round(speed * 100)}%.`,
      progress: 10,
      error: '',
    });

    const chunks = splitTextForT2s(text);
    if (!chunks.length) {
      patchItem(itemId, { status: 'error', message: 'No text to synthesize.', error: 'Empty content.' });
      return;
    }

    const audioParts = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkText = chunks[index];
      const response = await fetch(`${apiUrl}/api/t2s/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: chunkText,
          lang: language,
          speed,
        }),
      });

      if (!response.ok) {
        const payload = await safeReadJson(response);
        throw new Error(payload.error || 'Could not generate speech chunk.');
      }

      const buffer = await response.arrayBuffer();
      audioParts.push(new Uint8Array(buffer));
      patchItem(itemId, {
        progress: Math.round(((index + 1) / chunks.length) * 100),
        message: `Generated ${index + 1}/${chunks.length} chunk(s) at ${Math.round(speed * 100)}%.`,
      });
    }

    const merged = concatUint8Arrays(audioParts);
    const blob = new Blob([merged], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);
    patchItem(itemId, {
      status: 'completed',
      message: 'Speech ready.',
      progress: 100,
      audioUrl,
      bytes: blob.size,
    });
  }

  function patchItem(itemId, patch) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, ...patch };
      }),
    );
  }

  function updateOutputName(itemId, value) {
    const next = ensureMp3Extension(sanitizeName(value || 'speech'));
    patchItem(itemId, { outputName: next });
  }

  function removeItem(itemId) {
    if (isRunning) return;
    setItems((prev) => {
      const target = prev.find((item) => item.id === itemId);
      if (target?.audioUrl) URL.revokeObjectURL(target.audioUrl);
      return prev.filter((item) => item.id !== itemId);
    });
  }

  return (
    <section className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Text to Speech (gTTS)</CardTitle>
          <CardDescription>
            Upload .txt or paste text, generate speech in parallel, and download named MP3 files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="t2s-language">Language</Label>
              <select
                id="t2s-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="flex h-10 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {T2S_LANGUAGES.map((languageOption) => (
                  <option key={languageOption.value} value={languageOption.value}>
                    {languageOption.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="t2s-speed">
                Speed ({speed.toFixed(2)}x / {Math.round(speed * 100)}%)
              </Label>
              <Input
                id="t2s-speed"
                type="range"
                min="0.6"
                max="3.0"
                step="0.05"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-2">
              <Label htmlFor="t2s-text">Type text</Label>
              <Textarea
                id="t2s-text"
                value={typedText}
                onChange={(event) => setTypedText(event.target.value)}
                placeholder="Paste text here..."
                className="min-h-40"
              />
              <div className="flex flex-wrap gap-2">
                <Input
                  value={typedName}
                  onChange={(event) => setTypedName(event.target.value)}
                  placeholder="output file name"
                  className="max-w-52"
                />
                <Button type="button" onClick={addTypedText} disabled={isRunning}>
                  <PlusIcon />
                  Add text item
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Upload .txt files</Label>
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="flex min-h-40 w-full cursor-pointer flex-col justify-between rounded-lg border border-dashed border-border bg-muted/35 p-4 text-left transition-colors hover:border-primary/70 hover:bg-muted"
              >
                <input
                  ref={uploadRef}
                  type="file"
                  accept=".txt,text/plain"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    addTextFiles(event.target.files).catch((uploadError) => {
                      setError(getErrorMessage(uploadError, 'Could not read text files.'));
                    });
                    event.target.value = '';
                  }}
                />
                <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-background/90">
                  <UploadCloud className="size-5 text-primary" aria-hidden="true" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Select one or many .txt files. Processing runs in parallel on the client queue.
                </p>
              </button>
            </div>
          </div>

          {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">{notice}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={startQueue} disabled={isRunning || !pendingCount}>
              {isRunning ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
              Start T2S Queue
            </Button>
            <Button type="button" variant="outline" onClick={clearQueue} disabled={isRunning}>
              <Trash2 aria-hidden="true" />
              Clear queue
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>T2S Queue</CardTitle>
          <CardDescription>Files stay in browser memory. Server only streams generated audio chunks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!items.length && <p className="text-sm text-muted-foreground">No text items yet.</p>}
          {items.map((item, index) => (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {index + 1}. {item.sourceName}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.message}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.status === 'completed' && <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={isRunning}
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <Progress value={item.progress || 0} className="mt-3" />

              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input
                  value={item.outputName}
                  onChange={(event) => updateOutputName(item.id, event.target.value)}
                  disabled={isRunning}
                />
                {item.audioUrl ? (
                  <>
                    <audio controls src={item.audioUrl} className="h-10 w-full min-w-52" />
                    <Button asChild>
                      <a href={item.audioUrl} download={item.outputName}>
                        <Download aria-hidden="true" />
                        Download
                      </a>
                    </Button>
                  </>
                ) : (
                  <div className="md:col-span-2 flex items-center text-xs text-muted-foreground">
                    <Volume2 className="mr-2 size-4" aria-hidden="true" />
                    Waiting for audio output
                  </div>
                )}
              </div>

              {item.error && <p className="mt-2 text-xs text-destructive">{item.error}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Source size: {item.text.length.toLocaleString()} characters</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function createT2sItem({ sourceName, outputName, text }) {
  return {
    id: crypto.randomUUID(),
    sourceName,
    outputName,
    text,
    status: 'queued',
    progress: 0,
    message: 'Queued for text-to-speech.',
    error: '',
    bytes: 0,
    audioUrl: '',
  };
}

function splitTextForT2s(text, maxLength = 1200) {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return [];

  const hardParts = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  for (const block of hardParts) {
    if (block.length <= maxLength) {
      chunks.push(block);
      continue;
    }

    const sentences = block
      .split(/(?<=[.!?।。！？])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    let current = '';

    for (const sentence of sentences) {
      if (sentence.length > maxLength) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        for (let start = 0; start < sentence.length; start += maxLength) {
          chunks.push(sentence.slice(start, start + maxLength));
        }
        continue;
      }
      const next = current ? `${current} ${sentence}` : sentence;
      if (next.length > maxLength) {
        if (current) chunks.push(current);
        current = sentence;
      } else {
        current = next;
      }
    }

    if (current) chunks.push(current);
  }

  return chunks;
}

function concatUint8Arrays(arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.length;
  }
  return merged;
}

function sanitizeName(value) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function ensureMp3Extension(name) {
  const cleaned = String(name || '').trim() || 'speech';
  return cleaned.toLowerCase().endsWith('.mp3') ? cleaned : `${cleaned}.mp3`;
}

async function runWithConcurrency(ids, concurrency, worker) {
  const queue = [...ids];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      if (!id) break;
      try {
        await worker(id);
      } catch {
        // Each item handles its own error state.
      }
    }
  });
  await Promise.all(workers);
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function getErrorMessage(error, fallback) {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

function PlusIcon() {
  return <FileText className="size-4" aria-hidden="true" />;
}
