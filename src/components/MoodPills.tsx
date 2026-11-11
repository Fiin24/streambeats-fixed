export const MOODS = ['Chill', 'Focus', 'Commute', 'Gaming', 'Energize', 'Party', 'Feel good', 'Romance', 'Workout', 'Sleep', 'Sad', 'Happy', 'Nostalgia', 'Acoustic', 'Pop', 'Rock'];

/** Pemetaan pil ke chip asli YouTube Music (nama chip berbahasa Indonesia) */
export const MOOD_TO_CHIP: Record<string, string[]> = {
  Chill: ['Bersantai', 'Relax', 'Santai'],
  Focus: ['Fokus', 'Focus'],
  Commute: ['Perjalanan', 'Commute'],
  Energize: ['Mengisi energi', 'Energize'],
  Party: ['Pesta', 'Party'],
  'Feel good': ['Senang', 'Feel good'],
  Happy: ['Senang', 'Feel good'],
  Romance: ['Romansa', 'Romance'],
  Workout: ['Olahraga', 'Workout'],
  Sleep: ['Tidur', 'Sleep'],
  Sad: ['Sedih', 'Sad'],
};

export default function MoodPills({ active, onSelect }: { active: string | null; onSelect: (m: string | null) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-0 lg:px-0 mb-5">
      {MOODS.map((m) => (
        <button
          key={m}
          onClick={() => onSelect(active === m ? null : m)}
          className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold transition border
            ${active === m ? 'bg-white text-black border-white' : 'bg-[#1f1f1f] text-white border-white/10 hover:bg-[#2a2a2a]'}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
