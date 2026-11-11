/**
 * Baca playlist / album / lagu Spotify publik TANPA API key.
 * 1) Halaman embed open.spotify.com/embed/... → nama, sampul, ≤100 lagu pertama + token anonim.
 * 2) Playlist >100 lagu: halaman berikutnya lewat API web player (pathfinder) memakai token anonim tsb.
 * Catatan: Spotify Web API resmi (mode Development, sejak Feb 2026) hanya boleh membaca playlist
 * milik pengguna yang login, jadi tidak dipakai di sini.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PATHFINDER = 'https://api-partner.spotify.com/pathfinder/v2/query';
// hash persisted query "fetchPlaylist" milik web player (dicoba berurutan; bisa berubah sewaktu-waktu)
const PLAYLIST_HASHES = [
  'bb67e0af06e8d6f52b531f97468ee4acd44cd0f82b988e15c2ea47b1148efc77',
  '19ff1327c29e99c208c86d7a9d8f1929cfdf3d3202a0ff4253c821f1901aa94d',
];
const MAX_TRACKS = 2000;

export type SpKind = 'playlist' | 'album' | 'track';
export interface SpTrack { title: string; artists: string[]; album?: string; durationMs?: number; uri?: string }
export interface SpCollection {
  kind: SpKind; id: string; name: string; owner?: string; cover?: string; url: string;
  total: number; tracks: SpTrack[]; partial?: boolean;
}

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export function parseSpotifyUrl(input: string): { kind: SpKind; id: string } | null {
  const s = input.trim();
  const uri = s.match(/^spotify:(playlist|album|track):([A-Za-z0-9]{10,32})/);
  if (uri) return { kind: uri[1] as SpKind, id: uri[2] };
  const m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(?:user\/[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]{10,32})/i);
  if (m) return { kind: m[1].toLowerCase() as SpKind, id: m[2] };
  return null;
}

/** Link pendek (spotify.link / spoti.fi) → link open.spotify.com */
async function expandShort(input: string): Promise<string> {
  if (!/^https?:\/\/(spotify\.link|spoti\.fi|spotify\.app\.link)\//i.test(input.trim())) return input;
  const res = await fetch(input.trim(), { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (parseSpotifyUrl(res.url)) return res.url;
  const html = await res.text();
  const m = html.match(/https:\/\/open\.spotify\.com\/[^"'<>\s]+/);
  return m ? m[0] : input;
}

const artistsOf = (subtitle?: string): string[] =>
  (subtitle || '').split(/,\s(?=\S)/).map((a) => a.trim()).filter(Boolean);

async function fetchEmbed(kind: SpKind, id: string) {
  const res = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (res.status === 404) throw new HttpError(404, 'Tidak ditemukan. Pastikan link benar dan playlist bersifat Publik.');
  if (!res.ok) throw new HttpError(502, `Spotify menolak permintaan (${res.status})`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new HttpError(502, 'Format halaman Spotify berubah — tidak bisa membaca data.');
  const state = JSON.parse(m[1])?.props?.pageProps?.state;
  const entity = state?.data?.entity;
  if (!entity) throw new HttpError(404, 'Playlist tidak bisa dibaca. Pastikan playlist bersifat Publik (bukan Privat).');
  return { entity, token: state?.settings?.session?.accessToken as string | undefined };
}

async function fetchPlaylistPage(token: string, id: string, offset: number, limit: number) {
  let lastErr = '';
  for (const hash of PLAYLIST_HASHES) {
    const res = await fetch(PATHFINDER, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': UA, 'app-platform': 'WebPlayer' },
      body: JSON.stringify({
        operationName: 'fetchPlaylist',
        variables: { uri: `spotify:playlist:${id}`, offset, limit, enableWatchFeedEntrypoint: false },
        extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
      }),
    });
    if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
    const j: any = await res.json();
    const content = j?.data?.playlistV2?.content;
    if (!content?.items) { lastErr = j?.errors?.[0]?.message || 'tanpa data'; continue; }
    const tracks: SpTrack[] = [];
    for (const it of content.items) {
      const d = it?.itemV2?.data;
      if (!d?.name) continue;
      if (d.__typename && d.__typename !== 'Track' && d.__typename !== 'LocalTrack') continue;
      tracks.push({
        title: d.name,
        artists: (d.artists?.items || []).map((a: any) => a?.profile?.name).filter(Boolean),
        album: d.albumOfTrack?.name,
        durationMs: d.trackDuration?.totalMilliseconds,
        uri: d.uri,
      });
    }
    return { tracks, total: Number(content.totalCount) || 0, count: content.items.length };
  }
  throw new Error(lastErr || 'gagal');
}

export async function getSpotifyCollection(input: string): Promise<SpCollection> {
  if (!input.trim()) throw new HttpError(400, 'Tempel link playlist Spotify terlebih dahulu.');
  const ref = parseSpotifyUrl(await expandShort(input));
  if (!ref) throw new HttpError(400, 'Link tidak dikenali. Contoh: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  const { entity, token } = await fetchEmbed(ref.kind, ref.id);

  let tracks: SpTrack[];
  if (Array.isArray(entity.trackList)) {
    tracks = entity.trackList
      .filter((t: any) => t?.title && (!t.entityType || t.entityType === 'track'))
      .map((t: any) => ({ title: t.title, artists: artistsOf(t.subtitle), durationMs: t.duration, uri: t.uri, album: ref.kind === 'album' ? entity.name : undefined }));
  } else {
    // satu lagu
    tracks = [{
      title: entity.name || entity.title,
      artists: (entity.artists || []).map((a: any) => a?.name).filter(Boolean).length
        ? (entity.artists || []).map((a: any) => a?.name).filter(Boolean)
        : artistsOf(entity.subtitle),
      durationMs: entity.duration,
      uri: entity.uri,
    }];
  }

  let total = tracks.length;
  let partial = false;
  // embed hanya memuat 100 lagu pertama → sisanya diambil per 100
  if (ref.kind === 'playlist' && tracks.length >= 100 && token) {
    try {
      let offset = tracks.length;
      for (let guard = 0; guard < 25 && offset < MAX_TRACKS; guard++) {
        const page = await fetchPlaylistPage(token, ref.id, offset, 100);
        total = page.total || total;
        tracks.push(...page.tracks);
        offset += page.count;
        if (!page.count || offset >= total) break;
      }
      if (total > tracks.length && tracks.length < MAX_TRACKS) partial = true;
    } catch {
      partial = true;
    }
  }

  return {
    kind: ref.kind,
    id: ref.id,
    name: entity.name || entity.title || 'Playlist Spotify',
    owner: entity.subtitle || entity.authors?.[0]?.name,
    cover: entity.coverArt?.sources?.[0]?.url || entity.visualIdentity?.image?.[0]?.url,
    url: `https://open.spotify.com/${ref.kind}/${ref.id}`,
    total: Math.max(total, tracks.length),
    tracks: tracks.slice(0, MAX_TRACKS),
    partial,
  };
}
