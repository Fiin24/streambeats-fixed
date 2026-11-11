/** Daftar genre untuk onboarding ala Spotify. `q` = kueri pencarian artis, `seed` = artis acuan (ID kanal YouTube Music). */
export interface Genre {
  id: string;
  name: string;
  /** warna kartu */
  color: string;
  q: string;
  seed?: { id?: string; name: string };
}

export const GENRES: Genre[] = [
  { id: 'pop-id', name: 'Pop Indonesia', color: '#E13300', q: 'pop indonesia', seed: { id: 'UC_DHlXllTSMB8pTC38_leFg', name: 'Tulus' } },
  { id: 'pop', name: 'Pop Barat', color: '#8D67AB', q: 'pop barat', seed: { id: 'UCZn4r7heNOPY-C43YIywnVA', name: 'Bruno Mars' } },
  { id: 'kpop', name: 'K-Pop', color: '#E8115B', q: 'k-pop', seed: { id: 'UC9vrvNSL3xcWGSkV86REBSg', name: 'BTS' } },
  { id: 'dangdut', name: 'Dangdut', color: '#D84000', q: 'dangdut', seed: { id: 'UCiItEIDWUhb8ySYckd8hZZQ', name: 'Lesti' } },
  { id: 'koplo', name: 'Koplo & Jawa', color: '#BA5D07', q: 'koplo', seed: { id: 'UCrXRY_7SVVmc6TykwhRGUNQ', name: 'Denny Caknan' } },
  { id: 'indie', name: 'Indie', color: '#608108', q: 'indie indonesia', seed: { id: 'UCzhVLh7xVyH3MpqO_KY6SYg', name: 'Hindia' } },
  { id: 'rock', name: 'Rock', color: '#E91429', q: 'band rock', seed: { id: 'UCn0hl0XZ3bFREX2SCBZK3Pw', name: 'Dewa 19' } },
  { id: 'hiphop', name: 'Hip-Hop & Rap', color: '#BC5900', q: 'rapper hip hop', seed: { id: 'UCprAFmT0C6O4X0ToEXpeFTQ', name: 'Kendrick Lamar' } },
  { id: 'rap-id', name: 'Rap Indonesia', color: '#777777', q: 'rap indonesia' },
  { id: 'rnb', name: 'R&B', color: '#DC148C', q: 'R&B', seed: { id: 'UCeKDV9JgivrXehVluw5bKFA', name: 'SZA' } },
  { id: 'jpop', name: 'J-Pop & Anime', color: '#148A08', q: 'j-pop', seed: { id: 'UCI6B8NkZKqlFWoiC_xE-hzA', name: 'YOASOBI' } },
  { id: 'edm', name: 'EDM & Dance', color: '#0D73EC', q: 'DJ EDM', seed: { id: 'UCaXJEi-wOOVe2eZZHzyz4mQ', name: 'Alan Walker' } },
  { id: 'akustik', name: 'Akustik', color: '#477D95', q: 'akustik', seed: { name: 'Nadin Amizah' } },
  { id: 'jazz', name: 'Jazz', color: '#1E3264', q: 'jazz', seed: { id: 'UCxRuL2yOu2ydTJNZuYdU0qg', name: 'Norah Jones' } },
  { id: 'religi', name: 'Religi', color: '#27856A', q: 'musik religi islami', seed: { id: 'UClrURYUm1hhYw604g4tW_rQ', name: 'Maher Zain' } },
  { id: 'rohani', name: 'Rohani', color: '#503750', q: 'lagu rohani', seed: { id: 'UCwNDHrLkhUdLvf7CfhJjWNQ', name: 'JPCC Worship' } },
  { id: 'metal', name: 'Metal', color: '#1F1F1F', q: 'band metal', seed: { id: 'UCGexNm_Kw4rdQjLxmpb2EKw', name: 'Metallica' } },
  { id: 'reggae', name: 'Reggae', color: '#509BF5', q: 'reggae', seed: { id: 'UCBfv87kvVXyNi88URZ1zvCA', name: 'Bob Marley' } },
  { id: 'latin', name: 'Latin', color: '#E1118C', q: 'latin pop', seed: { id: 'UCiY3z8HAGD6BlSNKVn2kSvQ', name: 'Bad Bunny' } },
  { id: 'klasik', name: 'Klasik & Piano', color: '#7D4B32', q: 'klasik', seed: { id: 'UCinzb98c2WE_NEkfX9pbrcQ', name: 'Ludovico Einaudi' } },
  { id: 'lofi', name: 'Lo-fi & Chill', color: '#2D46B9', q: 'lofi', seed: { id: 'UCi5YpRRZmwegT235crEZ2YQ', name: 'Lofi Girl' } },
];

export const genreById = (id: string) => GENRES.find((g) => g.id === id);
