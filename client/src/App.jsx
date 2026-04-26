import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  CircleUserRound,
  Download,
  ExternalLink,
  FileAudio,
  Image,
  Loader2,
  Moon,
  Play,
  PlugZap,
  RefreshCcw,
  ShieldCheck,
  Sun,
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

const initialJob = {
  status: 'idle',
  stage: 'idle',
  progress: 0,
  convertProgress: 0,
  uploadProgress: 0,
  message: 'Idle',
};

function App() {
  const eventSourceRef = useRef(null);
  const downloadHrefRef = useRef('');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), []);
  const [mp3File, setMp3File] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [mode, setMode] = useState('download');
  const [title, setTitle] = useState('Converted MP3 Video');
  const [description, setDescription] = useState('');
  const [privacyStatus, setPrivacyStatus] = useState('private');
  const [youtube, setYoutube] = useState({
    configured: false,
    connected: false,
    channel: null,
  });
  const [health, setHealth] = useState({ checked: false, ok: false, ffmpeg: false });
  const [job, setJob] = useState(initialJob);
  const [clientUploadProgress, setClientUploadProgress] = useState(0);
  const [downloadHref, setDownloadHref] = useState('');
  const [notice, setNotice] = useState(() =>
    initialQuery.get('youtube') === 'connected' ? 'YouTube connected.' : '',
  );
  const [error, setError] = useState(() =>
    initialQuery.get('youtube') === 'error'
      ? initialQuery.get('message') || 'YouTube connection failed.'
      : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const imagePreviewUrl = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

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

    const params = new URLSearchParams(window.location.search);
    if (params.has('youtube')) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => {
      active = false;
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    return () => {
      if (downloadHrefRef.current) URL.revokeObjectURL(downloadHrefRef.current);
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

  function startJob() {
    runClientJob();
  }

  async function runClientJob() {
    setError('');
    setNotice('');
    clearDownloadHref();

    if (!mp3File || !imageFile) {
      setError('Please add both MP3 and cover image.');
      return;
    }

    if (mode === 'youtube' && !youtube.connected) {
      setError('Connect YouTube before uploading.');
      return;
    }

    eventSourceRef.current?.close();
    setIsSubmitting(true);
    setClientUploadProgress(0);
    setJob({
      ...initialJob,
      status: 'running',
      stage: 'loading',
      message: 'Loading browser FFmpeg engine.',
    });

    try {
      const mp4Blob = await convertMp3ImageToMp4({
        audioFile: mp3File,
        imageFile,
        onStage: (stage) => {
          if (stage === 'loading') {
            setJob((current) => ({
              ...current,
              stage: 'loading',
              message: 'Loading browser FFmpeg engine.',
            }));
          }
          if (stage === 'preparing') {
            setJob((current) => ({
              ...current,
              stage: 'preparing',
              message: 'Preparing files in browser memory.',
            }));
          }
        },
        onProgress: (percent) => {
          setClientUploadProgress(percent >= 12 ? 100 : Math.round(percent * 8));
          setJob((current) => ({
            ...current,
            status: 'running',
            stage: percent >= 12 ? 'converting' : current.stage,
            convertProgress: percent >= 12 ? percent : 0,
            progress: mode === 'youtube'
              ? Math.min(72, Math.round(percent * 0.72))
              : percent,
            message: percent >= 12
              ? `Converting in browser ${percent}%`
              : 'Loading browser FFmpeg engine.',
          }));
        },
      });

      if (mode === 'download') {
        const href = URL.createObjectURL(mp4Blob);
        setDownloadObjectUrl(href);
        setClientUploadProgress(100);
        setJob({
          ...initialJob,
          status: 'completed',
          stage: 'ready',
          progress: 100,
          convertProgress: 100,
          message: 'Your MP4 was created in this browser.',
          outputBytes: mp4Blob.size,
        });
        setIsSubmitting(false);
        return;
      }

      setJob((current) => ({
        ...current,
        stage: 'transferring',
        convertProgress: 100,
        progress: 72,
        message: 'Sending converted MP4 to the upload service.',
      }));
      setClientUploadProgress(0);
      const jobId = await sendClientMp4ToYoutube(mp4Blob);
      setIsSubmitting(false);
      subscribeToJob(jobId);
    } catch (conversionError) {
      setIsSubmitting(false);
      setError(conversionError.message || 'Browser conversion failed.');
      setJob({
        ...initialJob,
        status: 'error',
        stage: 'error',
        message: 'Browser conversion failed.',
        error: conversionError.message,
      });
    }
  }

  function sendClientMp4ToYoutube(mp4Blob) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('video', mp4Blob, `${slugifyTitle(title)}.mp4`);
      form.append('title', title);
      form.append('description', description);
      form.append('privacyStatus', privacyStatus);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/jobs/client-youtube`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        setClientUploadProgress(percent);
        setJob((current) => ({
          ...current,
          stage: 'transferring',
          progress: Math.min(82, 72 + Math.round(percent * 0.1)),
          message: `Sending converted MP4 ${percent}%`,
        }));
      };

      xhr.onload = () => {
        let data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = {};
        }

        if (xhr.status >= 400) {
          reject(new Error(data.error || 'Could not start YouTube upload.'));
          return;
        }

        setClientUploadProgress(100);
        resolve(data.jobId);
      };

      xhr.onerror = () => {
        reject(new Error('Network error while sending the MP4 to the upload service.'));
      };

      xhr.send(form);
    });
  }

  function subscribeToJob(jobId) {
    eventSourceRef.current?.close();
    const source = new EventSource(`${API_URL}/api/jobs/${jobId}/events`, {
      withCredentials: true,
    });
    eventSourceRef.current = source;

    source.addEventListener('job', (event) => {
      const nextJob = JSON.parse(event.data);
      setJob(nextJob);

      if (['completed', 'error', 'cancelled'].includes(nextJob.status)) {
        source.close();
      }
    });

    source.onerror = () => {
      setError('Realtime connection lost. The job may still be running.');
      source.close();
    };
  }

  function resetWorkbench() {
    eventSourceRef.current?.close();
    clearDownloadHref();
    setJob(initialJob);
    setClientUploadProgress(0);
    setError('');
    setNotice('');
    setIsSubmitting(false);
  }

  function setDownloadObjectUrl(href) {
    clearDownloadHref();
    downloadHrefRef.current = href;
    setDownloadHref(href);
  }

  function clearDownloadHref() {
    if (downloadHrefRef.current) URL.revokeObjectURL(downloadHrefRef.current);
    downloadHrefRef.current = '';
    setDownloadHref('');
  }

  const canStart =
    Boolean(mp3File && imageFile) &&
    !isSubmitting &&
    !['running', 'uploading'].includes(job.status) &&
    !(mode === 'youtube' && !youtube.connected);

  const activeStatus = getActiveStatus(job);
  const visibleError = error || formatJobError(job.error);

  return (
    <main className="min-h-screen">
      <div className="container py-5 sm:py-8">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-card">
              <FileAudio className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-normal sm:text-2xl">
                MP3 to MP4 Studio
              </h1>
              <p className="text-sm text-muted-foreground">Convert, compress, deliver.</p>
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

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="space-y-5">
            {health.checked && !health.ok && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Backend needs attention</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-200/80">
                    {formatJobError(health.error)}
                  </p>
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Source files</CardTitle>
                <CardDescription>MP3 audio and square or landscape cover art.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FileDrop
                  accept="audio/mpeg,audio/mp3"
                  file={mp3File}
                  icon={FileAudio}
                  label="MP3 file"
                  onChange={setMp3File}
                />
                <FileDrop
                  accept="image/png,image/jpeg,image/webp"
                  file={imageFile}
                  icon={Image}
                  label="Cover image"
                  previewUrl={imagePreviewUrl}
                  onChange={setImageFile}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Destination</CardTitle>
                <CardDescription>Choose where the finished MP4 goes.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={mode} onValueChange={setMode}>
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

                  <TabsContent value="download">
                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                        <p className="text-sm font-medium">
                          Temporary files are deleted after the MP4 download starts.
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="youtube">
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
                                  {youtube.channel?.customUrl ||
                                    youtube.channel?.id ||
                                    'Ready for direct upload'}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" onClick={changeYoutubeChannel}>
                                <TvMinimalPlay aria-hidden="true" />
                                Change channel
                              </Button>
                              <Button type="button" variant="ghost" onClick={disconnectYoutube}>
                                <PlugZap aria-hidden="true" />
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
                            <Button
                              type="button"
                              onClick={loginWithYoutube}
                              disabled={!youtube.configured}
                            >
                              <TvMinimalPlay aria-hidden="true" />
                              Login with YouTube
                            </Button>
                          </div>
                        )}
                      </div>

                      {youtube.connected && (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <ChannelMetric
                            label="Videos"
                            value={formatCount(youtube.channel?.videoCount)}
                          />
                          <ChannelMetric
                            label="Subscribers"
                            value={formatCount(youtube.channel?.subscriberCount)}
                          />
                          <ChannelMetric
                            label="Views"
                            value={formatCount(youtube.channel?.viewCount)}
                          />
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="title">Title</Label>
                          <Input
                            id="title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            maxLength={100}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="privacy">Privacy</Label>
                          <select
                            id="privacy"
                            value={privacyStatus}
                            onChange={(event) => setPrivacyStatus(event.target.value)}
                            className="flex h-10 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="private">Private</option>
                            <option value="unlisted">Unlisted</option>
                            <option value="public">Public</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          maxLength={5000}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Realtime progress</CardTitle>
                <CardDescription>{job.message}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ProgressRow
                  icon={UploadCloud}
                  label={job.stage === 'transferring' ? 'Sending MP4' : 'Preparing files'}
                  value={clientUploadProgress}
                  active={['loading', 'preparing', 'transferring'].includes(job.stage)}
                />
                <ProgressRow
                  icon={RefreshCcw}
                  label="Converting"
                  value={job.convertProgress || 0}
                  active={job.stage === 'converting'}
                />
                {mode === 'youtube' && (
                  <ProgressRow
                    icon={TvMinimalPlay}
                    label="Uploading"
                    value={job.uploadProgress || 0}
                    active={job.stage === 'uploading'}
                  />
                )}

                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold">Overall</span>
                    <span className="text-muted-foreground">{Math.round(job.progress || 0)}%</span>
                  </div>
                  <Progress value={job.progress || 0} />
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

                {job.status === 'completed' && (downloadHref || job.downloadUrl) && (
                  <Button asChild className="w-full" size="lg">
                    <a
                      href={downloadHref || `${API_URL}${job.downloadUrl}`}
                      download={`${slugifyTitle(title)}.mp4`}
                    >
                      <Download aria-hidden="true" />
                      Download MP4
                    </a>
                  </Button>
                )}

                {job.status === 'completed' && job.youtubeUrl && (
                  <Button asChild className="w-full" size="lg">
                    <a href={job.youtubeUrl} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden="true" />
                      Open YouTube Video
                    </a>
                  </Button>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" onClick={startJob} disabled={!canStart} size="lg">
                    {isSubmitting || job.status === 'running' ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Play aria-hidden="true" />
                    )}
                    Start
                  </Button>
                  <Button type="button" variant="outline" onClick={resetWorkbench} size="lg">
                    <RefreshCcw aria-hidden="true" />
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <Metric label="Video" value="H.264" />
              <Metric label="Audio" value="AAC 192k" />
              <Metric label="Cleanup" value="Auto" />
            </div>
          </aside>
        </section>
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
      style={previewUrl ? { backgroundImage: `linear-gradient(rgba(2, 6, 23, .2), rgba(2, 6, 23, .45)), url(${previewUrl})` } : undefined}
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

function ProgressRow({ icon: Icon, label, value, active }) {
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
      <Progress value={value} />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
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

function ChannelMetric({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function getActiveStatus(job) {
  if (job.status === 'completed') return { label: 'Complete', variant: 'success' };
  if (job.status === 'error') return { label: 'Needs attention', variant: 'warning' };
  if (['running', 'uploading'].includes(job.status)) return { label: 'Working', variant: 'default' };
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

function formatCount(value) {
  if (value === null || value === undefined || value === '') return 'Hidden';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(number);
}

function formatJobError(message) {
  if (!message) return '';
  if (message.includes('ENOENT') || message.includes('not recognized')) {
    return 'FFmpeg/FFprobe is not available. Leave FFMPEG_PATH empty to use the bundled binaries, or install FFmpeg and set the path manually.';
  }
  if (message.includes('Could not read MP3 duration')) {
    return 'Could not read the MP3 duration. Try another MP3 file or re-export the audio.';
  }
  if (message.includes('Browser FFmpeg')) {
    return 'Browser conversion failed. Try a smaller MP3/image, or use a desktop browser with more memory.';
  }
  if (message.length > 260) {
    return `${message.slice(0, 260)}...`;
  }
  return message;
}

export default App;
