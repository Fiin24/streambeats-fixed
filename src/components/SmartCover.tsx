import type { SmartList } from '../lib/smartLists';
import Cover from './Cover';

/** Sampul playlist pintar: kolase 4 sampul di atas warna khas, dengan label tipis di bawah */
export default function SmartCover({ list, className = '' }: { list: SmartList; className?: string }) {
  const arts = list.tracks.slice(0, 4);
  return (
    <div className={`relative overflow-hidden rounded-md [container-type:inline-size] ${className}`} style={{ background: list.tone }}>
      {arts.length >= 4 ? (
        <div className="absolute inset-0 grid grid-cols-2 opacity-90">
          {arts.map((t) => <Cover key={t.videoId} src={t.thumbnail} size={240} className="w-full h-full" rounded="rounded-none" />)}
        </div>
      ) : arts[0] ? (
        <Cover src={arts[0].thumbnail} size={400} className="absolute inset-0 w-full h-full opacity-90" rounded="rounded-none" />
      ) : null}
      <div className="absolute inset-x-0 bottom-0 h-[46%]" style={{ background: `linear-gradient(transparent, ${list.tone})` }} />
      <p className="absolute left-[8%] right-[8%] bottom-[8%] text-white font-bold leading-[1.05] tracking-tight text-[clamp(13px,9cqw,28px)] drop-shadow">
        {list.title}
      </p>
    </div>
  );
}
