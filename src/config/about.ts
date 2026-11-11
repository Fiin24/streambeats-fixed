/**
 * Data halaman Pengaturan → Tentang.
 * Ubah file ini saja untuk mengganti nama pengembang, foto, atau menambah media sosial.
 */

export type SocialIcon = 'telegram' | 'tiktok' | 'instagram' | 'youtube' | 'github' | 'facebook' | 'twitter' | 'link';

export interface SocialLink {
  /** Nama platform, mis. "Telegram" */
  label: string;
  /** Nama pengguna yang ditampilkan, mis. "@finzdev" */
  handle: string;
  /** Tautan lengkap, mis. "https://t.me/finzdev" */
  url: string;
  icon: SocialIcon;
}

export const DEVELOPER = {
  name: 'FINZ.DEV',
  role: 'Pengembang',
  /** Gambar latar kartu pengembang (taruh file di folder public/, mis. '/dev-banner.jpg'). Kosong = latar efek cahaya. */
  banner: '/about/dev-banner.jpg',
  /** Foto profil bulat (mis. '/dev-avatar.jpg'). Kosong = inisial nama. */
  avatar: '/about/dev-avatar.jpg',
};

/** Nama aplikasi yang tampil besar di kartu atas halaman Tentang */
export const APP_NAME = 'Stream Beast';

/** Label kecil di samping nomor versi */
export const APP_BADGE = 'UNIVERSAL';

/** Warna aksen halaman Tentang (badge versi & tulisan PENGEMBANG) */
export const ABOUT_ACCENT = '#D9653B';

/**
 * Media sosial — sengaja dikosongkan dulu. Contoh menambah:
 * { label: 'Telegram', handle: '@finzdev', url: 'https://t.me/finzdev', icon: 'telegram' },
 * { label: 'TikTok', handle: '@finzdev', url: 'https://www.tiktok.com/@finzdev', icon: 'tiktok' },
 */
export const SOCIALS: SocialLink[] = [];
