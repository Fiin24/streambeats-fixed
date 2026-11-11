import { Heart } from 'lucide-react';
import type { Track } from '../lib/types';
import { usePlayer, useIsLiked } from '../store/player';

export default function LikeButton({ track, className = '', size = 'w-5 h-5' }: { track: Track; className?: string; size?: string }) {
  const liked = useIsLiked(track.videoId);
  const toggle = usePlayer((s) => s.toggleLike);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(track); }}
      aria-label={liked ? 'Batal suka' : 'Suka'}
      className={`p-1.5 rounded-full transition active:scale-90 ${liked ? 'text-brand' : 'text-zinc-400 hover:text-white'} ${className}`}
    >
      <Heart className={`${size} ${liked ? 'fill-brand' : ''}`} />
    </button>
  );
}
