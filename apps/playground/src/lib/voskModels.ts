import { useEffect, useState } from 'react';

/** Vosk models the deploy workflow tries to package (see .github/workflows/deploy.yml). */
export interface VoskModel {
  id: string;
  lang: string;
  flag: string;
  sizeMB: number;
  note?: string;
}

export const VOSK_MODELS: VoskModel[] = [
  { id: 'vosk-model-small-pl-0.22', lang: 'Polish', flag: '🇵🇱', sizeMB: 50 },
  { id: 'vosk-model-small-en-us-0.15', lang: 'English (US)', flag: '🇺🇸', sizeMB: 40 },
  { id: 'vosk-model-en-us-0.22-lgraph', lang: 'English (US)', flag: '🇺🇸', sizeMB: 128, note: 'Bigger, more accurate' },
  { id: 'vosk-model-small-en-in-0.4', lang: 'English (India)', flag: '🇮🇳', sizeMB: 36 },
  { id: 'vosk-model-small-de-0.15', lang: 'German', flag: '🇩🇪', sizeMB: 45 },
  { id: 'vosk-model-small-fr-0.22', lang: 'French', flag: '🇫🇷', sizeMB: 41 },
  { id: 'vosk-model-small-es-0.42', lang: 'Spanish', flag: '🇪🇸', sizeMB: 39 },
  { id: 'vosk-model-small-it-0.22', lang: 'Italian', flag: '🇮🇹', sizeMB: 48 },
  { id: 'vosk-model-small-pt-0.3', lang: 'Portuguese', flag: '🇵🇹', sizeMB: 31 },
  { id: 'vosk-model-small-nl-0.22', lang: 'Dutch', flag: '🇳🇱', sizeMB: 39 },
  { id: 'vosk-model-small-cs-0.4-rhasspy', lang: 'Czech', flag: '🇨🇿', sizeMB: 44 },
  { id: 'vosk-model-small-ru-0.22', lang: 'Russian', flag: '🇷🇺', sizeMB: 45 },
];

export const voskModelUrl = (id: string) => `${import.meta.env.BASE_URL}models/${id}.tar.gz`;

/**
 * Models actually deployed with the site: the workflow writes models/vosk.json ([{ id, bytes }]).
 * `deployed` is null while loading and when the manifest is missing (e.g. local dev) – then all are listed.
 */
export function useVoskModels() {
  const [deployed, setDeployed] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}models/vosk.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((list: { id: string; bytes: number }[] | null) => {
        if (!cancelled && Array.isArray(list)) setDeployed(Object.fromEntries(list.map((m) => [m.id, m.bytes])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const models = deployed ? VOSK_MODELS.filter((m) => m.id in deployed).map((m) => ({ ...m, sizeMB: Math.round(deployed[m.id] / 2 ** 20) })) : VOSK_MODELS;
  return { models, manifestFound: deployed !== null };
}
