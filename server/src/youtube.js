import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { config, youtubeScopes } from './config.js';

export const youtubeSessionCookie = 'yt_session';

const oauthStates = new Map();
const youtubeSessions = new Map();
const oauthStateTtlMs = 1000 * 60 * 10;
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;

export function isYoutubeConfigured() {
  return Boolean(
    config.googleClientId &&
      config.googleClientSecret &&
      config.googleRedirectUri,
  );
}

export function createYoutubeAuthUrl() {
  if (!isYoutubeConfigured()) {
    throw new Error('Google OAuth is not configured.');
  }

  cleanupOauthState();
  const state = randomUUID();
  oauthStates.set(state, Date.now());

  const url = createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent select_account',
    scope: youtubeScopes,
    state,
  });

  return { url, state };
}

export async function completeYoutubeOAuth({ code, state }) {
  if (!oauthStates.has(state)) {
    throw new Error('Invalid or expired OAuth state.');
  }

  oauthStates.delete(state);
  const oauth = createOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);
  const channel = await getSelectedYoutubeChannel(oauth);
  const sessionId = randomUUID();
  youtubeSessions.set(sessionId, {
    id: sessionId,
    tokens,
    channel,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return sessionId;
}

export function getYoutubeSession(req) {
  const sessionId = req.cookies?.[youtubeSessionCookie];
  return getYoutubeSessionById(sessionId);
}

export function getYoutubeSessionById(sessionId) {
  if (!sessionId) return null;
  const session = youtubeSessions.get(sessionId);
  if (!session) return null;

  if (Date.now() - session.updatedAt > sessionTtlMs) {
    youtubeSessions.delete(sessionId);
    return null;
  }

  return session;
}

export function disconnectYoutubeSession(req, res) {
  const sessionId = req.cookies?.[youtubeSessionCookie];
  if (sessionId) youtubeSessions.delete(sessionId);
  res.clearCookie(youtubeSessionCookie);
}

export function publicYoutubeSession(session) {
  if (!session) return null;
  return {
    connected: true,
    channel: session.channel || null,
  };
}

export async function uploadVideoToYoutube({
  session,
  filePath,
  title,
  description,
  privacyStatus,
  onProgress,
}) {
  const oauth = createOAuthClient();
  oauth.setCredentials(session.tokens);
  oauth.on('tokens', (tokens) => {
    session.tokens = { ...session.tokens, ...tokens };
    session.updatedAt = Date.now();
  });

  const youtube = google.youtube({ version: 'v3', auth: oauth });
  const fileInfo = await stat(filePath);
  const safePrivacy = ['private', 'unlisted', 'public'].includes(privacyStatus)
    ? privacyStatus
    : 'private';

  let lastProgress = 0;
  const response = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: title || 'Converted MP3 Video',
          description: description || '',
        },
        status: {
          privacyStatus: safePrivacy,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body: fs.createReadStream(filePath),
      },
    },
    {
      onUploadProgress: (event) => {
        const uploaded = event.bytesRead || event.loaded || 0;
        const next = Math.min(
          99,
          Math.max(lastProgress, Math.round((uploaded / fileInfo.size) * 100)),
        );
        lastProgress = next;
        onProgress(next);
      },
    },
  );

  onProgress(100);
  const videoId = response.data.id;
  return {
    videoId,
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
  };
}

async function getSelectedYoutubeChannel(auth) {
  const youtube = google.youtube({ version: 'v3', auth });
  const response = await youtube.channels.list({
    part: ['snippet', 'statistics'],
    mine: true,
    maxResults: 1,
  });
  const channel = response.data.items?.[0];

  if (!channel) {
    throw new Error('No YouTube channel was returned for this login.');
  }

  return {
    id: channel.id,
    title: channel.snippet?.title || 'Selected YouTube channel',
    description: channel.snippet?.description || '',
    customUrl: channel.snippet?.customUrl || '',
    thumbnailUrl:
      channel.snippet?.thumbnails?.default?.url ||
      channel.snippet?.thumbnails?.medium?.url ||
      channel.snippet?.thumbnails?.high?.url ||
      '',
    subscriberCount: channel.statistics?.hiddenSubscriberCount
      ? null
      : channel.statistics?.subscriberCount || null,
    videoCount: channel.statistics?.videoCount || null,
    viewCount: channel.statistics?.viewCount || null,
  };
}

function createOAuthClient() {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );
}

function cleanupOauthState() {
  const now = Date.now();
  for (const [state, createdAt] of oauthStates.entries()) {
    if (now - createdAt > oauthStateTtlMs) oauthStates.delete(state);
  }
}
