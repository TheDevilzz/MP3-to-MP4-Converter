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
  FileText,
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
import { T2SPanel } from './components/T2SPanel';
import { cn } from './lib/utils';
import { convertMp3ImageToMp4 } from './lib/clientFfmpeg';
import generatePromptPayPayload from 'promptpay-qr';
import QRCode from 'qrcode';

const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin);
const CLIENT_YOUTUBE_CHUNK_BYTES = 8 * 1024 * 1024;
const YOUTUBE_CATEGORIES = [
  { id: '1', label: 'Film & Animation' },
  { id: '2', label: 'Autos & Vehicles' },
  { id: '10', label: 'Music' },
  { id: '15', label: 'Pets & Animals' },
  { id: '17', label: 'Sports' },
  { id: '19', label: 'Travel & Events' },
  { id: '20', label: 'Gaming' },
  { id: '22', label: 'People & Blogs' },
  { id: '23', label: 'Comedy' },
  { id: '24', label: 'Entertainment' },
  { id: '25', label: 'News & Politics' },
  { id: '26', label: 'Howto & Style' },
  { id: '27', label: 'Education' },
  { id: '28', label: 'Science & Technology' },
];

const UI_TEXT = {
  th: {
    appSubtitle: 'จัดคิว แปลงไฟล์ และเผยแพร่ตามลำดับ',
    tabStudio: 'สตูดิโอ',
    tabDocs: 'คู่มือ',
    tabDonate: 'สนับสนุน',
    backendNeedsAttention: 'Backend ต้องตรวจสอบ',
    addQueueTitle: 'เพิ่มรายการเข้าคิว',
    addQueueDesc: 'แปลงหลายรายการพร้อมกัน และอัปโหลด YouTube ทีละรายการตามคิว',
    sharedCoverTitle: 'รูปปกร่วม (ไม่บังคับ)',
    sharedCoverDesc: 'ใช้รูปเดียวกับทุกคิว หรือเว้นว่างเพื่อใช้พื้นหลังเรียบ',
    sharedCoverApply: 'ใช้รูปปกร่วมเมื่อรายการนั้นไม่ได้เลือกรูปปกเฉพาะ',
    mp3File: 'ไฟล์ MP3',
    coverOptional: 'รูปปก (ไม่บังคับ)',
    download: 'ดาวน์โหลด',
    selectedChannel: 'ช่องที่เลือก',
    channelSelected: 'เลือกช่อง YouTube แล้ว',
    readyForUpload: 'พร้อมอัปโหลด',
    changeChannel: 'เปลี่ยนช่อง',
    disconnect: 'ยกเลิกการเชื่อมต่อ',
    loginWithYoutube: 'เข้าสู่ระบบด้วย YouTube',
    loginDesc: 'Google จะให้เลือกบัญชี/ช่องที่ต้องการอัปโหลด',
    oauthMissing: 'ยังไม่ได้ตั้งค่า Google OAuth environment variables',
    title: 'ชื่อคลิป',
    privacy: 'การมองเห็น',
    category: 'หมวดหมู่',
    playlist: 'เพลย์ลิสต์',
    noPlaylist: 'ไม่ใส่เพลย์ลิสต์ (อัปโหลดอย่างเดียว)',
    playlistFoundSuffix: 'เพลย์ลิสต์ในช่องนี้',
    connectYoutubeForPlaylist: 'เชื่อม YouTube ก่อนเพื่อโหลดเพลย์ลิสต์',
    schedulePublish: 'ตั้งเวลาเผยแพร่บน YouTube',
    publishAt: 'เผยแพร่เมื่อ',
    scheduleHint: 'วิดีโอที่ตั้งเวลาจะถูกอัปเป็น Private ก่อน และเปิดตามเวลาที่เลือก',
    description: 'คำอธิบาย',
    downloadModeHint: 'แปลงในเบราว์เซอร์และดาวน์โหลด MP4 ได้ทันที ไฟล์ไม่ถูกเก็บถาวรบนเซิร์ฟเวอร์',
    addItem: 'เพิ่มรายการเข้าคิว',
    queueOrderTitle: 'ลำดับคิว',
    queueOrderDesc: 'ใช้ปุ่มขึ้น/ลงเพื่อกำหนดว่าไฟล์ไหนแปลงก่อน',
    queueEmpty: 'คิวยังว่าง เริ่มจากเพิ่มรายการแรกด้านบน',
    realtimeTitle: 'ความคืบหน้าแบบเรียลไทม์',
    idle: 'ยังไม่เริ่ม',
    sendingMp4: 'ส่งไฟล์ MP4',
    converting: 'กำลังแปลง',
    uploading: 'กำลังอัปโหลด',
    overall: 'รวมทั้งหมด',
    startQueue: 'เริ่มคิว',
    clearQueue: 'ล้างคิว',
    queueResultsTitle: 'ผลลัพธ์คิว',
    queueResultsDesc: 'แต่ละรายการที่เสร็จแล้วจะมีลิงก์ผลลัพธ์ของตัวเอง',
    noCompleted: 'ยังไม่มีรายการที่เสร็จ',
    uploadedToYoutube: 'อัปโหลดไป YouTube แล้ว',
    readyToDownload: 'พร้อมดาวน์โหลด',
    openYoutubeVideo: 'เปิดวิดีโอบน YouTube',
    downloadMp4: 'ดาวน์โหลด MP4',
    docsTitle: 'วิธีใช้งาน',
    docsDesc: 'ขั้นตอนย่อสำหรับแปลงไฟล์และอัปโหลด YouTube แบบคิว',
    notes: 'หมายเหตุ',
    notesEn: 'Browser conversion can be memory-intensive. Keep this tab open while queue is running.',
    notesTh: 'การแปลงบนเบราว์เซอร์ใช้หน่วยความจำค่อนข้างสูง ควรเปิดแท็บนี้ค้างไว้ระหว่างประมวลผล',
    donateTitle: 'สนับสนุนโปรเจกต์',
    donateDesc: 'ช่วยสนับสนุนค่าเซิร์ฟเวอร์และการพัฒนาฟีเจอร์ใหม่',
    supportWhy: 'ทำไมการสนับสนุนจึงสำคัญ',
    supportBody:
      'ทุกการสนับสนุนช่วยค่าโครงสร้างพื้นฐาน ความปลอดภัย และการปรับปรุง UX อย่างต่อเนื่อง',
    scanPromptPay: 'สแกนเพื่อโดเนตผ่าน PromptPay',
    accountName: 'ชื่อบัญชี: วีระพล ขอร้อง',
    optionalChannel: 'ช่องทางเสริมเพิ่มเติม',
    thaiTipChannel: 'ช่องทางทิปสำหรับผู้ใช้ในไทย',
    fileDropHint: 'คลิกหรือวางไฟล์ที่นี่',
  },
  en: {
    appSubtitle: 'Queue, convert, and publish in order.',
    tabStudio: 'Studio',
    tabDocs: 'Docs',
    tabDonate: 'Donate',
    backendNeedsAttention: 'Backend needs attention',
    addQueueTitle: 'Add Queue Item',
    addQueueDesc: 'Convert all items in parallel. YouTube uploads run one-by-one in queue order.',
    sharedCoverTitle: 'Shared cover (optional)',
    sharedCoverDesc: 'Use one cover for every queue item, or leave empty to generate a plain background.',
    sharedCoverApply: 'Apply shared cover when item-specific cover is not selected.',
    mp3File: 'MP3 file',
    coverOptional: 'Cover image (optional)',
    download: 'Download',
    selectedChannel: 'Selected channel',
    channelSelected: 'YouTube channel selected',
    readyForUpload: 'Ready for upload',
    changeChannel: 'Change channel',
    disconnect: 'Disconnect',
    loginWithYoutube: 'Login with YouTube',
    loginDesc: 'Google will ask which account or channel should receive uploads.',
    oauthMissing: 'Google OAuth environment variables are missing.',
    title: 'Title',
    privacy: 'Privacy',
    category: 'Category',
    playlist: 'Playlist',
    noPlaylist: 'No playlist (upload only)',
    playlistFoundSuffix: 'playlist(s) found on this channel.',
    connectYoutubeForPlaylist: 'Connect YouTube to load playlists.',
    schedulePublish: 'Schedule publish on YouTube',
    publishAt: 'Publish at',
    scheduleHint: 'Scheduled uploads are sent as private and become public at your chosen time.',
    description: 'Description',
    downloadModeHint: 'Browser conversion keeps this item local and gives you a direct MP4 download.',
    addItem: 'Add Item to Queue',
    queueOrderTitle: 'Queue Order',
    queueOrderDesc: 'Drag-like controls: move up/down to set which item converts first.',
    queueEmpty: 'Queue is empty. Add your first item above.',
    realtimeTitle: 'Realtime Progress',
    idle: 'Idle',
    sendingMp4: 'Sending MP4',
    converting: 'Converting',
    uploading: 'Uploading',
    overall: 'Overall',
    startQueue: 'Start Queue',
    clearQueue: 'Clear Queue',
    queueResultsTitle: 'Queue Results',
    queueResultsDesc: 'Completed items keep their own output links.',
    noCompleted: 'No completed items yet.',
    uploadedToYoutube: 'Uploaded to YouTube',
    readyToDownload: 'Ready to download',
    openYoutubeVideo: 'Open YouTube Video',
    downloadMp4: 'Download MP4',
    docsTitle: 'How to Use',
    docsDesc: 'Quick flow for batch conversion and YouTube queue upload.',
    notes: 'Notes',
    notesEn: 'Browser conversion can be memory-intensive. Keep this tab open while queue is running.',
    notesTh: 'การแปลงบนเบราว์เซอร์ใช้หน่วยความจำค่อนข้างสูง ควรเปิดแท็บนี้ค้างไว้ระหว่างประมวลผล',
    donateTitle: 'Donate',
    donateDesc: 'Support future improvements of MP3 to MP4 Studio.',
    supportWhy: 'Why support matters',
    supportBody: 'Donations help pay for infrastructure, security updates, and continuous UX improvements.',
    scanPromptPay: 'Scan to donate via PromptPay',
    accountName: 'Account name: วีระพล ขอร้อง',
    optionalChannel: 'Optional additional channel.',
    thaiTipChannel: 'Thai tipping channel.',
    fileDropHint: 'Click or drag file here',
  },
};

function App() {
  const eventSourceRef = useRef(null);
  const queueRef = useRef([]);
  const phaseRef = useRef({});
  const conversionStartedAtRef = useRef({});
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [locale, setLocale] = useState(() => localStorage.getItem('ui-locale') || 'th');
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
  const [editorCategoryId, setEditorCategoryId] = useState('22');
  const [editorPlaylistId, setEditorPlaylistId] = useState('');
  const [editorScheduleEnabled, setEditorScheduleEnabled] = useState(false);
  const [editorScheduledAt, setEditorScheduledAt] = useState('');

  const [queueItems, setQueueItems] = useState([]);
  const [activeItemId, setActiveItemId] = useState('');
  const [isQueueRunning, setIsQueueRunning] = useState(false);

  const [youtube, setYoutube] = useState({
    configured: false,
    connected: false,
    channel: null,
  });
  const [youtubePlaylists, setYoutubePlaylists] = useState([]);
  const [health, setHealth] = useState({ checked: false, ok: false, ffmpeg: false });
  const [promptPayQrDataUrl, setPromptPayQrDataUrl] = useState('');
  const [notice, setNotice] = useState(() =>
    initialQuery.get('youtube') === 'connected' ? 'YouTube connected.' : '',
  );
  const [error, setError] = useState(() =>
    initialQuery.get('youtube') === 'error'
      ? initialQuery.get('message') || 'YouTube connection failed.'
      : '',
  );

  const activeItem = queueItems.find((item) => item.id === activeItemId) || null;
  const t = UI_TEXT[locale] || UI_TEXT.en;
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
    localStorage.setItem('ui-locale', locale);
  }, [locale]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const payload = generatePromptPayPayload('0956790178');
        const qrDataUrl = await QRCode.toDataURL(payload, {
          margin: 1,
          width: 380,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });
        if (active) setPromptPayQrDataUrl(qrDataUrl);
      } catch {
        if (active) setPromptPayQrDataUrl('');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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
        if (active) {
          setYoutube(data);
          if (data.connected) loadYoutubePlaylists().catch(() => {});
        }
      })
      .catch(() => {
        if (active) {
          setYoutube({ configured: false, connected: false, channel: null });
          setYoutubePlaylists([]);
        }
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
    setYoutubePlaylists([]);
    setEditorPlaylistId('');
  }

  async function loadYoutubePlaylists() {
    const response = await fetch(`${API_URL}/api/youtube/playlists`, {
      credentials: 'include',
    });
    const data = await readJsonResponse(response);
    if (!response.ok) {
      setYoutubePlaylists([]);
      throw new Error(data.error || 'Could not load YouTube playlists.');
    }
    setYoutubePlaylists(Array.isArray(data.playlists) ? data.playlists : []);
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
    if (editorMode === 'youtube' && editorScheduleEnabled && !editorScheduledAt) {
      setError('Please choose a publish date/time when scheduling is enabled.');
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
      categoryId: editorCategoryId,
      playlistId: editorPlaylistId || null,
      scheduleEnabled: editorScheduleEnabled,
      scheduledAt: editorScheduleEnabled ? toIsoDateTime(editorScheduledAt) : null,
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
    setEditorCategoryId('22');
    setEditorPlaylistId('');
    setEditorScheduleEnabled(false);
    setEditorScheduledAt('');
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

      const conversionPromise = Promise.all(queuedIds.map((id) => processQueueConversion(id)));
      await processYoutubeUploadsInQueueOrder(queuedIds);
      await conversionPromise;

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

  async function processYoutubeUploadsInQueueOrder(itemIds) {
    for (const itemId of itemIds) {
      const current = queueRef.current.find((item) => item.id === itemId);
      if (!current || current.mode !== 'youtube') continue;

      const isReady = await waitUntilYoutubeItemReadyForUpload(itemId);
      if (!isReady) continue;

      try {
        await uploadConvertedQueueItem(itemId);
      } catch (uploadError) {
        updateQueueItem(itemId, {
          status: 'error',
          stage: 'error',
          message: 'YouTube upload failed.',
          error: getErrorMessage(uploadError, 'YouTube upload failed.'),
        });
      }
    }
  }

  async function waitUntilYoutubeItemReadyForUpload(itemId) {
    while (true) {
      const current = queueRef.current.find((item) => item.id === itemId);
      if (!current) return false;
      if (current.status === 'error' || current.status === 'cancelled') return false;
      if (current.status === 'converted' && current.convertedBlob) return true;
      await delay(250);
    }
  }

  async function sendClientMp4ToYoutube(mp4Blob, itemId, itemMeta) {
    const { uploadId } = await postJson('/api/jobs/client-youtube/uploads', {
      fileName: `${slugifyTitle(itemMeta.title)}.mp4`,
      fileSize: mp4Blob.size,
      title: itemMeta.title,
      description: itemMeta.description,
      privacyStatus: itemMeta.privacyStatus,
      categoryId: itemMeta.categoryId,
      playlistId: itemMeta.playlistId,
      scheduleEnabled: itemMeta.scheduleEnabled,
      scheduledAt: itemMeta.scheduledAt,
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
              <p className="text-sm text-muted-foreground">{t.appSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <Badge variant={activeStatus.variant}>{activeStatus.label}</Badge>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <Label htmlFor="ui-locale" className="text-xs text-muted-foreground">
                UI
              </Label>
              <select
                id="ui-locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="th">TH</option>
                <option value="en">EN</option>
              </select>
            </div>
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
          <TabsList className="grid w-full grid-cols-4 sm:w-[560px]">
            <TabsTrigger value="studio">
              <FileAudio aria-hidden="true" />
              {t.tabStudio}
            </TabsTrigger>
            <TabsTrigger value="t2s">
              <FileText aria-hidden="true" />
              T2S
            </TabsTrigger>
            <TabsTrigger value="docs">
              <BookOpenText aria-hidden="true" />
              {t.tabDocs}
            </TabsTrigger>
            <TabsTrigger value="donate">
              <HeartHandshake aria-hidden="true" />
              {t.tabDonate}
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
                      <p className="font-semibold">{t.backendNeedsAttention}</p>
                      <p className="mt-1 text-amber-700 dark:text-amber-200/80">{formatJobError(health.error)}</p>
                    </div>
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>{t.addQueueTitle}</CardTitle>
                    <CardDescription>{t.addQueueDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                      <p className="text-sm font-semibold">{t.sharedCoverTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t.sharedCoverDesc}</p>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <FileDrop
                          accept="image/png,image/jpeg,image/webp"
                          file={sharedCoverFile}
                          icon={Image}
                          label={t.sharedCoverTitle}
                          hint={t.fileDropHint}
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
                            {t.sharedCoverApply}
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <FileDrop
                        accept="audio/mpeg,audio/mp3"
                        file={editorMp3File}
                        icon={FileAudio}
                        label={t.mp3File}
                        hint={t.fileDropHint}
                        onChange={setEditorMp3File}
                      />
                      <FileDrop
                        accept="image/png,image/jpeg,image/webp"
                        file={editorImageFile}
                        icon={Image}
                        label={t.coverOptional}
                        hint={t.fileDropHint}
                        previewUrl={editorImagePreviewUrl}
                        onChange={setEditorImageFile}
                      />
                    </div>

                    <Tabs value={editorMode} onValueChange={setQuickMode}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="download">
                          <Download aria-hidden="true" />
                          {t.download}
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
                                    {t.selectedChannel}
                                  </p>
                                  <p className="truncate text-sm font-semibold">
                                    {youtube.channel?.title || t.channelSelected}
                                  </p>
                                  <p className="truncate text-sm text-muted-foreground">
                                    {youtube.channel?.customUrl || youtube.channel?.id || t.readyForUpload}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" onClick={changeYoutubeChannel}>
                                  <TvMinimalPlay aria-hidden="true" />
                                  {t.changeChannel}
                                </Button>
                                <Button type="button" variant="ghost" onClick={disconnectYoutube}>
                                  {t.disconnect}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold">{t.loginWithYoutube}</p>
                                <p className="text-sm text-muted-foreground">
                                  {youtube.configured
                                    ? t.loginDesc
                                    : t.oauthMissing}
                                </p>
                              </div>
                              <Button type="button" onClick={loginWithYoutube} disabled={!youtube.configured}>
                                <TvMinimalPlay aria-hidden="true" />
                                {t.loginWithYoutube}
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-2">
                            <Label htmlFor="item-title">{t.title}</Label>
                            <Input
                              id="item-title"
                              value={editorTitle}
                              onChange={(event) => setEditorTitle(event.target.value)}
                              maxLength={100}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="item-privacy">{t.privacy}</Label>
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
                          <div className="space-y-2">
                            <Label htmlFor="item-category">{t.category}</Label>
                            <select
                              id="item-category"
                              value={editorCategoryId}
                              onChange={(event) => setEditorCategoryId(event.target.value)}
                              className="flex h-10 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {YOUTUBE_CATEGORIES.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="item-playlist">{t.playlist}</Label>
                            <select
                              id="item-playlist"
                              value={editorPlaylistId}
                              onChange={(event) => setEditorPlaylistId(event.target.value)}
                              disabled={!youtube.connected}
                              className="flex h-10 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="">{t.noPlaylist}</option>
                              {youtubePlaylists.map((playlist) => (
                                <option key={playlist.id} value={playlist.id}>
                                  {playlist.title}
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                              {youtube.connected
                                ? `${youtubePlaylists.length} ${t.playlistFoundSuffix}`
                                : t.connectYoutubeForPlaylist}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border bg-muted/40 p-4">
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 size-4 accent-[hsl(var(--primary))]"
                              checked={editorScheduleEnabled}
                              onChange={(event) => setEditorScheduleEnabled(event.target.checked)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {t.schedulePublish}
                            </span>
                          </label>
                          {editorScheduleEnabled && (
                            <div className="mt-3 space-y-2">
                              <Label htmlFor="item-scheduled-at">{t.publishAt}</Label>
                              <Input
                                id="item-scheduled-at"
                                type="datetime-local"
                                value={editorScheduledAt}
                                onChange={(event) => setEditorScheduledAt(event.target.value)}
                              />
                              <p className="text-xs text-muted-foreground">
                                {t.scheduleHint}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="item-description">{t.description}</Label>
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
                            {t.downloadModeHint}
                          </p>
                        </div>
                      </div>
                    )}

                    <Button type="button" onClick={addQueueItem} disabled={!canAddItem} className="w-full">
                      <Plus aria-hidden="true" />
                      {t.addItem}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t.queueOrderTitle}</CardTitle>
                    <CardDescription>{t.queueOrderDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!queueItems.length && (
                      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                        {t.queueEmpty}
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
                    <CardTitle>{t.realtimeTitle}</CardTitle>
                    <CardDescription>{activeItem?.message || t.idle}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ProgressRow
                      icon={UploadCloud}
                      label={t.sendingMp4}
                      value={activeItem?.transferProgress || 0}
                      active={activeItem?.stage === 'transferring'}
                    />
                    <ProgressRow
                      icon={FileAudio}
                      label={t.converting}
                      value={activeItem?.convertProgress || 0}
                      active={activeItem?.stage === 'converting'}
                      detail={activeItem?.etaText}
                    />
                    <ProgressRow
                      icon={TvMinimalPlay}
                      label={t.uploading}
                      value={activeItem?.uploadProgress || 0}
                      active={activeItem?.stage === 'uploading'}
                    />

                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold">{t.overall}</span>
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
                        {t.startQueue}
                      </Button>
                      <Button type="button" variant="outline" onClick={clearQueue} disabled={isQueueRunning} size="lg">
                        <Trash2 aria-hidden="true" />
                        {t.clearQueue}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t.queueResultsTitle}</CardTitle>
                    <CardDescription>{t.queueResultsDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {queueItems.filter((item) => item.status === 'completed').length === 0 && (
                      <p className="text-sm text-muted-foreground">{t.noCompleted}</p>
                    )}
                    {queueItems
                      .filter((item) => item.status === 'completed')
                      .map((item) => (
                        <div key={`${item.id}-result`} className="rounded-lg border border-border p-3">
                          <p className="truncate text-sm font-semibold">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.mode === 'youtube' ? t.uploadedToYoutube : t.readyToDownload}
                          </p>
                          <div className="mt-3">
                            {item.mode === 'youtube' && item.youtubeUrl ? (
                              <Button asChild variant="outline" className="w-full">
                                <a href={item.youtubeUrl} target="_blank" rel="noreferrer">
                                  <ExternalLink aria-hidden="true" />
                                  {t.openYoutubeVideo}
                                </a>
                              </Button>
                            ) : (
                              item.downloadHref && (
                                <Button asChild variant="outline" className="w-full">
                                  <a href={item.downloadHref} download={`${slugifyTitle(item.title)}.mp4`}>
                                    <Download aria-hidden="true" />
                                    {t.downloadMp4}
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

          <TabsContent value="t2s">
            <T2SPanel apiUrl={API_URL} locale={locale} />
          </TabsContent>

          <TabsContent value="docs">
            <Card>
              <CardHeader>
                <CardTitle>{t.docsTitle}</CardTitle>
                <CardDescription>{t.docsDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <DocStep
                  number={1}
                  title="Add Files Per Item"
                  titleTh={locale === 'th' ? 'เพิ่มไฟล์ในแต่ละรายการ' : ''}
                  body="Choose one MP3 and optional cover image, set destination mode, then click Add Item to Queue."
                  bodyTh={locale === 'th' ? 'เลือก MP3 และรูปปก (ไม่บังคับ) เลือกปลายทาง แล้วกด Add Item to Queue' : ''}
                />
                <DocStep
                  number={2}
                  title="Set Unique YouTube Metadata"
                  titleTh={locale === 'th' ? 'ตั้งค่าข้อมูล YouTube แยกรายการ' : ''}
                  body="When mode is YouTube, set Title, Description, Privacy, Category, and optional Playlist for that specific queue item."
                  bodyTh={
                    locale === 'th'
                      ? 'ถ้าเลือกโหมด YouTube ให้กำหนด Title, Description, Privacy, Category และ Playlist (ไม่บังคับ) แยกสำหรับรายการนั้น'
                      : ''
                  }
                />
                <DocStep
                  number={3}
                  title="Arrange Processing Order"
                  titleTh={locale === 'th' ? 'จัดลำดับการประมวลผล' : ''}
                  body="Use Up/Down controls in Queue Order. The top item runs first."
                  bodyTh={locale === 'th' ? 'ใช้ปุ่มขึ้น/ลงใน Queue Order โดยรายการบนสุดจะรันก่อน' : ''}
                />
                <DocStep
                  number={4}
                  title="Start Queue"
                  titleTh={locale === 'th' ? 'เริ่มคิว' : ''}
                  body="Click Start Queue. Conversion runs in parallel, while YouTube uploads continue one-by-one."
                  bodyTh={
                    locale === 'th'
                      ? 'กด Start Queue ระบบจะแปลงพร้อมกันหลายรายการ และอัปโหลด YouTube ทีละรายการตามลำดับ'
                      : ''
                  }
                />
                <DocStep
                  number={5}
                  title="Review Outputs"
                  titleTh={locale === 'th' ? 'ตรวจผลลัพธ์' : ''}
                  body="Download-mode items show MP4 buttons. YouTube-mode items show direct video links."
                  bodyTh={
                    locale === 'th'
                      ? 'รายการโหมด Download จะมีปุ่มดาวน์โหลด MP4 และโหมด YouTube จะมีลิงก์วิดีโอโดยตรง'
                      : ''
                  }
                />

                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="font-semibold">{t.notes}</p>
                  <p className="mt-2 text-muted-foreground">{t.notesEn}</p>
                  {locale === 'th' ? <p className="mt-2 text-muted-foreground">{t.notesTh}</p> : null}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="donate">
            <Card>
              <CardHeader>
                <CardTitle>{t.donateTitle}</CardTitle>
                <CardDescription>{t.donateDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="font-semibold">{t.supportWhy}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{t.supportBody}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <img
                      src={promptPayQrDataUrl || 'https://promptpay.io/0956790178.png'}
                      alt="PromptPay QR 0956790178"
                      className="mx-auto w-full max-w-[180px] rounded-md border border-border bg-white p-2"
                    />
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      {t.scanPromptPay}
                    </p>
                  </div>
                  <DonateMethod
                    title="PromptPay"
                    value="0956790178"
                    hint={t.accountName}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DonateMethod
                    title="PayPal"
                    value="https://paypal.me/50wallet"
                    hint={t.optionalChannel}
                  />
                  <DonateMethod
                    title="Tipme"
                    value="https://tipme.in.th/9ab9153140370a5811370460"
                    hint={t.thaiTipChannel}
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

function FileDrop({ accept, file, icon: Icon, label, hint, onChange, previewUrl }) {
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function pickFromDrop(event) {
    event.preventDefault();
    setIsDragOver(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (!dropped) return;
    onChange(dropped);
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={pickFromDrop}
      className={cn(
        'group flex min-h-48 cursor-pointer flex-col justify-between rounded-lg border border-dashed border-border bg-muted/35 p-4 text-left transition-colors duration-200 hover:border-primary/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        previewUrl && 'bg-cover bg-center',
        isDragOver && 'border-primary bg-primary/10',
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
          {file ? `${file.name} - ${formatBytes(file.size)}` : hint || 'Click or drag file here'}
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

function toIsoDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
