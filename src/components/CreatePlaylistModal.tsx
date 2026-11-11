import { useState } from 'react';
import Modal from './Modal';
import { usePlayer } from '../store/player';
import { toast } from '../lib/toast';
import type { Track } from '../lib/types';

/** Tag mood yang umum dipakai — bisa dipilih lebih dari satu (maks. 4) */
export const MOOD_TAGS = [
  { id: 'semangat', label: 'Semangat', emoji: '🔥' },
  { id: 'santai', label: 'Santai', emoji: '☕' },
  { id: 'sedih', label: 'Sedih', emoji: '🌧️' },
  { id: 'fokus', label: 'Fokus', emoji: '🧠' },
  { id: 'romantis', label: 'Romantis', emoji: '💗' },
  { id: 'energi', label: 'Energi', emoji: '⚡' },
  { id: 'malam', label: 'Malam', emoji: '🌙' },
  { id: 'lari', label: 'Lari', emoji: '🏃' },
  { id: '_relaksasi', label: 'Relaksasi', emoji: '🌿' },
  { id: 'party', label: 'Party', emoji: '🎉' },
];

/** Ubah label tag + emoji jadi bentuk ringkas "emoji Label" */
export const tagLabel = (t: string) => {
  const found = MOOD_TAGS.find((m) => m.id === t);
  return found ? `${found.emoji} ${found.label}` : t;
};

export default function CreatePlaylistModal({ open, onClose, withTrack }: { open: boolean; onClose: () => void; withTrack?: Track }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const create = usePlayer((s) => s.createPlaylist);
  const add = usePlayer((s) => s.addToPlaylist);
  const toggle = (id: string) => setTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    const id = create(n, desc.trim() || undefined, tags);
    if (withTrack) add(id, withTrack);
    toast(`Playlist "${n}" dibuat`);
    setName('');
    setDesc('');
    setTags([]);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Buat playlist">
      <div className="space-y-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Nama playlist"
          className="w-full bg-white/10 placeholder:text-white/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-white/30"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Deskripsi (opsional)"
          rows={3}
          className="w-full bg-white/10 placeholder:text-white/50 rounded-xl px-4 py-3 outline-none resize-none focus:ring-2 focus:ring-white/30"
        />
        <div>
          <p className="text-xs text-zinc-400 mb-2">Mood (maks. 4)</p>
          <div className="flex flex-wrap gap-2">
            {MOOD_TAGS.map((m) => {
              const on = tags.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                  className={`px-3 py-1.5 rounded-full text-sm transition ${on ? 'bg-white text-black font-medium' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}
                >
                  {m.emoji} {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="w-full py-3 rounded-full bg-white text-black font-bold disabled:opacity-40 hover:scale-[1.02] transition"
        >
          Simpan
        </button>
      </div>
    </Modal>
  );
}
