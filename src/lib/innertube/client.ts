/**
 * Port of Metrolist InnerTube logic to TypeScript.
 * Handles communication with YouTube Music's internal API.
 */

const CLIENTS = {
  ANDROID_MUSIC: {
    clientName: 'ANDROID_MUSIC',
    clientVersion: '6.45.54',
    osName: 'Android',
    osVersion: '14',
    platform: 'MOBILE'
  },
  IOS: {
    clientName: 'IOS',
    clientVersion: '17.33.2',
    osName: 'iOS',
    osVersion: '17.4.1',
    platform: 'MOBILE'
  },
  WEB_REMIX: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240410.01.00',
    osName: 'Windows',
    osVersion: '10.0',
    platform: 'DESKTOP'
  }
};

export async function request(endpoint: string, body: any, client: keyof typeof CLIENTS = 'ANDROID_MUSIC') {
  const c = CLIENTS[client];
  const url = `https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.apps.youtube.music/6.45.54 (Linux; U; Android 14; en_US)',
      'X-Goog-Api-Format-Return-Instruction': 'true',
    },
    body: JSON.stringify({
      ...body,
      context: {
        client: c,
        user: { lockedSafetyMode: false },
      }
    })
  });

  if (!res.ok) throw new Error(`InnerTube Error: ${res.status}`);
  return res.json();
}

export async function getPlayer(videoId: string) {
  // Logic from Metrolist/innertube/src/main/kotlin/com/metrolist/innertube/YouTube.kt
  return request('player', {
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        signatureTimestamp: Math.floor(Date.now() / 1000) - 86400 // Approximation
      }
    }
  }, 'ANDROID_MUSIC');
}
