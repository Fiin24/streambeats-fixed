export default function Eq({ playing = true, className = '' }: { playing?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[2px] h-3.5 ${className}`} aria-label="Sedang diputar">
      {[0, 0.2, 0.4, 0.1].map((d, i) => (
        <span
          key={i}
          className={`w-[3px] h-full bg-spotify rounded-sm origin-bottom ${playing ? 'animate-eq' : 'scale-y-[.3]'}`}
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </span>
  );
}
