import { useState } from 'react';
import { useAuth } from '../store/auth';

/** Avatar umum: foto profil bila ada, selain itu huruf depan nama dengan warna pilihan */
export function UserAvatar({ name, color, avatar, size = 40, className = '' }: {
  name?: string; color?: string; avatar?: string | null; size?: number; className?: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const letter = (name || '').trim().charAt(0).toUpperCase();
  const showImg = !!avatar && broken !== avatar;
  return (
    <span
      className={`relative rounded-full flex items-center justify-center font-extrabold text-black shrink-0 select-none overflow-hidden ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.45, background: color || '#ff6c25' }}
      aria-hidden="true"
    >
      {showImg ? (
        <img src={avatar!} alt="" loading="lazy" decoding="async" onError={() => setBroken(avatar!)} className="absolute inset-0 w-full h-full object-cover" />
      ) : letter || (
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
      )}
    </span>
  );
}

/** Avatar akun yang sedang masuk */
export default function Avatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  const user = useAuth((s) => s.user);
  const signed = useAuth((s) => !!s.token);
  return (
    <UserAvatar
      name={signed ? user.name : ''}
      color={signed ? user.color : undefined}
      avatar={signed ? user.avatar : null}
      size={size}
      className={className}
    />
  );
}
