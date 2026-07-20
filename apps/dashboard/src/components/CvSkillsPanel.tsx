import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, type SkillCount } from '@/lib/api';
import type { Cv } from '@joblog/shared';

interface Props {
  cvs: Omit<Cv, 'content'>[];
}

export function CvSkillsPanel({ cvs }: Props) {
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [loadedForId, setLoadedForId] = useState<string | null>(null);
  const [present, setPresent] = useState<SkillCount[]>([]);
  const [missing, setMissing] = useState<SkillCount[]>([]);
  const [analyzedCount, setAnalyzedCount] = useState(0);

  const effectiveCvId =
    selectedCvId && cvs.some((cv) => cv._id === selectedCvId) ? selectedCvId : (cvs[0]?._id ?? null);
  const isLoading = effectiveCvId !== null && loadedForId !== effectiveCvId;

  useEffect(() => {
    if (!effectiveCvId) return;
    let active = true;
    api.cvs
      .skills(effectiveCvId)
      .then((res) => {
        if (!active) return;
        setPresent(res.present);
        setMissing(res.missing);
        setAnalyzedCount(res.analyzedCount);
        setLoadedForId(effectiveCvId);
      })
      .catch(() => {
        if (!active) return;
        setPresent([]);
        setMissing([]);
        setAnalyzedCount(0);
        setLoadedForId(effectiveCvId);
      });
    return () => {
      active = false;
    };
  }, [effectiveCvId]);

  if (cvs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Compétences des offres analysées</p>
        <Select value={effectiveCvId ?? ''} onValueChange={setSelectedCvId}>
          <SelectTrigger className="h-8 w-56 text-sm">
            <SelectValue placeholder="Choisir un CV" />
          </SelectTrigger>
          <SelectContent>
            {cvs.map((cv) => (
              <SelectItem key={cv._id} value={cv._id}>
                {cv.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : analyzedCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune analyse IA pour ce CV pour le moment. Lance une analyse depuis une candidature pour voir apparaître les compétences ici.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <SkillColumn title="Compétences présentes les plus demandées" skills={present} tone="green" />
          <SkillColumn title="Compétences absentes les plus demandées" skills={missing} tone="red" />
        </div>
      )}
    </div>
  );
}

function SkillColumn({
  title,
  skills,
  tone,
}: {
  title: string;
  skills: SkillCount[];
  tone: 'green' | 'red';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
      : 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30';

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
      {skills.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune donnée.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {skills.slice(0, 10).map((s) => (
            <li key={s.skill} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{s.skill}</span>
              <span className={`rounded-full px-1.5 text-xs font-medium leading-tight ${toneClass}`}>
                {s.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
