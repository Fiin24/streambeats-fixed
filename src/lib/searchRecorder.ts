import { createContext, useContext } from 'react';
import type { Item } from './types';

/** Disediakan halaman Cari: item yang dibuka dari hasil pencarian masuk ke riwayat per kategori */
export const SearchRecorder = createContext<((it: Item) => void) | null>(null);
export const useSearchRecorder = () => useContext(SearchRecorder);
