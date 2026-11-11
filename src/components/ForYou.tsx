import { useEffect, useState } from 'react';
import { search } from '../lib/api';
import { genreById } from '../lib/genres';
import type { Item, Section } from '../lib/types';
import { useAuth } from '../store/auth';
import { useTaste } from '../store/taste';
import Shelf from './Shelf';

/** Rak personal di Beranda dari genre & artis yang dipilih saat onboarding */
export default function ForYou() {
  const uid = useAuth((s) => s.user?.uid);
  const taste = useTaste((s) => (uid ? s.byUser[uid] : undefined));
  const [genreShelves, setGenreShelves] = useState<Section[]>([]);

  const key = taste ? `${taste.genres.join(',')}|${taste.updatedAt}` : '';
  useEffect(() => {
    if (!taste?.genres.length) { setGenreShelves([]); return; }
    let alive = true;
    const gs = taste.genres.map(genreById).filter(Boolean).slice(0, 3);
    Promise.all(
      gs.map(async (g) => {
        const r = await search(`lagu ${g!.q} populer`, 'songs').catch(() => null);
        const items = (r?.sections || []).flatMap((s) => s.items).filter((i) => i.videoId && i.thumbnail).slice(0, 16);
        return items.length >= 4 ? ({ strapline: 'Karena kamu suka', title: g!.name, layout: 'list', items } as Section) : null;
      }),
    ).then((list) => alive && setGenreShelves(list.filter((s): s is Section => !!s)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!taste) return null;
  const artists: Item[] = taste.artists.map((a) => ({
    type: 'artist', id: a.id, browseId: a.id, title: a.name, subtitle: 'Artis', artists: [], thumbnail: a.thumbnail,
  }));
  return (
    <>
      {artists.length > 0 && <Shelf section={{ title: 'Artis favoritmu', layout: 'cards', items: artists }} />}
      {genreShelves.map((s) => <Shelf key={s.title} section={s} />)}
    </>
  );
}
