/**
 * Port TypeScript dari modul `innertube` Metrolist (YouTube Music client).
 * Memakai klien WEB_REMIX ke endpoint internal music.youtube.com — tanpa API key.
 */
const BASE = 'https://music.youtube.com/youtubei/v1/';
const CLIENT_NAME = 'WEB_REMIX';
const CLIENT_VERSION = '1.20250310.01.00';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export type ItemType = 'song' | 'video' | 'album' | 'playlist' | 'artist' | 'podcast' | 'episode' | 'unknown';
export interface Artist { name: string; id?: string }
export interface Item {
  type: ItemType;
  id: string;
  title: string;
  subtitle: string;
  artists: Artist[];
  thumbnail: string;
  videoId?: string;
  playlistId?: string;
  browseId?: string;
  album?: { name: string; id?: string };
  duration?: number;
  durationText?: string;
  explicit?: boolean;
  wide?: boolean;
}
export interface Section {
  title: string;
  strapline?: string;
  thumbnail?: string;
  browseId?: string;
  layout: 'list' | 'cards';
  items: Item[];
}
export interface Locale { hl?: string; gl?: string }

const SEARCH_FILTERS: Record<string, string> = {
  songs: 'EgWKAQIIAWoMEA4QChADEAQQCRAF',
  videos: 'EgWKAQIQAWoMEA4QChADEAQQCRAF',
  albums: 'EgWKAQIYAWoMEA4QChADEAQQCRAF',
  artists: 'EgWKAQIgAWoMEA4QChADEAQQCRAF',
  playlists: 'EgeKAQQoAEABagwQDhAKEAMQBBAJEAU%3D',
};

async function call(endpoint: string, body: Record<string, unknown>, loc: Locale = {}, query = '', visitorData?: string): Promise<any> {
  const res = await fetch(`${BASE}${endpoint}?prettyPrint=false${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://music.youtube.com',
      Referer: 'https://music.youtube.com/',
      'User-Agent': UA,
      'X-YouTube-Client-Name': '67',
      'X-YouTube-Client-Version': CLIENT_VERSION,
      ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
    },
    body: JSON.stringify({
      context: {
        client: { clientName: CLIENT_NAME, clientVersion: CLIENT_VERSION, hl: loc.hl || 'id', gl: loc.gl || 'ID', userAgent: UA, ...(visitorData ? { visitorData } : {}) },
        user: { lockedSafetyMode: false },
      },
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`InnerTube ${endpoint} gagal (${res.status})`);
  return res.json();
}

/* ---------------------------- helper parser ---------------------------- */
const text = (t: any): string => (t?.runs ? t.runs.map((r: any) => r.text).join('') : t?.simpleText ?? '');
const pickThumb = (o: any): string => {
  const list =
    o?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    o?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    o?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
    o?.thumbnails ||
    o?.thumbnail?.thumbnails ||
    [];
  return list.length ? list[list.length - 1].url : '';
};
const pageType = (nav: any): string =>
  nav?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';
const videoType = (nav: any): string =>
  nav?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';
export const parseDuration = (s?: string): number | undefined => {
  if (!s || !/^\d{1,3}([:.]\d{2}){1,2}$/.test(s.trim())) return undefined;
  return s.trim().split(/[:.]/).reduce((acc, p) => acc * 60 + Number(p), 0);
};
const typeFromPage = (pt: string): ItemType =>
  pt.includes('ALBUM') ? 'album'
  : pt.includes('PLAYLIST') ? 'playlist'
  : pt.includes('ARTIST') || pt.includes('USER_CHANNEL') ? 'artist'
  : pt.includes('PODCAST') ? 'podcast'
  : pt.includes('NON_MUSIC_AUDIO') ? 'episode'
  : 'unknown';
const typeFromVideo = (vt: string): ItemType =>
  vt === 'MUSIC_VIDEO_TYPE_ATV' ? 'song' : vt.includes('PODCAST') ? 'episode' : 'video';
const artistsFromRuns = (runs: any[] = []): Artist[] =>
  runs
    .filter((r) => /ARTIST|USER_CHANNEL/.test(pageType(r.navigationEndpoint)))
    .map((r) => ({ name: r.text, id: r.navigationEndpoint.browseEndpoint.browseId }));
const albumFromRuns = (runs: any[] = []) => {
  const r = runs.find((x) => pageType(x.navigationEndpoint).includes('ALBUM'));
  return r ? { name: r.text, id: r.navigationEndpoint.browseEndpoint.browseId } : undefined;
};
const isExplicit = (badges: any[] = []) =>
  badges.some((b) => b?.musicInlineBadgeRenderer?.icon?.iconType === 'MUSIC_EXPLICIT_BADGE');
const TYPE_WORDS = /^(Lagu|Song|Video|Album|Single|EP|Playlist|Artis|Artist|Episode|Podcast|Profil|Profile)$/i;
const cleanSubtitle = (runs: any[] = []) => {
  const parts = runs.map((r) => r.text).join('').split(' • ').filter((p) => p && !TYPE_WORDS.test(p.trim()));
  return parts.join(' • ');
};

export function parseTwoRow(r: any): Item | null {
  if (!r) return null;
  const nav = r.navigationEndpoint || r.title?.runs?.[0]?.navigationEndpoint;
  const subRuns = r.subtitle?.runs || [];
  const title = text(r.title);
  const thumbnail = pickThumb(r.thumbnailRenderer);
  const play = r.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
  const base = {
    title,
    subtitle: cleanSubtitle(subRuns),
    artists: artistsFromRuns(subRuns),
    thumbnail,
    explicit: isExplicit(r.subtitleBadges),
    wide: String(r.aspectRatio || '').includes('16_9'),
  };
  if (nav?.watchEndpoint?.videoId) {
    const vid = nav.watchEndpoint.videoId;
    return { ...base, type: typeFromVideo(videoType(nav)), id: vid, videoId: vid, playlistId: nav.watchEndpoint.playlistId };
  }
  if (nav?.browseEndpoint?.browseId) {
    const browseId = nav.browseEndpoint.browseId;
    const playlistId = play?.watchPlaylistEndpoint?.playlistId || play?.watchEndpoint?.playlistId;
    return { ...base, type: typeFromPage(pageType(nav)), id: browseId, browseId, playlistId };
  }
  return null;
}

export function parseResponsive(r: any): Item | null {
  if (!r) return null;
  const cols = (r.flexColumns || []).map((c: any) => c.musicResponsiveListItemFlexColumnRenderer?.text);
  const title = text(cols[0]);
  const titleNav = cols[0]?.runs?.[0]?.navigationEndpoint;
  const subRuns = cols.slice(1).flatMap((c: any, i: number) => (i > 0 && c?.runs ? [{ text: ' • ' }, ...c.runs] : c?.runs || []));
  const fixed = (r.fixedColumns || []).map((c: any) => text(c.musicResponsiveListItemFixedColumnRenderer?.text));
  const durationText = fixed.find((f: string) => parseDuration(f)) || subRuns.map((x: any) => x.text).find((t: string) => parseDuration(t));
  const play = r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
  const videoId = r.playlistItemData?.videoId || play?.watchEndpoint?.videoId || titleNav?.watchEndpoint?.videoId;
  const thumbnail = pickThumb(r.thumbnail);
  const artists = artistsFromRuns(subRuns);
  const subtitle = cleanSubtitle(subRuns.filter((x: any) => !parseDuration(x.text)))
    .replace(/( • )+$/, '');
  const base = { title, subtitle, artists, thumbnail, explicit: isExplicit(r.badges), album: albumFromRuns(subRuns) };
  if (videoId) {
    const vt = videoType(play) || videoType(titleNav);
    return {
      ...base,
      type: vt ? typeFromVideo(vt) : 'song',
      id: videoId,
      videoId,
      playlistId: play?.watchEndpoint?.playlistId,
      durationText,
      duration: parseDuration(durationText),
    };
  }
  const nav = r.navigationEndpoint;
  if (nav?.browseEndpoint?.browseId) {
    const browseId = nav.browseEndpoint.browseId;
    return { ...base, type: typeFromPage(pageType(nav)), id: browseId, browseId, playlistId: play?.watchPlaylistEndpoint?.playlistId };
  }
  return null;
}

function parseCard(r: any): Item | null {
  const nav = r.title?.runs?.[0]?.navigationEndpoint || r.onTap;
  const subRuns = r.subtitle?.runs || [];
  const base = { title: text(r.title), subtitle: cleanSubtitle(subRuns), artists: artistsFromRuns(subRuns), thumbnail: pickThumb(r.thumbnail) };
  if (nav?.watchEndpoint?.videoId)
    return { ...base, type: typeFromVideo(videoType(nav)), id: nav.watchEndpoint.videoId, videoId: nav.watchEndpoint.videoId };
  if (nav?.browseEndpoint?.browseId)
    return { ...base, type: typeFromPage(pageType(nav)), id: nav.browseEndpoint.browseId, browseId: nav.browseEndpoint.browseId };
  return null;
}

const parseAny = (c: any): Item | null =>
  c.musicTwoRowItemRenderer ? parseTwoRow(c.musicTwoRowItemRenderer)
  : c.musicResponsiveListItemRenderer ? parseResponsive(c.musicResponsiveListItemRenderer)
  : null;
const notNull = <T,>(x: T | null | undefined): x is T => !!x;

export function parseSections(contents: any[] = []): Section[] {
  const out: Section[] = [];
  for (const s of contents) {
    const car = s.musicCarouselShelfRenderer || s.musicImmersiveCarouselShelfRenderer;
    if (car) {
      const h = car.header?.musicCarouselShelfBasicHeaderRenderer || car.header?.musicImmersiveCarouselShelfBasicHeaderRenderer || {};
      const items = (car.contents || []).map(parseAny).filter(notNull);
      if (!items.length) continue;
      out.push({
        title: text(h.title),
        strapline: text(h.strapline) || undefined,
        thumbnail: pickThumb(h.thumbnail) || undefined,
        browseId: h.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || h.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint?.browseId,
        layout: car.contents?.[0]?.musicResponsiveListItemRenderer ? 'list' : 'cards',
        items,
      });
      continue;
    }
    if (s.musicShelfRenderer) {
      const sh = s.musicShelfRenderer;
      const items = (sh.contents || []).map(parseAny).filter(notNull);
      if (items.length) out.push({ title: text(sh.title), layout: 'list', items });
      continue;
    }
    if (s.musicCardShelfRenderer) {
      const c = s.musicCardShelfRenderer;
      const top = parseCard(c);
      const rest = (c.contents || []).map(parseAny).filter(notNull);
      out.push({ title: text(c.header?.musicCardShelfHeaderBasicRenderer?.title) || 'Hasil teratas', layout: 'list', items: [top, ...rest].filter(notNull) });
      continue;
    }
    if (s.itemSectionRenderer?.contents?.[0]?.musicShelfRenderer || s.itemSectionRenderer?.contents?.[0]?.gridRenderer) {
      out.push(...parseSections(s.itemSectionRenderer.contents));
      continue;
    }
    if (s.gridRenderer) {
      const items = (s.gridRenderer.items || []).map(parseAny).filter(notNull);
      if (items.length) out.push({ title: text(s.gridRenderer.header?.gridHeaderRenderer?.title), layout: 'cards', items });
    }
  }
  return out;
}

/* ------------------------------- endpoints ------------------------------ */
export interface Chip { title: string; params: string }
export interface HomePage { chips: Chip[]; sections: Section[]; continuation?: string }

export async function home(opts: { params?: string; continuation?: string; pages?: number } & Locale = {}): Promise<HomePage> {
  const loc = { hl: opts.hl, gl: opts.gl };
  let chips: Chip[] = [];
  let sections: Section[] = [];
  let continuation: string | undefined;
  let visitorData: string | undefined;
  if (opts.continuation) {
    // token lanjutan = "<visitorData>::<continuation>" (visitorData wajib agar YouTube Music mau melanjutkan feed)
    const [vd, c] = opts.continuation.includes('::') ? opts.continuation.split('::') : [undefined, opts.continuation];
    visitorData = vd;
    continuation = c;
  } else {
    const r = await call('browse', { browseId: 'FEmusic_home', ...(opts.params ? { params: opts.params } : {}) }, loc);
    visitorData = r.responseContext?.visitorData;
    const sl = r.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
    chips = (sl?.header?.chipCloudRenderer?.chips || [])
      .map((c: any) => c.chipCloudChipRenderer)
      .filter((c: any) => c?.navigationEndpoint?.browseEndpoint?.params)
      .map((c: any) => ({ title: text(c.text), params: c.navigationEndpoint.browseEndpoint.params }));
    sections = parseSections(sl?.contents);
    continuation = sl?.continuations?.[0]?.nextContinuationData?.continuation;
  }
  const pages = Math.max(0, Math.min(opts.pages ?? 3, 6));
  for (let i = 0; i < pages && continuation; i++) {
    const r = await call('browse', { continuation }, loc, `&ctoken=${continuation}&continuation=${continuation}&type=next`, visitorData);
    const sc = r.continuationContents?.sectionListContinuation;
    if (!sc) { continuation = undefined; break; }
    sections = sections.concat(parseSections(sc.contents));
    continuation = sc.continuations?.[0]?.nextContinuationData?.continuation;
  }
  return { chips, sections, continuation: continuation ? `${visitorData || ''}::${continuation}` : undefined };
}

const GROUP_TITLES: Record<ItemType, string> = {
  song: 'Lagu', video: 'Video', artist: 'Artis', album: 'Album', playlist: 'Playlist', podcast: 'Podcast', episode: 'Episode', unknown: 'Lainnya',
};

export async function search(q: string, filter?: string, loc: Locale = {}): Promise<{ sections: Section[] }> {
  const params = filter ? SEARCH_FILTERS[filter] : undefined;
  const r = await call('search', { query: q, ...(params ? { params: decodeURIComponent(params) } : {}) }, loc);
  const tabs = r.contents?.tabbedSearchResultsRenderer?.tabs || [];
  const contents: any[] = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const sections = parseSections(contents);
  // Format baru: setiap hasil dibungkus itemSectionRenderer tersendiri -> kelompokkan per tipe
  const flat = contents.flatMap((c) => (c.itemSectionRenderer?.contents || []).map(parseAny)).filter(notNull) as Item[];
  const order: ItemType[] = ['song', 'video', 'artist', 'album', 'playlist', 'podcast', 'episode', 'unknown'];
  for (const t of order) {
    const items = flat.filter((i) => i.type === t);
    if (items.length) sections.push({ title: GROUP_TITLES[t], layout: t === 'song' || t === 'video' || t === 'episode' ? 'list' : 'cards', items });
  }
  return { sections };
}

export async function suggestions(q: string, loc: Locale = {}): Promise<{ queries: string[]; items: Item[] }> {
  const r = await call('music/get_search_suggestions', { input: q }, loc);
  const queries: string[] = [];
  const items: Item[] = [];
  for (const sec of r.contents || []) {
    for (const c of sec.searchSuggestionsSectionRenderer?.contents || []) {
      if (c.searchSuggestionRenderer) queries.push(text(c.searchSuggestionRenderer.suggestion));
      else if (c.musicResponsiveListItemRenderer) {
        const it = parseResponsive(c.musicResponsiveListItemRenderer);
        if (it) items.push(it);
      }
    }
  }
  return { queries, items };
}

export interface NextPage { tracks: Item[]; lyricsBrowseId?: string; relatedBrowseId?: string; continuation?: string }

export async function next(opts: { videoId?: string; playlistId?: string; params?: string } & Locale): Promise<NextPage> {
  const r = await call(
    'next',
    {
      ...(opts.videoId ? { videoId: opts.videoId } : {}),
      ...(opts.playlistId ? { playlistId: opts.playlistId } : opts.videoId ? { playlistId: `RDAMVM${opts.videoId}` } : {}),
      ...(opts.params ? { params: opts.params } : {}),
      isAudioOnly: true,
      enablePersistentPlaylistPanel: true,
      tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
    },
    { hl: opts.hl, gl: opts.gl },
  );
  const tabs = r.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
  const panel = tabs[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
  const tracks: Item[] = [];
  for (const c of panel?.contents || []) {
    const v = c.playlistPanelVideoRenderer || c.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
    if (!v?.videoId) continue;
    const runs = v.longBylineText?.runs || v.shortBylineText?.runs || [];
    const artists = artistsFromRuns(runs);
    const durationText = text(v.lengthText);
    tracks.push({
      type: typeFromVideo(videoType(v.navigationEndpoint)),
      id: v.videoId,
      videoId: v.videoId,
      title: text(v.title),
      subtitle: artists.length ? artists.map((a) => a.name).join(', ') : text(v.shortBylineText),
      artists: artists.length ? artists : [{ name: text(v.shortBylineText) }],
      album: albumFromRuns(runs),
      thumbnail: pickThumb(v.thumbnail),
      durationText,
      duration: parseDuration(durationText),
      explicit: isExplicit(v.badges),
    });
  }
  const lyricsTab = tabs.find((t: any) => t.tabRenderer?.endpoint?.browseEndpoint?.browseId?.startsWith('MPLYt'));
  const relatedTab = tabs.find((t: any) => t.tabRenderer?.endpoint?.browseEndpoint?.browseId?.startsWith('MPTRt'));
  return {
    tracks,
    lyricsBrowseId: lyricsTab?.tabRenderer?.endpoint?.browseEndpoint?.browseId,
    relatedBrowseId: relatedTab?.tabRenderer?.endpoint?.browseEndpoint?.browseId,
    continuation: panel?.continuations?.[0]?.nextRadioContinuationData?.continuation,
  };
}

export async function lyrics(browseId: string, loc: Locale = {}): Promise<{ text?: string; source?: string }> {
  const r = await call('browse', { browseId }, loc);
  const shelf = r.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer;
  return { text: text(shelf?.description) || undefined, source: text(shelf?.footer) || undefined };
}

export interface BrowsePage {
  kind: 'artist' | 'album' | 'playlist' | 'other';
  title: string;
  subtitle?: string;
  description?: string;
  thumbnail?: string;
  artists: Artist[];
  playlistId?: string;
  radioPlaylistId?: string;
  tracks: Item[];
  sections: Section[];
}

export async function browse(browseId: string, params?: string, loc: Locale = {}, extra: Record<string, unknown> = {}): Promise<BrowsePage> {
  const r = await call('browse', { browseId, ...(params ? { params } : {}), ...extra }, loc);
  // Artis / halaman satu kolom
  const single = r.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
  if (single) {
    const h = r.header?.musicImmersiveHeaderRenderer || r.header?.musicVisualHeaderRenderer || r.header?.musicDetailHeaderRenderer || {};
    const sections = parseSections(single.contents);
    const songShelf = sections.find((s) => s.layout === 'list');
    const playEp = h.playButton?.buttonRenderer?.navigationEndpoint;
    const radioEp = h.startRadioButton?.buttonRenderer?.navigationEndpoint;
    return {
      kind: browseId.startsWith('UC') || browseId.startsWith('MPLA') ? 'artist' : 'other',
      title: text(h.title),
      subtitle: text(h.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText) || text(h.subtitle) || undefined,
      description: text(h.description) || undefined,
      thumbnail: pickThumb(h.thumbnail) || pickThumb(h.foregroundThumbnail),
      artists: [],
      playlistId: playEp?.watchPlaylistEndpoint?.playlistId || playEp?.watchEndpoint?.playlistId,
      radioPlaylistId: radioEp?.watchPlaylistEndpoint?.playlistId || radioEp?.watchEndpoint?.playlistId,
      tracks: songShelf ? songShelf.items : [],
      sections: sections.filter((s) => s !== songShelf),
    };
  }
  // Album / playlist (layout dua kolom)
  const two = r.contents?.twoColumnBrowseResultsRenderer;
  const headerSec = two?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
  const h = headerSec?.musicResponsiveHeaderRenderer || headerSec?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicResponsiveHeaderRenderer || {};
  const secondary = two?.secondaryContents?.sectionListRenderer?.contents || [];
  const shelf = secondary[0]?.musicShelfRenderer || secondary[0]?.musicPlaylistShelfRenderer;
  const headerThumb = pickThumb(h.thumbnail);
  const strapRuns = h.straplineTextOne?.runs || [];
  const headerArtists = artistsFromRuns(strapRuns);
  const tracks = (shelf?.contents || [])
    .map((c: any) => parseAny(c))
    .filter(notNull)
    .map((t: Item) => ({
      ...t,
      thumbnail: t.thumbnail || headerThumb,
      artists: t.artists.length ? t.artists : headerArtists,
      subtitle: t.subtitle || headerArtists.map((a) => a.name).join(', '),
    }));
  let playlistId: string | undefined;
  for (const b of h.buttons || []) {
    const ep = b.musicPlayButtonRenderer?.playNavigationEndpoint;
    playlistId = playlistId || ep?.watchEndpoint?.playlistId || ep?.watchPlaylistEndpoint?.playlistId;
  }
  if (!playlistId && browseId.startsWith('VL')) playlistId = browseId.slice(2);
  const desc = h.description?.musicDescriptionShelfRenderer?.description;
  return {
    kind: browseId.startsWith('MPRE') ? 'album' : browseId.startsWith('VL') ? 'playlist' : 'other',
    title: text(h.title),
    subtitle: [text(h.subtitle), text(h.secondSubtitle)].filter(Boolean).join(' • ') || undefined,
    description: text(desc) || undefined,
    thumbnail: headerThumb,
    artists: headerArtists.length ? headerArtists : strapRuns.length ? [{ name: text(h.straplineTextOne) }] : [],
    playlistId,
    tracks,
    sections: parseSections(secondary.slice(1)),
  };
}

/* ---------------- Fallback opsional: YouTube Data API v3 ---------------- */
export async function dataApiSearch(q: string, apiKey: string): Promise<{ sections: Section[] }> {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({ part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true', maxResults: '25', q, key: apiKey }).toString();
  const res = await fetch(u);
  if (!res.ok) throw new Error(`YouTube Data API gagal (${res.status})`);
  const j: any = await res.json();
  const items: Item[] = (j.items || []).map((it: any) => ({
    type: 'video' as const,
    id: it.id.videoId,
    videoId: it.id.videoId,
    title: decodeEntities(it.snippet.title),
    subtitle: decodeEntities(it.snippet.channelTitle),
    artists: [{ name: decodeEntities(it.snippet.channelTitle), id: it.snippet.channelId }],
    thumbnail: it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.default?.url,
  }));
  return { sections: [{ title: 'Video', layout: 'list', items }] };
}
const decodeEntities = (s = '') =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
