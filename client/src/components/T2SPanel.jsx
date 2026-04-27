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

const UI_COPY = {
  th: {
    title: 'แปลงข้อความเป็นเสียง (gTTS)',
    description: 'อัปโหลดไฟล์ .txt หรือวางข้อความ สร้างเสียงพร้อมกัน และดาวน์โหลด MP3 แยกไฟล์ได้',
    language: 'ภาษาเสียง',
    speed: 'ความเร็ว',
    typeText: 'พิมพ์ข้อความ',
    typePlaceholder: 'วางข้อความที่นี่...',
    outputNamePlaceholder: 'ชื่อไฟล์ผลลัพธ์',
    addTextItem: 'เพิ่มรายการข้อความ',
    uploadTxt: 'อัปโหลดไฟล์ .txt',
    uploadHint: 'เลือกไฟล์ .txt ได้หลายไฟล์ ประมวลผลพร้อมกันบนคิวฝั่ง client',
    startQueue: 'เริ่มคิว T2S',
    clearQueue: 'ล้างคิว',
    queueTitle: 'คิว T2S',
    queueDescription: 'ไฟล์อยู่ในหน่วยความจำเบราว์เซอร์เท่านั้น ฝั่งเซิร์ฟเวอร์ส่งกลับเฉพาะ chunk เสียง',
    noItems: 'ยังไม่มีรายการข้อความ',
    waitingAudio: 'รอผลลัพธ์เสียง',
    download: 'ดาวน์โหลด',
    saveAs: 'เลือกตำแหน่งบันทึก',
    sourceSize: 'ขนาดข้อความต้นฉบับ',
    emptyText: 'กรุณากรอกข้อความก่อนเพิ่มคิว',
    txtOnly: 'กรุณาอัปโหลดเฉพาะไฟล์ .txt',
    emptyFiles: 'ไฟล์ข้อความที่อัปโหลดว่างทั้งหมด',
    queueCleared: 'ล้างคิว T2S แล้ว',
    addSuccess: 'เพิ่มรายการข้อความแล้ว',
    filesAdded: 'เพิ่มไฟล์แล้ว',
    noQueue: 'กรุณาเพิ่มรายการข้อความอย่างน้อย 1 รายการ',
    queueFinished: 'ประมวลผลคิว T2S เสร็จแล้ว',
    generating: 'กำลังสร้างเสียงที่ความเร็ว',
    generatedChunks: 'สร้างเสียงแล้ว',
    ready: 'ไฟล์เสียงพร้อมแล้ว',
    noText: 'ไม่มีข้อความสำหรับแปลงเสียง',
    selectSave: 'เลือกว่าเซฟไฟล์ไว้ที่ไหน',
  },
  en: {
    title: 'Text to Speech (gTTS)',
    description: 'Upload .txt or paste text, generate speech in parallel, and download named MP3 files.',
    language: 'Speech language',
    speed: 'Speed',
    typeText: 'Type text',
    typePlaceholder: 'Paste text here...',
    outputNamePlaceholder: 'output file name',
    addTextItem: 'Add text item',
    uploadTxt: 'Upload .txt files',
    uploadHint: 'Select one or many .txt files. Processing runs in parallel on the client queue.',
    startQueue: 'Start T2S Queue',
    clearQueue: 'Clear queue',
    queueTitle: 'T2S Queue',
    queueDescription: 'Files stay in browser memory. Server only streams generated audio chunks.',
    noItems: 'No text items yet.',
    waitingAudio: 'Waiting for audio output',
    download: 'Download',
    saveAs: 'Save as...',
    sourceSize: 'Source size',
    emptyText: 'Please enter text before adding to queue.',
    txtOnly: 'Please upload .txt files only.',
    emptyFiles: 'Uploaded text files are empty.',
    queueCleared: 'T2S queue cleared.',
    addSuccess: 'Text item added.',
    filesAdded: 'file(s) added.',
    noQueue: 'Please add at least one text item first.',
    queueFinished: 'T2S queue finished.',
    generating: 'Generating speech at speed',
    generatedChunks: 'Generated',
    ready: 'Speech ready.',
    noText: 'No text to synthesize.',
    selectSave: 'Choose where to save the generated file.',
  },
};

export function T2SPanel({ apiUrl, locale = 'th' }) {
  const uploadRef = useRef(null);
  const queueRef = useRef([]);
  const copy = UI_COPY[locale] || UI_COPY.en;
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
      setError(copy.emptyText);
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
    setNotice(copy.addSuccess);
  }

  async function addTextFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.name.toLowerCase().endsWith('.txt'));
    if (!files.length) {
      setError(copy.txtOnly);
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
      setError(copy.emptyFiles);
      return;
    }

    setItems((prev) => [...prev, ...nextItems]);
    setNotice(`${nextItems.length} ${copy.filesAdded}`);
  }

  function clearQueue() {
    if (isRunning) return;
    for (const item of items) {
      if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
    }
    setItems([]);
    setNotice(copy.queueCleared);
    setError('');
  }

  async function startQueue() {
    if (isRunning) return;
    const queued = queueRef.current.filter((item) => item.status === 'queued');
    if (!queued.length) {
      setError(copy.noQueue);
      return;
    }

    setError('');
    setNotice('');
    setIsRunning(true);
    try {
      await runWithConcurrency(queued.map((item) => item.id), 3, processItem);
      setNotice(copy.queueFinished);
    } finally {
      setIsRunning(false);
    }
  }

  async function processItem(itemId) {
    const item = queueRef.current.find((row) => row.id === itemId);
    if (!item) return;

    const text = String(item.text || '').trim();
    if (!text) {
      patchItem(itemId, { status: 'error', message: copy.noText, error: 'Empty content.' });
      return;
    }

    patchItem(itemId, {
      status: 'running',
      message: `${copy.generating} ${Math.round(speed * 100)}%.`,
      progress: 10,
      error: '',
    });

    const chunks = splitTextForT2s(text);
    if (!chunks.length) {
      patchItem(itemId, { status: 'error', message: copy.noText, error: 'Empty content.' });
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
        message: `${copy.generatedChunks} ${index + 1}`,
      });
    }

    const merged = concatUint8Arrays(audioParts);
    const blob = new Blob([merged], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);
    patchItem(itemId, {
      status: 'completed',
      message: copy.ready,
      progress: 100,
      audioUrl,
      audioBlob: blob,
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

  async function saveItemAs(item) {
    if (!item?.audioBlob) return;
    const fileName = ensureMp3Extension(item.outputName || 'speech');

    try {
      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'MP3 Audio',
              accept: {
                'audio/mpeg': ['.mp3'],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(item.audioBlob);
        await writable.close();
        return;
      }

      const fallbackLink = document.createElement('a');
      fallbackLink.href = item.audioUrl;
      fallbackLink.download = fileName;
      fallbackLink.click();
    } catch (saveError) {
      if (saveError?.name === 'AbortError') return;
      setError(getErrorMessage(saveError, copy.selectSave));
    }
  }

  return (
    <section className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="t2s-language">{copy.language}</Label>
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
                {copy.speed} ({speed.toFixed(2)}x)
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
              <Label htmlFor="t2s-text">{copy.typeText}</Label>
              <Textarea
                id="t2s-text"
                value={typedText}
                onChange={(event) => setTypedText(event.target.value)}
                placeholder={copy.typePlaceholder}
                className="min-h-40"
              />
              <div className="flex flex-wrap gap-2">
                <Input
                  value={typedName}
                  onChange={(event) => setTypedName(event.target.value)}
                  placeholder={copy.outputNamePlaceholder}
                  className="max-w-52"
                />
                <Button type="button" onClick={addTypedText} disabled={isRunning}>
                  <PlusIcon />
                  {copy.addTextItem}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{copy.uploadTxt}</Label>
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
                  {copy.uploadHint}
                </p>
              </button>
            </div>
          </div>

          {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">{notice}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={startQueue} disabled={isRunning || !pendingCount}>
              {isRunning ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
              {copy.startQueue}
            </Button>
            <Button type="button" variant="outline" onClick={clearQueue} disabled={isRunning}>
              <Trash2 aria-hidden="true" />
              {copy.clearQueue}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.queueTitle}</CardTitle>
          <CardDescription>{copy.queueDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!items.length && <p className="text-sm text-muted-foreground">{copy.noItems}</p>}
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
                    <Button asChild variant="outline">
                      <a href={item.audioUrl} download={item.outputName}>
                        <Download aria-hidden="true" />
                        {copy.download}
                      </a>
                    </Button>
                    <Button type="button" onClick={() => saveItemAs(item)}>
                      <Download aria-hidden="true" />
                      {copy.saveAs}
                    </Button>
                  </>
                ) : (
                  <div className="md:col-span-2 flex items-center text-xs text-muted-foreground">
                    <Volume2 className="mr-2 size-4" aria-hidden="true" />
                    {copy.waitingAudio}
                  </div>
                )}
              </div>

              {item.error && <p className="mt-2 text-xs text-destructive">{item.error}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {copy.sourceSize}: {item.text.length.toLocaleString()} characters
              </p>
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
    audioBlob: null,
  };
}

function splitTextForT2s(text, maxLength = 1200, linesPerChunk = 5) {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return [];

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const chunks = [];
  for (let index = 0; index < lines.length; index += linesPerChunk) {
    const block = lines.slice(index, index + linesPerChunk).join('\n').trim();
    if (!block) continue;

    if (block.length <= maxLength) {
      chunks.push(block);
      continue;
    }

    for (let start = 0; start < block.length; start += maxLength) {
      chunks.push(block.slice(start, start + maxLength));
    }
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
