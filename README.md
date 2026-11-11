# Stream Beats — streaming musik gratis tanpa iklan

Klon web dari tampilan **musickuzyy.vercel.app** (React 18 + Vite 5 + TypeScript + Tailwind).
Katalog, beranda, pencarian, artis, album, playlist, radio, dan lirik diambil dari **YouTube Music**
lewat API **InnerTube** (diporting ke TypeScript dari pendekatan aplikasi Android *Metrolist*).
Audio diputar dengan **YouTube IFrame Player** resmi yang disembunyikan, jadi tidak perlu API key.

## Perbaikan v4.4.2

- **Ganti akun**: lagu yang sedang diputar otomatis dihentikan. Setelah pindah, pemutar menyiapkan **lagu terakhir yang diputar di akun tujuan** (dari riwayatnya) **tanpa diputar**; ketuk ▶ untuk mulai. Bila akun itu belum punya riwayat, pemutar dikosongkan. Sesi Dengar bersama yang aktif ikut diakhiri saat ganti akun.
- **Tombol kembali**: halaman artis, album, playlist, mix, Lagu Disukai, dan Riwayat kini punya tombol ← melayang di kiri atas (mobile). Tombol ini kembali ke menu sebelumnya, atau ke Beranda bila halaman dibuka langsung dari tautan. File baru: `src/components/BackButton.tsx`.

## Perbaikan v4.4.1

- **Ganti akun**: setelah beralih akun, aplikasi langsung masuk ke **Beranda** tanpa memunculkan layar "pilih genre". Penyebabnya, pilihan genre akun lama dihapus saat berpindah akun. Sekarang pilihan itu disimpan per akun dan diambil dari server sebelum berpindah.
- **Dengar bersama**: saat tamu menekan *Putuskan* (atau dikeluarkan, atau host mengakhiri ruangan), musik di HP tamu **otomatis berhenti**. Musik host **tetap berjalan**, dan host mendapat notifikasi "… keluar dari sesi". Saat host mengakhiri ruangan, musik host juga tetap diputar.

## Baru di v4.4 — Dengar bersama + judul "Tentang" ukuran sedang

**Dengar bersama (listen together)** — buka lewat ikon 👥 di header Pustaka, tombol 👥 di header desktop, atau *Pengaturan → Pemutar & Konten → Dengar bersama*.

- **Host**: isi Username, kosongkan *Kode sesi*, ketuk **Hubungkan** → ruangan dibuat (kode 6 huruf). Bagikan kode atau tautan undangan (`/together?code=XXXXXX`). Host menyetujui/menolak tamu, mengeluarkan, atau memblokir tamu, dan menerima/menolak saran lagu.
- **Tamu**: isi Username + Kode sesi → **Hubungkan** → tunggu disetujui. Setelah itu lagu, posisi, putar/jeda (dan volume bila diaktifkan host) mengikuti host. Memilih lagu atau "Tambahkan ke antrean" = **menyarankan** lagu ke host. Jeda manual di HP tamu menahan sinkron sampai ▶ ditekan lagi.
- **Pengaturan**: pengguna yang diblokir, URL server (kosong = server bawaan), nama pengguna, setujui otomatis permintaan bergabung, setujui otomatis saran lagu, sinkronkan volume host, dan **Lihat log**.
- Sesi otomatis dilanjutkan setelah aplikasi dibuka ulang.

**Cara kerja**: tanpa WebSocket (cocok untuk serverless). Aplikasi melakukan polling HTTP ke `/api/together` (tamu tiap 2 dtk, host tiap 3 dtk + kirim status saat ada perubahan). Data ruangan disimpan di **Upstash Redis yang sama dengan akun** (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, atau `KV_REST_API_URL` + `KV_REST_API_TOKEN`), kedaluwarsa otomatis 6 jam. Saat `npm run dev`/`preview` dipakai penyimpanan memori. Di produksi tanpa Upstash, endpoint menjawab 503 dan halaman Bersama menampilkan pesan.

**Deploy**: cukup deploy ulang web (Netlify/Vercel). `netlify.toml` sudah berisi redirect `/api/together → /.netlify/functions/together`. APK Capacitor tidak perlu dibangun ulang bila memuat situs yang dideploy; bila APK membundel file web sendiri, jalankan `npm run build && npx cap sync` lalu build APK.

**File baru**: `api/_lib/together.ts`, `api/together.ts`, `netlify/functions/together.ts`, `src/lib/together.ts`, `src/store/together.ts`, `src/pages/Together.tsx`, `src/lib/fonts.ts`.

**Lainnya**
- Halaman *Tentang*: nama aplikasi kini ukuran sedang (serif, seperti contoh). Teksnya diatur di `APP_NAME` pada `src/config/about.ts` (saat ini `Stream Beast`; ganti ke `Stream Beats` bila ingin sama dengan header).
- Perbaikan: pesan kosong di *Riwayat* & *Lagu Disukai* kini sesuai; snapshot mix harian tidak lagi bisa membuat Beranda error saat penyimpanan penuh.

## Baru di v4.3 — Daftar & masuk dengan Google (Gmail) kembali

**Kenapa sebelumnya hilang?** Login Google dihapus di **v3.3** (Firebase dicabut). Lalu daftar lewat email + kode verifikasi (v3.6) juga dihapus di **v3.7** dan diganti username + password. Sejak itu tidak ada lagi kode Google di proyek.

Di versi ini tombol **Lanjutkan dengan Google** dibuat ulang **tanpa Firebase**: langsung memakai Google OAuth 2.0 dan database akun yang sudah ada (Upstash).

- Layar sambutan: **Lanjutkan dengan Google**. Di form Daftar/Masuk juga ada **Daftar/Masuk dengan Google**.
- Gmail baru → akun langsung dibuat. Nama & foto profil diambil dari Google, username dibuat dari alamat Gmail (`andi.pratama@gmail.com` → `@andi.pratama`; bila sudah dipakai → `@andi.pratama123`).
- Gmail yang sama → masuk ke akun yang sama di semua perangkat. Akun lama v3.6 dengan email yang sama otomatis tersambung.
- Akun Google tidak punya password. Bisa dibuat di **Pengaturan → Akun → Password → Buat** agar bisa masuk juga dengan username. Hapus akun cukup dengan mengetik username.
- Keamanan: `state` ditandatangani HMAC + cookie (anti-CSRF), token Google ditukar di server (client secret tidak pernah sampai ke HP), token sesi tidak ditaruh di URL (hanya kode sekali pakai selama 3 menit).
- Daftar dengan username + password tetap ada seperti biasa.

### Cara mengaktifkan
1. Buka [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → OAuth consent screen**: isi nama aplikasi & email, scope `email`, `profile`, `openid`. Lalu klik **Publish app**. Kalau masih *Testing*, hanya akun yang ditambahkan sebagai *test user* yang bisa masuk.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   **Authorized redirect URIs**: `https://streambeast.netlify.app/api/google-callback` (ganti dengan domain kamu; tambahkan juga domain Vercel/custom domain bila ada).
3. Isi Environment Variables di Netlify/Vercel lalu **deploy ulang**:

| Variabel | Isi |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID (…apps.googleusercontent.com) |
| `GOOGLE_CLIENT_SECRET` | Client secret |
| `APP_URL` *(opsional)* | Paksa domain untuk redirect URI, mis. `https://streambeast.netlify.app` |

Cek: `https://situs-kamu/api/auth?action=status` → harus `"google":true`. Bila login gagal dengan pesan "Redirect URI belum didaftarkan…", salin URI di pesan itu ke Google Cloud Console.

### APK Android
Google **memblokir login di dalam WebView**, jadi di APK halaman Google dibuka di Chrome (Custom Tab), lalu kembali ke aplikasi lewat deep link `com.musickuzyy.streambeats://auth`. Untuk itu ada plugin native baru, jadi **APK perlu dibangun ulang** (`npm run apk:release`). APK lama akan menampilkan pesan untuk memperbarui aplikasi. Web/PWA langsung jalan setelah deploy.

### Berkas baru/diubah
Baru: `src/lib/googleAuth.ts`, `api/google-callback.ts`, `api/_lib/vercelAuth.ts`, `netlify/functions/google-callback.ts`, `netlify/shared/authRespond.ts`, `android/app/src/main/java/com/musickuzyy/streambeats/ExternalAuthPlugin.java`.
Diubah: `api/_lib/auth.ts`, `api/auth.ts`, `netlify/functions/auth.ts`, `netlify.toml`, `vite.config.ts`, `src/lib/authApi.ts`, `src/store/auth.ts`, `src/pages/Auth.tsx`, `src/components/AccountSettings.tsx`, `MainActivity.java`, `AndroidManifest.xml`, `.env.example`.

## Baru di v4.2 — Bagikan lagu

- Tombol **Bagikan** kini membagikan link **YouTube Music** (`https://music.youtube.com/watch?v=…`).
- **APK**: membuka lembar **"Berbagi link"** bawaan Android (pratinjau link + tombol salin, kontak WhatsApp, Quick Share, Chrome, Discord, …) lewat plugin native baru `NativeSharePlugin.java`. **Perlu build ulang APK** (`npm run apk:debug` / `apk:release`).
- **Browser HP**: memakai menu bagikan sistem (`navigator.share`).
- **Desktop / APK lama**: lembar "Berbagi link" di dalam aplikasi (salin link, WhatsApp, Telegram, X, Facebook, Email).
- "Dengar Bareng" tetap memakai link Stream Beats (`/?play=…&t=…`) agar teman mulai di detik yang sama.

## Baru di v4.1 — Pengaturan baru

- Halaman **Pengaturan** didesain ulang: kartu profil di atas, lalu menu berkelompok (Antarmuka, Pemutar & Konten, Unduhan & Notifikasi, Penyimpanan & Data, Sistem & Tentang) dengan ikon & panah ke sub-halaman (`/settings/:bagian`).
- Tombol **Pengaturan (ikon gir)** pindah ke atas: header Beranda, header Pustaka, dan header desktop. Navigasi bawah kini 3 tab (Beranda, Cari, Pustaka).
- Tombol "Pesan" (placeholder yang hanya menampilkan "Belum ada pesan") diganti tombol Pengaturan.

## Fitur
- Beranda ala referensi: Spotlight (carousel otomatis), Speed Dial, Pilihan Cepat, rak-rak dari feed YT Music, scroll tanpa batas
- Pil mood di mobile (Chill, Focus, …) dipetakan ke chip asli YT Music
- Pencarian dengan saran langsung, hasil teratas, filter Lagu/Video/Album/Artis/Playlist, riwayat pencarian
- Halaman artis (Populer, Radio, Acak), album, playlist, mix
- Pemutar: antrean, acak, ulangi, radio otomatis saat antrean habis, kontrol Media Session (lock screen / tombol media)
- Lirik tersinkron (LRCLIB) dengan cadangan lirik YouTube Music
- Lagu disukai, playlist pribadi, riwayat — disimpan di perangkat (localStorage)
- Desktop 3 panel + player bar; mobile dengan mini player, layar penuh, navigasi bawah
- **Liquid glass**: player bar desktop melayang, mini player & navigasi bawah mobile berbahan kaca cair (blur + saturasi,
  kilau tepi, distorsi SVG di Chromium) yang warnanya mengikuti cover lagu. Bisa dimatikan di Pengaturan → Tampilan
- Warna dinamis ala Spotify dari cover album untuk player bar, mini player & layar penuh
- Timer tidur (5–90 menit atau akhir lagu, volume memudar 10 detik terakhir)
- Kecepatan putar 0.5x–2x
- Atur ulang antrean dengan menyeret (desktop & sentuh), total durasi antrean
- Gestur: geser mini player kiri/kanan = lagu berikut/sebelum; layar penuh: geser cover = ganti lagu, geser ke bawah = tutup
- Bagikan lagu (menu bagikan native di HP, salin tautan di desktop)
- Lanjutkan dari posisi terakhir saat aplikasi dibuka lagi
- Tombol maju/mundur 10 detik di lock screen (Media Session)
- Pintasan keyboard: Spasi (putar/jeda), ←/→ (±5 dtk), Shift+←/→ (lagu sebelum/berikut), Ctrl+↑/↓ (volume),
  M (bisu), S (acak), R (ulangi), L (lirik), Q (antrean), F (layar penuh)

## Menjalankan lokal
```bash
npm install
npm run dev        # buka http://localhost:5173
```
> Buka lewat **localhost**, bukan `127.0.0.1` — YouTube menolak embed (error 150) jika origin berupa alamat IP.

Build produksi: `npm run build && npm run preview` (http://localhost:4173).

## Deploy ke Vercel
1. Push folder ini ke GitHub, lalu *Import Project* di Vercel (preset **Vite** terdeteksi otomatis).
2. Selesai. Fungsi serverless ada di `api/yt.ts`; `vercel.json` mengarahkan rute SPA ke `index.html`.

## Deploy ke Netlify
Netlify **tidak bisa** lewat *drag & drop* (Netlify Drop hanya mengunggah file statis, fungsi `/api/yt` tidak ikut → beranda "Gagal memuat (404)").
Gunakan salah satu:
- **Dari GitHub:** Add new project → Import an existing project → pilih repo. Pengaturan dibaca otomatis dari `netlify.toml`
  (build `npm run build`, publish `dist`, fungsi di `netlify/functions`).
- **Netlify CLI:** `npm install`, `npx netlify login`, `npx netlify deploy --build --prod`.

Cek: `https://<situs>.netlify.app/api/yt?action=status` harus berisi `"ok":true`.

### YOUTUBE_API_KEY (opsional)
Tidak wajib. Jika diisi (Vercel → Settings → Environment Variables, atau file `.env` saat lokal),
key hanya dipakai sebagai **cadangan pencarian** lewat YouTube Data API v3 bila InnerTube gagal.
Jangan pernah menaruh key di kode front-end.

## Struktur
```
netlify/functions/yt.ts fungsi Netlify (memakai router yang sama)
api/yt.ts               fungsi Vercel: ?action=home|search|suggest|next|browse|lyrics|status
api/_lib/innertube.ts   klien InnerTube (WEB_REMIX) + parser respons
api/_lib/router.ts      router aksi (dipakai Vercel & plugin Vite saat dev)
src/lib/engine.ts       pembungkus YouTube IFrame Player (+ cari versi lain bila video ditolak embed)
src/store/              zustand: pemutar, pustaka, pengaturan
src/components, pages   UI
```

## Keterbatasan
- Beberapa video tidak boleh di-embed oleh pemiliknya; pemutar otomatis mencari versi lain lagu yang sama, lalu melompat bila tetap gagal.
- Ketersediaan lagu mengikuti wilayah (atur di Pengaturan → Wilayah).
- iOS Safari menjeda audio iframe saat layar dikunci / tab di latar belakang (batasan browser).
- InnerTube adalah API internal YouTube; jika YouTube mengubah formatnya, parser di `api/_lib/innertube.ts` perlu disesuaikan.
- Proyek ini untuk belajar/pribadi. Hormati Ketentuan Layanan YouTube.

## Baru di v2

- **Crossfade antarlagu** — dua pemutar YouTube tersembunyi; lagu berikutnya masuk perlahan (kurva equal-power) beberapa detik sebelum lagu sekarang selesai. Atur 0–12 detik di Pengaturan → Pemutaran (default 6 dtk). Tidak tersedia di iPhone/iPad karena batasan Safari.
- **Lirik layar penuh ala Spotify** — latar mengikuti warna cover, baris aktif putih, baris lewat redup, ketuk baris untuk lompat. Buka lewat tombol mikrofon, tombol "Lirik" di player penuh, atau tombol `L`.
- **Acak Cerdas (Smart Shuffle)** — tombol acak berputar: mati → acak → acak cerdas (ikon ✦). Lagu rekomendasi disisipkan ke antrean dengan label "Disarankan"; tekan + untuk menyimpannya ke Lagu Disukai.
- **Daily Mix** — rak "Dibuat untukmu" di Beranda, dibuat di perangkat dari artis teratas di Lagu Disukai & riwayat (diperbarui sekali sehari), plus "Mix Lagu Disukai". Halaman mix di `/mix/:id`.
- **Liquid glass di header & menu** — header desktop, header mobile yang menempel saat digulir, kotak & saran pencarian, menu ⋯ lagu, modal, dan toast.

## PWA (bisa diinstal + offline)

- **Instal**: Chrome/Edge/Android menampilkan tombol **Instal Aplikasi** di header, kartu "Pasang Stream Beats" di Beranda, dan tombol di Pengaturan → Aplikasi. iPhone/iPad: Safari → Bagikan → *Tambahkan ke Layar Utama* (petunjuk tampil otomatis).
- **Ikon**: `public/pwa-192x192.png`, `pwa-512x512.png`, `maskable-*.png` (Android adaptive), `apple-touch-icon.png`, `favicon-64.png`. Pintasan ikon: Cari, Lagu Disukai, Koleksi. Screenshot dialog instal di `public/screenshots/`.
- **Offline cache** (Workbox via `vite-plugin-pwa`):
  - App shell (HTML/JS/CSS/ikon) di-precache → aplikasi selalu terbuka, semua rute SPA jalan offline.
  - `/api/yt` → *NetworkFirst* (timeout 6 dtk, 400 entri, 7 hari): beranda, pencarian, album & artis yang pernah dibuka tetap tampil.
  - Lirik lrclib → *CacheFirst* (60 hari). Sampul → *CacheFirst* (600 entri, 30 hari).
  - Lagu Disukai, playlist, riwayat & pengaturan sudah tersimpan di perangkat (localStorage).
  - **Memutar audio tetap butuh internet** (streaming lewat pemutar YouTube; tidak bisa/ boleh di-cache). Saat offline muncul pil "Offline", dan pemutar tidak melompati antrean.
- **Pembaruan**: muncul pil "Versi baru tersedia → Muat ulang" (tidak memuat ulang diam-diam saat musik diputar). Cek versi baru tiap jam.
- **Hosting**: `vercel.json` & `netlify.toml` sudah mengatur `sw.js`/`manifest.webmanifest` tanpa cache panjang dan `assets/` immutable. PWA butuh **HTTPS** (Vercel/Netlify otomatis) — di lokal `npm run build && npm run preview` lalu buka `http://localhost:4173`.

## Baru di v3.3 — Tanpa login, langsung pilih selera musik

### 1. Tanpa login
Aplikasi **tidak memakai login lagi** (Firebase dan login Google/email dihapus). Saat pertama dibuka,
pengguna langsung masuk ke layar **pilih genre & artis**. Tidak perlu mengisi variabel `VITE_FIREBASE_*`.
Semua data (selera musik, playlist, lagu disukai) disimpan di perangkat masing-masing.

### 2. Pilih genre & artis (gaya Spotify)
Saat pertama kali membuka aplikasi, pengguna memilih **minimal 1 genre** lalu **minimal 3 artis**.
- Daftar artis diambil dari YouTube Music sesuai genre. Saat sebuah artis dipilih, artis serupa ikut muncul di daftar.
- Ada kolom pencarian artis.
- Pilihan disimpan di perangkat (`localStorage` → `sb-taste`).
- Beranda menampilkan rak **Artis favoritmu** dan **Karena kamu suka …**.
- Pilihan bisa diubah kapan saja lewat **Pengaturan → Genre & artis favorit → Ubah**.

### 3. Pengaturan
Bagian **Server** (Status sumber musik, Cadangan YouTube Data API) sudah disembunyikan. `YOUTUBE_API_KEY` di server tetap bekerja seperti sebelumnya bila diisi.
Ada opsi baru **Putar di latar belakang** (aktif secara default).

### 4. APK Android + putar di latar belakang
Folder `android/` adalah proyek **Capacitor**. Alamat bawaannya `https://streambeast.netlify.app`; bisa diganti lewat `CAP_SERVER_URL`.

> **Penting:** APK menampilkan versi yang sedang online di Netlify. Deploy dulu versi ini agar perubahan muncul di APK. Setelah deploy, hapus cache aplikasi di HP (Pengaturan → Aplikasi → Stream Beats → Penyimpanan → Hapus cache) bila masih tampil versi lama.

 APK memuat situs yang sudah kamu deploy (`CAP_SERVER_URL`), jadi fungsi `/api/yt` tetap berjalan di server dan setiap update web langsung ikut ke APK tanpa perlu build ulang.

Kebutuhan: Node 22+, Android Studio (JDK 21, Android SDK 36).

```bash
# 1) (opsional) CAP_SERVER_URL, bawaan: https://streambeast.netlify.app
npm install
npm run build
npx cap sync android

# 2) build
./gradlew assembleDebug        # → android/app/build/outputs/apk/debug/app-debug.apk
# atau buka di Android Studio: npx cap open android → Build → Generate Signed APK
```


**Cara kerja pemutaran latar di APK**
- `BackgroundWebView`: WebView yang selalu melapor "terlihat", sehingga pemutar YouTube tidak menjeda saat layar mati atau aplikasi diminimalkan.
- `PlaybackService`: foreground service bertipe `mediaPlayback` dengan notifikasi media (judul, artis, sampul, tombol sebelumnya/putar/jeda/berikutnya), MediaSession (tombol earphone/Bluetooth/layar kunci), wake lock, dan wifi lock.
- Plugin `BackgroundPlayback` menghubungkan pemutar web ↔ native (`src/lib/background.ts`).
- Saat pertama kali memutar lagu, Android 13+ akan meminta izin notifikasi. Izinkan agar notifikasi media muncul.

**Tips agar tidak berhenti:** di beberapa merek (Xiaomi/MIUI, Oppo/ColorOS, Vivo, Huawei, Samsung), buka *Setelan → Aplikasi → Stream Beats → Baterai* lalu pilih **Tanpa batasan / Jangan optimalkan**, dan aktifkan *Mulai otomatis* bila tersedia. Panduan per merek ada di <https://dontkillmyapp.com>.

**Keterbatasan**
- Di browser/PWA, pemutaran latar hanya *best-effort*. Aplikasi otomatis melanjutkan bila browser menjeda, tetapi browser seluler tetap bisa menghentikannya. Untuk pemutaran latar yang stabil, gunakan APK.
- iOS belum didukung (hanya proyek Android yang dibuat).
- Pemutaran memakai YouTube IFrame Player, jadi tetap tunduk pada ketentuan YouTube.

## Baru di v3.4 — Unduh untuk offline & impor playlist Spotify

### 1. Unduh musik, putar tanpa internet
- **Satu lagu:** ketuk ⋯ pada lagu → **Unduh (putar offline)**.
- **Satu playlist/album/Lagu Disukai:** tombol ⬇ di sebelah tombol Acak. Ketuk lagi untuk membatalkan / menghapus unduhan.
- **Pustaka → Lagu Diunduh** (`/downloads`): daftar lagu offline, progres unduhan, coba lagi yang gagal, total ukuran, hapus semua.
- Lagu yang sudah diunduh **selalu diputar dari file di perangkat** (lebih hemat kuota), termasuk saat offline.
  Saat offline, pil "Offline" punya tombol **Putar unduhan**; lagu yang belum diunduh di antrean dilompati otomatis.
- ⋯ → **Simpan file ke perangkat** menyimpan file `.m4a` ke folder Download.

Cara kerjanya:
- `api/dl.ts` mengambil audio **AAC/M4A (±128 kbps, ±1 MB per menit)** lewat InnerTube (klien `ANDROID_VR`, cadangan `IOS`),
  lalu meneruskannya per potongan **3 MB** (batas respons fungsi Vercel 4,5 MB). Tidak perlu API key.
- File disimpan di **IndexedDB** browser (`sb-offline`), metadata di `localStorage` (`sb-downloads`). Sampul ikut disimpan ke cache.
- Pemutaran file lokal memakai elemen `<audio>` biasa → kontrol lock screen jalan, tidak bergantung pada pemutar YouTube.

Catatan:
- Setiap unduhan lewat server Vercel → memakai kuota *Fast Data Transfer* (Hobby: 100 GB/bulan ≈ ±25.000 lagu).
- Jika YouTube memblokir IP server, unduhan gagal dengan pesan "Audio tidak bisa diambil" — perbarui versi klien di `api/_lib/audio.ts`.
- iPhone/iPad: Safari bisa menghapus data situs yang tidak dibuka 7 hari. **Pasang ke Layar Utama** agar unduhan aman.
- Unduhan hanya untuk pemakaian pribadi; hormati Ketentuan Layanan YouTube & hak cipta.

### 2. Impor playlist dari Spotify
- **Pustaka → ikon Impor** (atau kartu **Impor dari Spotify**, juga di sidebar desktop) → tempel link → **Lanjut** → **Impor**.
- Mendukung link playlist, album, lagu, `spotify:playlist:…`, dan link pendek `spotify.link`.
- Tanpa API key: `api/spotify.ts` membaca halaman embed Spotify (100 lagu pertama) lalu sisanya lewat API web player (maks. 2.000 lagu).
  (Web API resmi Spotify mode Development sejak Februari 2026 hanya boleh membaca playlist milik pengguna yang login, jadi tidak dipakai.)
- Tiap lagu dicocokkan ke YouTube Music berdasarkan judul, artis & durasi; hasilnya disimpan sebagai **playlist baru di perangkat**.
  Lagu yang tidak ditemukan ditampilkan di akhir. Centang **Unduh semua lagu** agar langsung bisa diputar offline.
- Playlist harus **Publik**. "Lagu yang Disukai" Spotify bersifat privat — salin dulu ke playlist publik di Spotify, lalu impor.

### Berkas baru
```
api/dl.ts, api/_lib/audio.ts          unduh audio per potongan
api/spotify.ts, api/_lib/spotify.ts   baca playlist/album Spotify
netlify/functions/dl.ts, spotify.ts   versi Netlify
src/store/downloads.ts, src/lib/idb.ts  antrean unduhan + IndexedDB
src/lib/spotifyImport.ts              pencocokan Spotify → YouTube Music
src/pages/Downloads.tsx               halaman Lagu Diunduh
src/components/DownloadButton.tsx, SpotifyImportModal.tsx
```

## Baru di v3.5 — Animasi pembuka, unduhan diperbaiki, kontrol pemutar lebih stabil

### 1. Animasi loading saat membuka web/aplikasi
- Splash screen langsung tampil (HTML/CSS inline di `index.html`, muncul sebelum JavaScript dimuat):
  logo dengan cincin denyut + orbit, bar equalizer bergerak, judul berkilau, tagline, dan progress bar.
- Ditutup halus setelah aplikasi siap (minimal ±1,5 detik agar animasi terlihat, maksimal 15 detik sebagai pengaman).
- Menghormati pengaturan *kurangi gerakan* (reduced motion). Kode: `src/lib/splash.ts`.

### 2. Unduhan musik diperbaiki
Penyebab utama: YouTube memblokir permintaan dari IP server/datacenter ("Sign in to confirm you're not a bot"),
dan kegagalan sebelumnya **diam-diam** (hanya di console). Perbaikan:
- **APK:** audio diunduh **langsung dari HP** (IP HP, bukan server) lewat `CapacitorHttp`
  (`src/lib/deviceDl.ts`), dengan cadangan `/api/dl`. Ini bekerja di APK lama juga, karena APK memuat situs (`server.url`) —
  cukup deploy ulang situsnya.
- **Server (`/api/dl`):** tambah klien InnerTube ANDROID, pesan error jelas bila IP server diblokir.
- Error permanen tidak diulang 4×; respons HTML/JSON terdeteksi (bukan audio); **toast** muncul tiap gagal/berhasil.
- **"Simpan file ke perangkat"** di APK kini lewat plugin native `FileSaver`
  (`android/.../FileSaverPlugin.java`) → tersimpan di **Music/Stream Beats** (Android 10+: MediaStore, tanpa izin;
  Android 7–9: folder Music milik aplikasi). **Butuh build APK baru**; APK lama akan menampilkan pesan untuk update.
- Catatan: di versi **web**, unduhan tetap bergantung pada IP server Vercel/Netlify tidak diblokir YouTube.

### 3. Tombol & fitur saat musik berjalan
- Mesin pemutar (`src/lib/engine.ts`): perintah YouTube Player tidak lagi dipanggil sebelum siap (dulu memicu error),
  Play menunggu player siap & memuat ulang lagu bila perlu, watchdog 7 detik menghapus spinner yang macet,
  Jeda langsung memperbarui UI, seek sebelum siap diantrekan.
- Progress bar: klik langsung pindah posisi; seret di mouse/sentuh/keyboard selalu tersimpan.
- "Mulai radio" di menu lagu selalu memuat radio; menu ditutup dengan Esc.
- **Dengar Bareng** (dulu "segera hadir") kini membagikan tautan `/?play=ID&t=DETIK` — penerima membuka lagu yang sama
  di posisi yang sama. Tombol Bagikan juga memakai tautan aplikasi.

### Berkas baru/diubah
`index.html`, `src/lib/splash.ts`, `src/main.tsx`, `src/lib/deviceDl.ts`, `src/lib/fileSaver.ts`, `src/store/downloads.ts`,
`api/_lib/audio.ts`, `src/lib/engine.ts`, `src/store/player.ts`, `src/components/Controls.tsx`, `src/components/TrackMenu.tsx`,
`src/lib/share.ts`, `src/components/DesktopHeader.tsx`, `src/App.tsx`,
`android/app/src/main/java/com/musickuzyy/streambeats/FileSaverPlugin.java`, `MainActivity.java`.

## Baru di v3.8 — Beranda baru, foto profil, cari pengguna & lihat playlist orang lain

### 1. Beranda didesain ulang
- **Sapaan besar** ("Selamat Pagi, Elfin" + tanggal) dengan **cahaya warna** yang mengikuti sampul lagu yang sedang/terakhir diputar.
- **Pintasan cepat** 2 kolom (4 kolom di desktop) seperti Spotify: Lagu Disukai, playlist kamu, dan lagu terakhir diputar — sekali ketuk langsung jalan; lagu yang sedang diputar diberi animasi equalizer. Pengguna baru mendapat pintasan dari rekomendasi.
- **Spotlight baru**: latar sampul yang diburamkan + **sampul persegi yang tajam** (tidak lagi gambar kecil yang direntangkan sampai pecah), garis progres per slide, tombol geser di desktop.
- **Speed Dial** lebih rapi (sudut membulat, penanda lagu aktif), kartu **Temukan teman** untuk langsung mencari username, skeleton loading baru.

### 2. Ganti foto profil
- **Profil → Edit profil** → ketuk foto / ikon kamera → pilih gambar dari galeri. Foto otomatis **dipotong persegi & dikompres** di HP (320×320 JPEG, ±20–40 KB) lalu disimpan di database. Bisa **Hapus foto** (kembali ke huruf depan + warna).
- Foto tampil di header, profil, hasil pencarian, dan profil publik. Server hanya menerima JPG/PNG/WEBP asli (dicek isi filenya) maks. 150 KB.

### 3. Cari pengguna lain & lihat playlist mereka
- Di **Cari**, ketik username (boleh pakai `@`): muncul baris **Pengguna** di hasil "Semua", atau pilih filter **Pengguna** untuk daftar lengkap. Bisa juga dari kartu **Temukan teman** di Beranda.
- Ketuk pengguna → **profil publik** (`/u/username`): foto, nama, @username, tanggal bergabung, jumlah playlist/lagu disukai/mengikuti, dan **daftar playlist**. Tombol **Bagikan** menyalin tautan profil.
- Buka playlist mereka (`/u/username/p/id`) → putar, acak, unduh, atau **Simpan ke Pustaka** (membuat salinan di playlist kamu).
- **Privasi**: Edit profil → **Profil publik** (bawaan: aktif). Jika dimatikan, orang lain tetap bisa menemukan username kamu, tapi playlist disembunyikan ("Profil ini privat").
- Playlist yang terlihat adalah versi yang **sudah tersinkron** ke akun (otomatis beberapa detik setelah diubah). Fitur sosial butuh login.
- Profil sendiri: tombol **Lihat profil publik** untuk melihat tampilan yang dilihat orang lain.

**Isi database baru:** `sb:avatar:<uid>` = foto profil, `sb:unames` = indeks username untuk pencarian (akun lama otomatis masuk indeks saat login/membuka aplikasi).

**Cara pakai:** deploy ulang situs (Netlify/Vercel) — tidak perlu variabel baru dan APK tidak perlu dibangun ulang. Setelah deploy, tutup penuh lalu buka lagi aplikasinya sekali.

### Berkas baru/diubah
Baru: `src/pages/UserProfile.tsx`, `src/components/{HomeHero,UserCards}.tsx`, `src/lib/imageResize.ts`. Diubah: `api/_lib/auth.ts`, `api/auth.ts`, `netlify/functions/auth.ts`, `vite.config.ts`, `src/App.tsx`, `src/pages/{Home,Search,Collection,Profile}.tsx`, `src/components/{Avatar,EditProfileModal,Spotlight,SpeedDial,MobileHeader}.tsx`, `src/lib/authApi.ts`, `src/store/auth.ts`, `tailwind.config.js`.

## Baru di v3.7 — Daftar biasa tanpa kode verifikasi + pembekuan setelah 3x salah password

### Pembaruan v3.7.1 — perbaikan tampilan lama yang tersangkut di cache
- Gejala: setelah deploy v3.7, HP masih menampilkan form lama (Email + "Kirim kode verifikasi") lalu muncul error "Username minimal 3 karakter". Penyebab: service worker PWA menyimpan tampilan lama dan menunggu semua tab/aplikasi ditutup sebelum memakai versi baru, sementara server sudah versi baru.
- Perbaikan: service worker baru langsung aktif (`skipWaiting`), aplikasi memuat ulang otomatis ke versi baru bila musik tidak sedang diputar, dan mengecek pembaruan setiap kali aplikasi dibuka dari latar belakang.
- Bila masih ada HP yang membuka tampilan lama, server sekarang memberi pesan jelas: "Aplikasi kamu masih versi lama… tutup aplikasi sepenuhnya lalu buka lagi".

### 1. Daftar & masuk
- **Tanpa email & tanpa kode verifikasi.** Layar sambutan → **Daftar gratis** → isi **Nama, Username, Password, Ulangi password** → akun langsung aktif dan masuk.
- Username: 3–20 karakter (huruf kecil, angka, titik, garis bawah), unik — ketersediaan dicek langsung saat mengetik.
- **Masuk** dengan username + password.
- Akun & password disimpan di **database (Upstash Redis)**. Password **tidak disimpan dalam bentuk asli** — hanya hash **scrypt** + salt acak per akun, jadi pemilik database pun tidak bisa membaca password pengguna.
- Akun lama dari v3.6 (daftar lewat email) tetap bisa masuk dengan mengetik **email** di kolom username.

### 2. Pembekuan input password
- Salah password **3x** → input password untuk akun itu **dibekukan 5 menit** (hitung mundur tampil di layar, tombol Masuk nonaktif).
- Status pembekuan disimpan di database, jadi berlaku di semua perangkat/browser — tidak bisa diakali dengan muat ulang halaman atau ganti HP.
- Setiap salah password, layar menampilkan sisa percobaan ("Sisa 2 percobaan sebelum dibekukan").
- Login berhasil → hitungan salah direset. Hitungan juga hilang sendiri setelah 30 menit tanpa percobaan.
- Username yang tidak terdaftar diperlakukan sama persis (tidak membocorkan username mana yang ada).
- Aturan yang sama berlaku untuk "password lama" saat **Ganti password** dan saat **Hapus akun**.
- Tambahan: maks. 30 percobaan salah/jam per jaringan (IP) dan 10 pendaftaran/jam per IP untuk mencegah spam.
- Bisa diatur lewat env: `LOGIN_MAX_ATTEMPTS` (default `3`) dan `LOGIN_LOCK_MINUTES` (default `5`).

> Karena tidak ada email, **tidak ada "Lupa password"**. Pengguna yang masih masuk bisa mengganti password di Pengaturan → Akun.

### 3. Cara mengaktifkan
Tambahkan Environment Variables di **Netlify** (Site configuration → Environment variables) atau **Vercel** (Settings → Environment Variables), lalu **deploy ulang**:

| Variabel | Isi |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Dari console.upstash.com → database Redis (gratis) → REST API |
| `AUTH_SECRET` | String acak ≥ 16 karakter (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `LOGIN_MAX_ATTEMPTS` *(opsional)* | Jumlah salah sebelum dibekukan, default `3` |
| `LOGIN_LOCK_MINUTES` *(opsional)* | Lama pembekuan dalam menit, default `5` |

Variabel email dari v3.6 (`SMTP_*`, `RESEND_API_KEY`, `MAIL_FROM`) **tidak dipakai lagi** dan boleh dihapus.

Cek: buka `https://situs-kamu/api/auth?action=status` → harus `"enabled":true`. Jika `false`, bagian `missing` menyebut variabel yang belum diisi.

**Isi database** (dilihat di Upstash → Data Browser): `sb:user:<uid>` = data akun (username, nama, hash password), `sb:uname:<username>` = penunjuk ke uid, `sb:lock:<akun>` = pembekuan aktif (hilang otomatis), `sb:lfail:<akun>` = jumlah salah, `sb:data:<uid>` = pustaka tersinkron.

**Lokal:** `npm run dev` otomatis memakai *mode pengembang* (database di memori). `AUTH_DEV=0 npm run dev` untuk memakai Upstash dari `.env`.

### Berkas diubah
`api/_lib/auth.ts`, `api/auth.ts`, `netlify/functions/auth.ts`, `vite.config.ts`, `src/lib/authApi.ts`, `src/store/auth.ts`, `src/pages/{Auth,Profile}.tsx`, `src/components/AccountSettings.tsx`, `package.json` (nodemailer dihapus), `.env.example`. `src/components/auth/OtpInput.tsx` dihapus.

## Baru di v3.6 — Akun dengan verifikasi email & fitur ala aplikasi musik

### 1. Daftar dengan email + kode verifikasi acak
- Layar sambutan → **Daftar gratis** (nama, email, password) → kode **6 digit acak** dikirim ke email → masukkan kode → akun aktif dan langsung masuk.
- Kode dibuat dengan `crypto.randomInt`, disimpan dalam bentuk hash (HMAC), **berlaku 10 menit**, bisa **kirim ulang** setelah 60 detik.
- **5x salah** → kode dikunci, harus minta kode baru. Batas kirim: 6 email/jam per alamat, 20/jam per IP. Login salah 8x → dikunci 15 menit.
- Password minimal 8 karakter, ada huruf & angka (ada indikator kekuatan), disimpan dengan **scrypt**.
- **Lupa password** → kode ke email → buat password baru (semua perangkat lain otomatis keluar).
- Kotak kode mendukung tempel (paste) & isi otomatis, terkirim otomatis saat 6 digit lengkap.
- Login wajib bila fitur akun aktif. Isi `AUTH_OPTIONAL=1` kalau ingin tetap ada tombol **Lanjut tanpa akun**.

### 2. Fitur baru ala aplikasi musik
- **Sinkron cloud**: lagu disukai, playlist, riwayat, artis yang diikuti, selera musik & statistik ikut ke akun — login di HP/web lain, semuanya kembali. Perubahan dikirim otomatis (±4 detik), diambil lagi saat aplikasi dibuka/online. Penggabungan cerdas: tidak ada data yang hilang walau dipakai di 2 perangkat.
- **Halaman Profil** (ketuk avatar di pojok): total waktu dengar, jumlah putar, **streak harian**, grafik 7 hari, **lagu & artis teratas**, riwayat terakhir. Sebuah lagu dihitung "diputar" setelah 30 detik (atau 50% durasi).
- **Ikuti artis** (tombol Ikuti di halaman artis) + tab **Artis** di Pustaka.
- **Ubah profil**: nama & warna avatar. Sapaan beranda memakai nama kamu ("Selamat Pagi, Rina").
- **Pengaturan → Akun**: status sinkron + Sinkronkan sekarang, ubah password, keluar, keluar dari semua perangkat, hapus akun. Juga bagian **Selera musik** untuk mengatur ulang genre/artis.
- Saat keluar, data akun dihapus dari perangkat (lagu unduhan tetap ada).

### 3. Cara mengaktifkan (wajib agar email benar-benar terkirim)
Tambahkan Environment Variables di **Netlify** (Site configuration → Environment variables) atau **Vercel** (Settings → Environment Variables), lalu **deploy ulang**:

| Variabel | Isi |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Dari console.upstash.com → database Redis (gratis) → REST API |
| `AUTH_SECRET` | String acak ≥ 16 karakter (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS` | Gmail + **App password** (myaccount.google.com/apppasswords, perlu 2FA) |
| *atau* `RESEND_API_KEY` | Resend, domain pengirim harus diverifikasi |
| `MAIL_FROM` | mis. `Stream Beats <emailkamu@gmail.com>` |

Cek: buka `https://situs-kamu/api/auth?action=status` → harus `"enabled":true`. Jika `false`, bagian `missing` menyebut variabel yang belum diisi. Selama belum diisi, aplikasi tetap jalan dalam mode tamu.

**APK tidak perlu dibangun ulang** untuk fitur akun — APK memuat situs (`CAP_SERVER_URL`), jadi cukup deploy ulang web.

**Lokal:** `npm run dev` otomatis memakai *mode pengembang* — database di memori, email dicetak di terminal, dan kode ditampilkan di layar (banner emas). `AUTH_DEV=0 npm run dev` untuk memakai DB & email sungguhan dari `.env`.

### Berkas baru/diubah
`api/_lib/auth.ts`, `api/auth.ts`, `netlify/functions/auth.ts`, `netlify.toml`, `vite.config.ts`, `src/lib/{authApi,sync,listenStats}.ts`, `src/store/{auth,follows,stats,syncMeta}.ts`, `src/pages/{Auth,Profile}.tsx`, `src/components/{Avatar,EditProfileModal,AccountSettings}.tsx`, `src/components/auth/OtpInput.tsx`, serta penyesuaian di `App.tsx`, `player.ts`, `Settings`, `Artist`, `Library`, `Collection`, header.

## Baru di v3.9

- **Ganti akun** — Pengaturan → Akun → *Ganti akun*. Akun yang pernah masuk di perangkat ini tersimpan (maks. 5) dan bisa dipilih sekali ketuk; pustaka tiap akun terpisah & disinkronkan sebelum berpindah. *Tambah* membuka layar masuk tanpa mengeluarkan akun lain. Layar masuk juga menampilkan "Akun di perangkat ini".
- **Impor file musik sendiri** — Lagu Diunduh → *Impor file* (mp3, m4a, aac, ogg, opus, wav, flac). Nama "Artis - Judul.mp3" dibaca otomatis; file diputar offline seperti lagu unduhan.
- **Playlist & album tersimpan untuk offline** — playlist/album YouTube Music yang pernah dibuka disimpan di perangkat (25 terakhir), jadi tetap bisa dibuka saat offline.
- **Filter "Terunduh"** di halaman playlist/album — tampilkan & putar hanya lagu yang sudah diunduh.
- **Pesan gagal unduh lebih ringkas** — mis. `Gagal unduh "Judul" · Diblokir YouTube`; kegagalan beruntun digabung jadi satu pesan (`Gagal unduh 5 lagu · …`).

## Baru di v4.0

### 🔔 Notifikasi rilisan baru dari artis yang diikuti
- Ikon lonceng (header mobile & desktop) kini berfungsi: badge merah menunjukkan jumlah rilisan baru, ketuk untuk melihat daftar
  (album, single, EP) lalu langsung membuka halaman rilisan.
- Diperiksa otomatis saat aplikasi dibuka, saat kembali ke aplikasi, dan tiap 30 menit (tiap artis paling sering 3 jam sekali,
  3 permintaan paralel). Tombol ⟳ di panel notifikasi memeriksa semua artis sekarang juga.
- Artis yang baru diikuti hanya dicatat katalognya (tanpa spam); rilisan tahun ini tampil sebagai "Rilisan terbaru".
- Bisa dimatikan di Pengaturan → Unduhan & notifikasi. Kode: `src/store/releases.ts`, `src/components/NotificationBell.tsx`.

### ⬇️ Unduhan offline: cari link lain bila YouTube Music menolak
Urutan sumber per lagu (`src/store/downloads.ts` → `fetchAudio`):
1. **YouTube langsung** — APK: dari HP (IP HP); browser: lewat server `/api/dl`.
2. **Mirror cadangan** — Piped / Invidious / Cobalt yang meneruskan audio lewat server mereka (lolos walau IP dianggap bot).
   Daftar instance publik terbaru diambil otomatis (`/api/yt?action=mirrors`), plus mirror buatan sendiri di
   Pengaturan → Unduhan (tombol **Uji mirror** untuk mengecek). Server `/api/dl` juga otomatis mencoba mirror.
3. **Link lain (versi lain)** — bila semua gagal, aplikasi mencari unggahan lain dari lagu yang sama (audio resmi/Topic,
   video musik, video lirik) yang cocok judul, artis & durasinya (±20 dtk; versi live/cover/remix/karaoke dilewati),
   lalu mengulang langkah 1–2. File disimpan dengan ID lagu asli, jadi langsung bisa diputar offline.

Catatan teknis: klien YouTube IOS/ANDROID tanpa PO token hanya memberi ±1 MB pertama lalu 403 — kini terdeteksi dan langsung
lanjut ke sumber berikutnya. Blokir "Sign in to confirm you're not a bot" terikat ke IP/jaringan: bila semua sumber gagal,
coba ganti jaringan (Wi-Fi ↔ data seluler) lalu **Coba lagi**.
