import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  CheckCircle2,
  CircleAlert,
  CircleUserRound,
  Download,
  ExternalLink,
  FileAudio,
  HeartHandshake,
  Image,
  Loader2,
  Moon,
  Play,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
  TvMinimalPlay,
  UploadCloud,
} from 'lucide-react';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Progress } from './components/ui/progress';
import { Switch } from './components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Textarea } from './components/ui/textarea';
import { cn } from './lib/utils';
import { convertMp3ImageToMp4 } from './lib/clientFfmpeg';

const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin);
const CLIENT_YOUTUBE_CHUNK_BYTES = 8 * 1024 * 1024;

function App() {
  const eventSourceRef = useRef(null);
  const queueRef = useRef([]);
  const phaseRef = useRef({});
  const conversionStartedAtRef = useRef({});
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState('studio');

  const [editorMp3File, setEditorMp3File] = useState(null);
  const [editorImageFile, setEditorImageFile] = useState(null);
  const [sharedCoverFile, setSharedCoverFile] = useState(null);
  const [useSharedCover, setUseSharedCover] = useState(true);
  const [editorMode, setEditorMode] = useState('download');
  const [editorTitle, setEditorTitle] = useState('Converted MP3 Video');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorPrivacyStatus, setEditorPrivacyStatus] = useState('private');

  const [queueItems, setQueueItems] = useState([]);
  const [activeItemId, setActiveItemId] = useState('');
  const [isQueueRunning, setIsQueueRunning] = useState(false);

  const [youtube, setYoutube] = useState({
    configured: false,
    connected: false,
    channel: null,
  });
  const [health, setHealth] = useState({ checked: false, ok: false, ffmpeg: false });
  const [notice, setNotice] = useState(() =>
    initialQuery.get('youtube') === 'connected' ? 'YouTube connected.' : '',
  );
  const [error, setError] = useState(() =>
    initialQuery.get('youtube') === 'error'
      ? initialQuery.get('message') || 'YouTube connection failed.'
      : '',
  );

  const activeItem = queueItems.find((item) => item.id === activeItemId) || null;
  const activeStatus = getActiveStatus(isQueueRunning, queueItems);
  const editorImagePreviewUrl = useMemo(() => {
    if (!editorImageFile) return null;
    return URL.createObjectURL(editorImageFile);
  }, [editorImageFile]);
  const sharedCoverPreviewUrl = useMemo(() => {
    if (!sharedCoverFile) return null;
    return URL.createObjectURL(sharedCoverFile);
  }, [sharedCoverFile]);

  useEffect(() => {
    queueRef.current = queueItems;
  }, [queueItems]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      if (editorImagePreviewUrl) URL.revokeObjectURL(editorImagePreviewUrl);
    };
  }, [editorImagePreviewUrl]);

  useEffect(() => {
    return () => {
      if (sharedCoverPreviewUrl) URL.revokeObjectURL(sharedCoverPreviewUrl);
    };
  }, [sharedCoverPreviewUrl]);

  useEffect(() => {
    let active = true;

    fetch(`${API_URL}/api/youtube/status`, { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        if (active) setYoutube(data);
      })
      .catch(() => {
        if (active) setYoutube({ configured: false, connected: false, channel: null });
      });

    fetch(`${API_URL}/api/health`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (active) setHealth({ ...data, checked: true });
      })
      .catch(() => {
        if (active) {
          setHealth({
            checked: true,
            ok: false,
            ffmpeg: false,
            error: 'Backend health check is unavailable.',
          });
        }
      });

    if (new URLSearchParams(window.location.search).has('youtube')) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => {
      active = false;
      eventSourceRef.current?.close();
      cleanupQueueUrls(queueRef.current);
    };
  }, []);

  async function loginWithYoutube() {
    setError('');
    const response = await fetch(`${API_URL}/api/youtube/auth-url`, {
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Google OAuth is not configured.');
      return;
    }
    window.location.assign(data.url);
  }

  async function changeYoutubeChannel() {
    await disconnectYoutube();
    await loginWithYoutube();
  }

  async function disconnectYoutube() {
    await fetch(`${API_URL}/api/youtube/disconnect`, {
      method: 'POST',
      credentials: 'include',
    });
    setYoutube((current) => ({ ...current, connected: false, channel: null }));
  }

  function addQueueItem() {
    setError('');
    setNotice('');

    if (!editorMp3File) {
      setError('Please add an MP3 before adding to queue.');
      return;
    }
    if (editorMode === 'youtube' && !editorTitle.trim()) {
      setError('Please set a YouTube title for this queue item.');
      return;
    }

    const selectedCover = editorImageFile || (useSharedCover ? sharedCoverFile : null);
    const itemId = crypto.randomUUID();
    const imagePreviewUrl = selectedCover ? URL.createObjectURL(selectedCover) : '';

    const newItem = {
      id: itemId,
      createdAt: Date.now(),
      mp3File: editorMp3File,
      imageFile: selectedCover,
      imagePreviewUrl,
      mode: editorMode,
      title: editorTitle.trim() || 'Converted MP3 Video',
      description: editorDescription.trim(),
      privacyStatus: editorPrivacyStatus,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      convertProgress: 0,
      uploadProgress: 0,
      transferProgress: 0,
      message: 'Queued',
      error: '',
      etaText: '',
      outputBytes: 0,
      downloadHref: '',
      youtubeUrl: '',
      youtubeVideoId: '',
    };

    setQueueItems((prev) => [...prev, newItem]);
    setActiveItemId(itemId);
    setEditorMp3File(null);
    setEditorImageFile(null);
    setEditorDescription('');
    setEditorTitle('Converted MP3 Video');
    setNotice('Queue item added.');
  }

  function removeQueueItem(id) {
    if (isQueueRunning) return;

    setQueueItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.downloadHref) URL.revokeObjectURL(target.downloadHref);
      if (target?.imagePreviewUrl) URL.revokeObjectURL(target.imagePreviewUrl);
      const next = prev.filter((item) => item.id !== id);
      if (activeItemId === id) setActiveItemId(next[0]?.id || '');
      return next;
    });
  }

  function moveQueueItem(id, direction) {
    if (isQueueRunning) return;

    setQueueItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index < 0) return prev;
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const clone = [...prev];
      const [item] = clone.splice(index, 1);
      clone.splice(nextIndex, 0, item);
      return clone;
    });
  }

  function clearQueue() {
    if (isQueueRunning) return;
    cleanupQueueUrls(queueItems);
    setQueueItems([]);
    setActiveItemId('');
    setError('');
    setNotice('Queue cleared.');
  }

  async function startQueue() {
    if (isQueueRunning) return;
    if (!queueRef.current.length) {
      setError('Please add at least one queue item first.');
      return;
    }
    if (queueRef.current.some((item) => item.mode === 'youtube') && !youtube.connected) {
      setError('Connect YouTube before running queue items set to YouTube mode.');
      return;
    }

    setError('');
    setNotice('');
    setIsQueueRunning(true);

    try {
      const queuedIds = queueRef.current
        .filter((item) => item.status === 'queued')
        .map((item) => item.id);
      if (!queuedIds.length) {
        setNotice('No queued items to process.');
        return;
      }

      await Promise.all(queuedIds.map((id) => processQueueConversion(id)));

      for (const id of queuedIds) {
        const current = queueRef.current.find((item) => item.id === id);
        if (!current || current.mode !== 'youtube') continue;
        if (current.status === 'error') continue;
        try {
          await uploadConvertedQueueItem(id);
        } catch (uploadError) {
          updateQueueItem(id, {
            status: 'error',
            stage: 'error',
            message: 'YouTube upload failed.',
            error: getErrorMessage(uploadError, 'YouTube upload failed.'),
          });
        }
      }

      setNotice('Queue finished.');
    } finally {
      setIsQueueRunning(false);
      eventSourceRef.current?.close();
    }
  }

  async function processQueueConversion(itemId) {
    const item = queueRef.current.find((candidate) => candidate.id === itemId);
    if (!item) return;

    setActiveItemId(itemId);
    phaseRef.current[itemId] = 'loading';
    conversionStartedAtRef.current[itemId] = null;

    updateQueueItem(itemId, {
      status: 'running',
      stage: 'loading',
      message: 'Loading browser FFmpeg engine.',
      progress: 0,
      convertProgress: 0,
      uploadProgress: 0,
      transferProgress: 0,
      error: '',
      etaText: '',
      youtubeUrl: '',
      youtubeVideoId: '',
    });

    try {
      const mp4Blob = await convertMp3ImageToMp4({
        audioFile: item.mp3File,
        imageFile: item.imageFile,
        onStage: (stage) => {
          phaseRef.current[itemId] = stage;
          if (stage === 'preparing') {
            conversionStartedAtRef.current[itemId] = null;
            updateQueueItem(itemId, {
              stage: 'preparing',
              message: 'Preparing files in browser memory.',
            });
            return;
          }
          if (stage === 'loading') {
            updateQueueItem(itemId, {
              stage: 'loading',
              message: 'Loading browser FFmpeg engine.',
            });
            return;
          }
          if (stage === 'converting') {
            if (!conversionStartedAtRef.current[itemId]) {
              conversionStartedAtRef.current[itemId] = Date.now();
            }
            updateQueueItem(itemId, {
              stage: 'converting',
            });
          }
        },
        onProgress: (percent) => {
          const isConverting = phaseRef.current[itemId] === 'converting';
          const etaText = isConverting
            ? getConversionEtaText(percent, conversionStartedAtRef.current[itemId])
            : '';

          updateQueueItem(itemId, {
            stage: isConverting ? 'converting' : phaseRef.current[itemId] || 'loading',
            convertProgress: isConverting ? percent : 0,
            transferProgress: isConverting ? 100 : Math.min(95, Math.round(percent * 9.5)),
            progress: isConverting
              ? item.mode === 'youtube'
                ? Math.min(72, Math.round(percent * 0.72))
                : percent
              : 0,
            message: isConverting
              ? `Converting in browser ${percent}%${etaText ? ` - ${etaText}` : ''}`
              : 'Loading browser FFmpeg engine.',
            etaText,
          });
        },
      });

      if (item.mode === 'download') {
        const downloadHref = URL.createObjectURL(mp4Blob);
        updateQueueItem(itemId, {
          status: 'completed',
          stage: 'ready',
          progress: 100,
          convertProgress: 100,
          transferProgress: 100,
          uploadProgress: 0,
          message: 'MP4 created and ready to download.',
          outputBytes: mp4Blob.size,
          downloadHref,
          etaText: '',
        });
        return;
      }

      updateQueueItem(itemId, {
        status: 'converted',
        stage: 'converted',
        transferProgress: 0,
        convertProgress: 100,
        progress: 72,
        message: 'Converted. Waiting for upload slot.',
        etaText: '',
        convertedBlob: mp4Blob,
        outputBytes: mp4Blob.size,
      });
    } catch (itemError) {
      updateQueueItem(itemId, {
        status: 'error',
        stage: 'error',
        message: 'Conversion failed.',
        error: getErrorMessage(itemError, 'Queue item failed.'),
        etaText: '',
      });
    } finally {
      delete phaseRef.current[itemId];
      delete conversionStartedAtRef.current[itemId];
    }
  }

  async function uploadConvertedQueueItem(itemId) {
    const item = queueRef.current.find((candidate) => candidate.id === itemId);
    if (!item || !item.convertedBlob) return;

    setActiveItemId(itemId);
    updateQueueItem(itemId, {
      status: 'running',
      stage: 'transferring',
      transferProgress: 0,
      progress: 72,
      message: 'Sending converted MP4 to upload service.',
    });

    const jobId = await sendClientMp4ToYoutube(item.convertedBlob, itemId, item);
    updateQueueItem(itemId, { convertedBlob: null });
    await subscribeToYoutubeJob(jobId, itemId);
  }

  async function sendClientMp4ToYoutube(mp4Blob, itemId, itemMeta) {
    const { uploadId } = await postJson('/api/jobs/client-youtube/uploads', {
      fileName: `${slugifyTitle(itemMeta.title)}.mp4`,
      fileSize: mp4Blob.size,
      title: itemMeta.title,
      description: itemMeta.description,
      privacyStatus: itemMeta.privacyStatus,
    });

    let uploadedBytes = 0;
    let chunkIndex = 0;
    updateQueueItem(itemId, { transferProgress: 1 });

    while (uploadedBytes < mp4Blob.size) {
      const start = uploadedBytes;
      const end = Math.min(start + CLIENT_YOUTUBE_CHUNK_BYTES, mp4Blob.size);
      const chunk = mp4Blob.slice(start, end, 'video/mp4');

      const response = await fetch(
        `${API_URL}/api/jobs/client-youtube/uploads/${uploadId}/chunks?index=${chunkIndex}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${end - 1}/${mp4Blob.size}`,
          },
          body: chunk,
        },
      );

      if (!response.ok) {
        const data = await readJsonResponse(response);
        throw new Error(data.error || 'Could not send the converted MP4 chunk.');
      }

      uploadedBytes = end;
      chunkIndex += 1;
      const percent = Math.max(1, Math.round((uploadedBytes / mp4Blob.size) * 100));
      updateQueueItem(itemId, {
        stage: 'transferring',
        transferProgress: percent,
        progress: Math.min(82, 72 + Math.round(percent * 0.1)),
        message: `Sending converted MP4 ${percent}%`,
      });
    }

    const data = await postJson(`/api/jobs/client-youtube/uploads/${uploadId}/complete`, {});
    updateQueueItem(itemId, { transferProgress: 100 });
    return data.jobId;
  }

  async function subscribeToYoutubeJob(jobId, itemId) {
    eventSourceRef.current?.close();

    await new Promise((resolve, reject) => {
      const source = new EventSource(`${API_URL}/api/jobs/${jobId}/events`, {
        withCredentials: true,
      });
      eventSourceRef.current = source;

      source.addEventListener('job', (event) => {
        const nextJob = JSON.parse(event.data);
        updateQueueItem(itemId, {
          status: nextJob.status,
          stage: nextJob.stage,
          progress: nextJob.progress || 0,
          convertProgress: nextJob.convertProgress || 100,
          uploadProgress: nextJob.uploadProgress || 0,
          message: nextJob.message || '',
          error: nextJob.error || '',
          youtubeUrl: nextJob.youtubeUrl || '',
          youtubeVideoId: nextJob.youtubeVideoId || '',
          outputBytes: nextJob.outputBytes || 0,
        });

        if (nextJob.status === 'completed') {
          source.close();
          resolve();
          return;
        }
        if (nextJob.status === 'error' || nextJob.status === 'cancelled') {
          source.close();
          reject(new Error(nextJob.error || 'YouTube upload failed.'));
        }
      });

      source.onerror = () => {
        source.close();
        reject(new Error('Realtime connection lost during YouTube upload.'));
      };
    });
  }

  function updateQueueItem(id, patch) {
    setQueueItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, ...patch };
      }),
    );
  }

  function setQuickMode(mode) {
    setEditorMode(mode);
    setView('studio');
  }

  const canAddItem = Boolean(editorMp3File) && !isQueueRunning;
  const canStartQueue = queueItems.some((item) => item.status === 'queued') && !isQueueRunning;
  const visibleError = error || formatJobError(activeItem?.error);

  return (
    <main className="min-h-screen">
      <div className="container py-5 sm:py-8">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-card">
              <FileAudio className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-normal sm:text-2xl">MP3 to MP4 Studio</h1>
              <p className="text-sm text-muted-foreground">Queue, convert, and publish in order.</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <Badge variant={activeStatus.variant}>{activeStatus.label}</Badge>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <Sun className="size-4 text-muted-foreground" aria-hidden="true" />
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                aria-label="Toggle dark mode"
              />
              <Moon className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
        </header>

        <Tabs value={view} onValueChange={setView} className="space-y-5">
          <TabsList className="grid w-full grid-cols-3 sm:w-[420px]">
            <TabsTrigger value="studio">
              <FileAudio aria-hidden="true" />
              Studio
            </TabsTrigger>
            <TabsTrigger value="docs">
              <BookOpenText aria-hidden="true" />
              Docs
            </TabsTrigger>
            <TabsTrigger value="donate">
              <HeartHandshake aria-hidden="true" />
              Donate
            </TabsTrigger>
          </TabsList>

          <TabsContent value="studio" className="space-y-5">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <div className="space-y-5">
                {health.checked && !health.ok && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Backend needs attention</p>
                      <p className="mt-1 text-amber-700 dark:text-amber-200/80">{formatJobError(health.error)}</p>
                    </div>
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Add Queue Item</CardTitle>
                    <CardDescription>
                      Convert all items in parallel. YouTube uploads run one-by-one in queue order.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                      <p className="text-sm font-semibold">Shared cover (optional)</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Use one cover for every queue item, or leave empty to generate a plain background.
                      </p>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <FileDrop
                          accept="image/png,image/jpeg,image/webp"
                          file={sharedCoverFile}
                          icon={Image}
                          label="Shared cover"
                          previewUrl={sharedCoverPreviewUrl}
                          onChange={setSharedCoverFile}
                        />
                        <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 accent-[hsl(var(--primary))]"
                            checked={useSharedCover}
                            onChange={(event) => setUseSharedCover(event.target.checked)}
                          />
                          <span className="text-sm text-muted-foreground">
                            Apply shared cover to all queue items when an item-specific cover is not selected.
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <FileDrop
                        accept="audio/mpeg,audio/mp3"
                        file={editorMp3File}
                        icon={FileAudio}
                        label="MP3 file"
                        onChange={setEditorMp3File}
                      />
                      <FileDrop
                        accept="image/png,image/jpeg,image/webp"
                        file={editorImageFile}
                        icon={Image}
                        label="Cover image (optional)"
                        previewUrl={editorImagePreviewUrl}
                        onChange={setEditorImageFile}
                      />
                    </div>

                    <Tabs value={editorMode} onValueChange={setQuickMode}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="download">
                          <Download aria-hidden="true" />
                          Download
                        </TabsTrigger>
                        <TabsTrigger value="youtube">
                          <TvMinimalPlay aria-hidden="true" />
                          YouTube
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {editorMode === 'youtube' && (
                      <div className="grid gap-4">
                        <div className="rounded-lg border border-border bg-muted/40 p-4">
                          {youtube.connected ? (
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-center gap-3">
                                <ChannelAvatar channel={youtube.channel} />
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                                    Selected channel
                                  </p>
                                  <p className="truncate text-sm font-semibold">
                                    {youtube.channel?.title || 'YouTube channel selected'}
                                  </p>
                                  <p className="truncate text-sm text-muted-foreground">
                                    {youtube.channel?.customUrl || youtube.channel?.id || 'Ready for upload'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" onClick={changeYoutubeChannel}>
                                  <TvMinimalPlay aria-hidden="true" />
                                  Change channel
                                </Button>
                                <Button type="button" variant="ghost" onClick={disconnectYoutube}>
                                  Disconnect
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold">Login with YouTube</p>
                                <p className="text-sm text-muted-foreground">
                                  {youtube.configured
                                    ? 'Google will ask which account or channel should receive uploads.'
                                    : 'Google OAuth environment variables are missing.'}
                                </p>
                              </div>
                              <Button type="button" onClick={loginWithYoutube} disabled={!youtube.configured}>
                                <TvMinimalPlay aria-hidden="true" />
                                Login with YouTube
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="item-title">Title</Label>
                            <Input
                              id="item-title"
                              value={editorTitle}
                              onChange={(event) => setEditorTitle(event.target.value)}
                              maxLength={100}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="item-privacy">Privacy</Label>
                            <select
                              id="item-privacy"
                              value={editorPrivacyStatus}
                              onChange={(event) => setEditorPrivacyStatus(event.target.value)}
                              className="flex h-10 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="private">Private</option>
                              <option value="unlisted">Unlisted</option>
                              <option value="public">Public</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="item-description">Description</Label>
                          <Textarea
                            id="item-description"
                            value={editorDescription}
                            onChange={(event) => setEditorDescription(event.target.value)}
                            maxLength={5000}
                          />
                        </div>
                      </div>
                    )}

                    {editorMode === 'download' && (
                      <div className="rounded-lg border border-border bg-muted/40 p-4">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                          <p className="text-sm font-medium">
                            Browser conversion keeps this item local and gives you a direct MP4 download.
                          </p>
                        </div>
                      </div>
                    )}

                    <Button type="button" onClick={addQueueItem} disabled={!canAddItem} className="w-full">
                      <Plus aria-hidden="true" />
                      Add Item to Queue
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Queue Order</CardTitle>
                    <CardDescription>
                      Drag-like controls: move up/down to set which item converts first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!queueItems.length && (
                      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                        Queue is empty. Add your first item above.
                      </div>
                    )}
                    {queueItems.map((item, index) => (
                      <QueueItemRow
                        key={item.id}
                        item={item}
                        index={index}
                        isActive={item.id === activeItemId}
                        canMoveUp={index > 0}
                        canMoveDown={index < queueItems.length - 1}
                        lockControls={isQueueRunning}
                        onSelect={() => setActiveItemId(item.id)}
                        onMoveUp={() => moveQueueItem(item.id, 'up')}
                        onMoveDown={() => moveQueueItem(item.id, 'down')}
                        onRemove={() => removeQueueItem(item.id)}
                      />
                    ))}
                  </CardContent>
                </Card>
              </div>

              <aside className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Realtime Progress</CardTitle>
                    <CardDescription>{activeItem?.message || 'Idle'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ProgressRow
                      icon={UploadCloud}
                      label="Sending MP4"
                      value={activeItem?.transferProgress || 0}
                      active={activeItem?.stage === 'transferring'}
                    />
                    <ProgressRow
                      icon={FileAudio}
                      label="Converting"
                      value={activeItem?.convertProgress || 0}
                      active={activeItem?.stage === 'converting'}
                      detail={activeItem?.etaText}
                    />
                    <ProgressRow
                      icon={TvMinimalPlay}
                      label="Uploading"
                      value={activeItem?.uploadProgress || 0}
                      active={activeItem?.stage === 'uploading'}
                    />

                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold">Overall</span>
                        <span className="text-muted-foreground">{Math.round(activeItem?.progress || 0)}%</span>
                      </div>
                      <Progress value={activeItem?.progress || 0} />
                    </div>

                    {visibleError && (
                      <div
                        role="alert"
                        className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                      >
                        {visibleError}
                      </div>
                    )}

                    {notice && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                        {notice}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <Button type="button" onClick={startQueue} disabled={!canStartQueue} size="lg">
                        {isQueueRunning ? (
                          <Loader2 className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Play aria-hidden="true" />
                        )}
                        Start Queue
                      </Button>
                      <Button type="button" variant="outline" onClick={clearQueue} disabled={isQueueRunning} size="lg">
                        <Trash2 aria-hidden="true" />
                        Clear Queue
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Queue Results</CardTitle>
                    <CardDescription>Completed items keep their own output links.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {queueItems.filter((item) => item.status === 'completed').length === 0 && (
                      <p className="text-sm text-muted-foreground">No completed items yet.</p>
                    )}
                    {queueItems
                      .filter((item) => item.status === 'completed')
                      .map((item) => (
                        <div key={`${item.id}-result`} className="rounded-lg border border-border p-3">
                          <p className="truncate text-sm font-semibold">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.mode === 'youtube' ? 'Uploaded to YouTube' : 'Ready to download'}
                          </p>
                          <div className="mt-3">
                            {item.mode === 'youtube' && item.youtubeUrl ? (
                              <Button asChild variant="outline" className="w-full">
                                <a href={item.youtubeUrl} target="_blank" rel="noreferrer">
                                  <ExternalLink aria-hidden="true" />
                                  Open YouTube Video
                                </a>
                              </Button>
                            ) : (
                              item.downloadHref && (
                                <Button asChild variant="outline" className="w-full">
                                  <a href={item.downloadHref} download={`${slugifyTitle(item.title)}.mp4`}>
                                    <Download aria-hidden="true" />
                                    Download MP4
                                  </a>
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              </aside>
            </section>
          </TabsContent>

          <TabsContent value="docs">
            <Card>
              <CardHeader>
                <CardTitle>How to Use / วิธีใช้งาน</CardTitle>
                <CardDescription>Quick flow for batch conversion and YouTube queue upload.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <DocStep
                  number={1}
                  title="Add Files Per Item"
                  titleTh="เพิ่มไฟล์ในแต่ละรายการ"
                  body="Choose one MP3 and optional cover image, set destination mode, then click Add Item to Queue."
                  bodyTh="เลือก MP3 และรูปปก (ไม่บังคับ) เลือกปลายทาง แล้วกด Add Item to Queue"
                />
                <DocStep
                  number={2}
                  title="Set Unique YouTube Metadata"
                  titleTh="ตั้งค่าข้อมูล YouTube แยกรายการ"
                  body="When mode is YouTube, set Title, Description, and Privacy for that specific queue item."
                  bodyTh="ถ้าเลือกโหมด YouTube ให้กำหนด Title, Description และ Privacy แยกสำหรับรายการนั้น"
                />
                <DocStep
                  number={3}
                  title="Arrange Processing Order"
                  titleTh="จัดลำดับการประมวลผล"
                  body="Use Up/Down controls in Queue Order. The top item runs first."
                  bodyTh="ใช้ปุ่มขึ้น/ลงใน Queue Order โดยรายการบนสุดจะรันก่อน"
                />
                <DocStep
                  number={4}
                  title="Start Queue"
                  titleTh="เริ่มคิว"
                  body="Click Start Queue. Conversion runs in parallel, while YouTube uploads continue one-by-one."
                  bodyTh="กด Start Queue ระบบจะแปลงพร้อมกันหลายรายการ และอัปโหลด YouTube ทีละรายการตามลำดับ"
                />
                <DocStep
                  number={5}
                  title="Review Outputs"
                  titleTh="ตรวจผลลัพธ์"
                  body="Download-mode items show MP4 buttons. YouTube-mode items show direct video links."
                  bodyTh="รายการโหมด Download จะมีปุ่มดาวน์โหลด MP4 และโหมด YouTube จะมีลิงก์วิดีโอโดยตรง"
                />

                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="font-semibold">Notes / หมายเหตุ</p>
                  <p className="mt-2 text-muted-foreground">
                    Browser conversion can be heavy on memory. For best stability, keep one browser tab active while queue is running.
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    การแปลงบนเบราว์เซอร์ใช้หน่วยความจำค่อนข้างสูง เพื่อความเสถียรให้เปิดแท็บนี้ไว้ระหว่างรันคิว
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="donate">
            <Card>
              <CardHeader>
                <CardTitle>Donate</CardTitle>
                <CardDescription>Support future improvements of MP3 to MP4 Studio.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="font-semibold">Why support matters</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Donations help pay for infrastructure, security updates, and continuous UX improvements.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <img
                      src="https://promptpay.io/0956790178.png"
                      alt="PromptPay QR 0956790178"
                      className="mx-auto w-full max-w-[180px] rounded-md border border-border bg-white p-2"
                    />
                    <p className="mt-3 text-center text-xs text-muted-foreground">Scan to donate via PromptPay</p>
                  </div>
                  <DonateMethod
                    title="PromptPay"
                    value="0956790178"
                    hint="Name: วีระพล ขอร้อง"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DonateMethod
                    title="PayPal"
                    value="https://paypal.me/50wallet"
                    hint="Optional additional channel."
                  />
                  <DonateMethod
                    title="Tipme"
                    value="https://tipme.in.th/9ab9153140370a5811370460"
                    hint="Thai tipping channel."
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function FileDrop({ accept, file, icon: Icon, label, onChange, previewUrl }) {
  const inputRef = useRef(null);

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={cn(
        'group flex min-h-48 cursor-pointer flex-col justify-between rounded-lg border border-dashed border-border bg-muted/35 p-4 text-left transition-colors duration-200 hover:border-primary/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        previewUrl && 'bg-cover bg-center',
      )}
      style={
        previewUrl
          ? { backgroundImage: `linear-gradient(rgba(2, 6, 23, .2), rgba(2, 6, 23, .45)), url(${previewUrl})` }
          : undefined
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <div className="flex items-center justify-between">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-background/90">
          <Icon className="size-5 text-primary" aria-hidden="true" />
        </div>
        {file && <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />}
      </div>
      <div>
        <p className={cn('font-semibold', previewUrl && 'text-white')}>{label}</p>
        <p className={cn('mt-1 text-sm text-muted-foreground', previewUrl && 'text-white/80')}>
          {file ? `${file.name} - ${formatBytes(file.size)}` : 'Click to select file'}
        </p>
      </div>
    </button>
  );
}

function QueueItemRow({
  item,
  index,
  isActive,
  canMoveUp,
  canMoveDown,
  lockControls,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect();
      }}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        isActive ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {index + 1}. {item.title}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {item.mp3File?.name || 'MP3'} / {item.imageFile?.name || 'No cover'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {item.mode === 'youtube' ? 'YouTube upload' : 'Device download'} / {item.message}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              onMoveUp();
            }}
            disabled={!canMoveUp || lockControls}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              onMoveDown();
            }}
            disabled={!canMoveDown || lockControls}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            disabled={lockControls}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="mt-3">
        <Progress value={item.progress || 0} />
      </div>
      {item.error && <p className="mt-2 text-xs text-destructive">{item.error}</p>}
    </div>
  );
}

function ProgressRow({ icon: Icon, label, value, active, detail }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn('size-4 shrink-0 text-muted-foreground', active && 'text-primary')}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold">{label}</span>
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">{Math.round(value)}%</span>
      </div>
      {detail && <p className="mb-3 text-xs font-medium text-muted-foreground">{detail}</p>}
      <Progress value={value} />
    </div>
  );
}

function ChannelAvatar({ channel }) {
  if (channel?.thumbnailUrl) {
    return (
      <img
        src={channel.thumbnailUrl}
        alt={`${channel.title || 'YouTube channel'} avatar`}
        className="size-12 shrink-0 rounded-lg border border-border object-cover"
      />
    );
  }

  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
      <CircleUserRound className="size-5 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

function DonateMethod({ title, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <p className="mt-2 break-all text-sm font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function DocStep({ number, title, titleTh, body, bodyTh }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Step {number}</p>
      <p className="mt-1 font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground">{body}</p>
      {titleTh ? <p className="mt-2 font-semibold">{titleTh}</p> : null}
      {bodyTh ? <p className="mt-1 text-muted-foreground">{bodyTh}</p> : null}
    </div>
  );
}

function cleanupQueueUrls(items) {
  for (const item of items) {
    if (item.downloadHref) URL.revokeObjectURL(item.downloadHref);
    if (item.imagePreviewUrl) URL.revokeObjectURL(item.imagePreviewUrl);
  }
}

function getActiveStatus(isQueueRunning, queueItems) {
  if (isQueueRunning) return { label: 'Working', variant: 'default' };
  if (queueItems.some((item) => item.status === 'error')) return { label: 'Needs attention', variant: 'warning' };
  if (queueItems.length && queueItems.every((item) => item.status === 'completed')) {
    return { label: 'Complete', variant: 'success' };
  }
  return { label: 'Ready', variant: 'secondary' };
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function slugifyTitle(value) {
  return (
    String(value || 'converted-mp3-video')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'converted-mp3-video'
  );
}

function formatJobError(message) {
  if (!message) return '';
  if (message.includes('ENOENT') || message.includes('not recognized')) {
    return 'FFmpeg/FFprobe is not available. Leave FFMPEG_PATH empty to use bundled binaries, or install FFmpeg and set path manually.';
  }
  if (message.includes('Could not read MP3 duration')) {
    return 'Could not read MP3 duration. Try another MP3 file or re-export audio.';
  }
  if (message.includes('Browser FFmpeg')) {
    return 'Browser conversion failed. Try a smaller MP3/image or a browser with more memory.';
  }
  if (message.length > 260) return `${message.slice(0, 260)}...`;
  return message;
}

function getErrorMessage(error, fallback) {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

function getConversionEtaText(percent, startedAt) {
  if (percent < 15 || percent >= 100 || !startedAt) return '';
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  if (elapsedSeconds < 8 || percent <= 2) return '';
  const remainingSeconds = (elapsedSeconds / percent) * (100 - percent);
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return '';
  return `about ${formatDuration(remainingSeconds)} remaining`;
}

function formatDuration(seconds) {
  const roundedSeconds = Math.max(1, Math.round(seconds));
  if (roundedSeconds < 60) return `${roundedSeconds}s`;
  const minutes = Math.floor(roundedSeconds / 60);
  const restSeconds = roundedSeconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes}m ${restSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

async function postJson(pathname, body) {
  const response = await fetch(`${API_URL}${pathname}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default App;
