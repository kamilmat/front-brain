/**
 * Keyword / command spotting over live transcripts.
 * Tolerant to inflection (Polish endings: następny / następna / następnego) and small ASR typos.
 */

export interface VoiceCommand {
  id: string;
  /** Phrases that trigger the command; each may have several words ("lights off"). */
  phrases: string[];
}

export interface CommandMatch {
  id: string;
  phrase: string;
  /** Index of the first matched word in the normalised transcript. */
  index: number;
}

/** Lowercase, strip diacritics (ą→a, ł→l…) and punctuation, split into words. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Does a spoken word match a keyword word? */
export function wordMatches(spoken: string, keyword: string): boolean {
  if (spoken === keyword) return true;
  if (keyword.length <= 3) return false;
  // Stem match for inflected languages: keep all but the last 2 chars (min 4).
  const stem = keyword.slice(0, Math.max(4, keyword.length - 2));
  if (spoken.startsWith(stem) && spoken.length <= keyword.length + 4) return true;
  return keyword.length >= 5 && levenshtein(spoken, keyword) <= 1;
}

/** All command phrases found in a transcript (in order of appearance). */
export function findCommands(text: string, commands: VoiceCommand[]): CommandMatch[] {
  const words = normalizeWords(text);
  const out: CommandMatch[] = [];
  for (const c of commands) {
    for (const phrase of c.phrases) {
      const kw = normalizeWords(phrase);
      if (!kw.length) continue;
      for (let i = 0; i + kw.length <= words.length; i++) {
        if (kw.every((k, j) => wordMatches(words[i + j], k))) {
          out.push({ id: c.id, phrase, index: i });
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Feeds interim + final transcripts and reports each command occurrence once per utterance,
 * so a command fires as soon as it appears in an interim result and not again when the final arrives.
 */
export class KeywordSpotter {
  private fired = new Map<string, Set<string>>();

  constructor(public commands: VoiceCommand[]) {}

  feed(text: string, utteranceId: string, final = false): CommandMatch[] {
    const seen = this.fired.get(utteranceId) ?? new Set<string>();
    this.fired.set(utteranceId, seen);
    const fresh: CommandMatch[] = [];
    for (const m of findCommands(text, this.commands)) {
      const key = `${m.id}@${m.index}`;
      // Interim results shift word positions; treat the same command within ±2 words as the same occurrence.
      const dup = [...seen].some((k) => {
        const [id, idx] = k.split('@');
        return id === m.id && Math.abs(+idx - m.index) <= 2;
      });
      if (!dup) {
        seen.add(key);
        fresh.push(m);
      }
    }
    if (final) this.fired.delete(utteranceId);
    if (this.fired.size > 50) this.fired.delete(this.fired.keys().next().value!);
    return fresh;
  }
}
