import { useNavigate } from 'react-router-dom';
import type { Item, Track } from './types';
import { isPlayable } from './types';
import { usePlayer } from '../store/player';
import { browse, getNext } from './api';
import { toast } from './toast';

export const linkFor = (i: Item): string =>
  i.type === 'artist' ? `/artist/${i.browseId}` : i.type === 'album' ? `/album/${i.browseId}` : `/playlist/${i.browseId}`;

export async function tracksOf(item: Item): Promise<Track[]> {
  if (item.videoId) return [item as Track];
  if (item.browseId) {
    const p = await browse(item.browseId);
    const tr = p.tracks.filter(isPlayable);
    if (tr.length) return tr;
    const pid = item.playlistId || p.playlistId || p.radioPlaylistId;
    if (pid) return (await getNext(undefined, pid)).tracks.filter(isPlayable);
  }
  if (item.playlistId) return (await getNext(undefined, item.playlistId)).tracks.filter(isPlayable);
  return [];
}

export function useItemActions() {
  const navigate = useNavigate();
  const open = (item: Item, context?: Item[]) => {
    const { playTrack } = usePlayer.getState();
    if (isPlayable(item)) {
      const list = context?.filter(isPlayable);
      playTrack(item, list && list.length > 1 ? list : undefined);
      return;
    }
    if (item.browseId) navigate(linkFor(item));
  };
  const play = async (item: Item, shuffle = false) => {
    const { playTrack, playList } = usePlayer.getState();
    if (isPlayable(item)) return playTrack(item);
    try {
      const tracks = await tracksOf(item);
      if (tracks.length) playList(tracks, 0, shuffle);
      else toast('Tidak ada lagu yang bisa diputar');
    } catch (e: any) {
      toast(e?.message || 'Gagal memuat lagu');
    }
  };
  return { open, play, navigate };
}
