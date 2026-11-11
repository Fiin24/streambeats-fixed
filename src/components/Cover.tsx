import { useState } from 'react';
import { Music2 } from 'lucide-react';
import { img } from '../lib/img';

export default function Cover({ src, size = 300, alt = '', className = '', rounded = 'rounded-md' }: {
  src?: string; size?: number; alt?: string; className?: string; rounded?: string;
}) {
  const [err, setErr] = useState(false);
  if (!src || err)
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900 ${rounded} ${className}`}>
        <Music2 className="w-1/3 h-1/3 text-zinc-400" />
      </div>
    );
  return (
    <img
      src={img(src, size)}
      alt={alt}
      loading="lazy"
      draggable={false}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setErr(true)}
      className={`object-cover bg-zinc-800 ${rounded} ${className}`}
    />
  );
}
