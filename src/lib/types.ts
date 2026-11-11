export type { Item, Section, Artist, ItemType, HomePage, Chip, NextPage, BrowsePage } from '../../api/_lib/innertube';
import type { Item } from '../../api/_lib/innertube';

/** Item yang pasti bisa diputar */
export type Track = Item & { videoId: string; /** ditambahkan oleh Acak Cerdas */ rec?: boolean; /** waktu disukai (untuk sinkronisasi) */ addedAt?: number; /** waktu diputar (riwayat) */ playedAt?: number };
export const isPlayable = (i: Item): i is Track => !!i.videoId;

export interface UserPlaylist {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  createdAt: number;
  /** terakhir diubah (untuk sinkronisasi antarperangkat) */
  updatedAt?: number;
  tracks: Track[];
}
