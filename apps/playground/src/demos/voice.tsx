import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes, logRun, registry } from '@front-brain/core';
import { useLoadedModels } from '@front-brain/react';
import {
  createVoskRecognizer,
  createWebSpeechRecognizer,
  createWhisperRecognizer,
  isWebSpeechSupported,
  KeywordSpotter,
  normalizeWords,
  wordMatches,
  type EngineId,
  type Recognizer,
  type TranscriptEvent,
  type VoiceCommand,
} from '@front-brain/speech';
import { Card, ErrorBox, Segmented } from '../components/ui';
import { DemoGrid } from '../components/DemoShell';
import { ModelPanel } from '../components/ModelPanel';
import { UseInProject } from '../components/UseInProject';
import { useDemo } from '../lib/useDemo';
import { setSfxEnabled, sfx, sfxEnabled } from '../lib/sfx';
import { voiceSnippets } from '../lib/snippets';

type Lang = 'pl' | 'en';
const LANGS: Record<Lang, { label: string; bcp47: string; whisper: string; vosk: string; voskSize: string }> = {
  pl: { label: 'Polski', bcp47: 'pl-PL', whisper: 'polish', vosk: 'vosk-model-small-pl-0.22', voskSize: '~50 MB' },
  en: { label: 'English', bcp47: 'en-US', whisper: 'english', vosk: 'vosk-model-small-en-us-0.15', voskSize: '~40 MB' },
};
const voskUrl = (lang: Lang) => `${import.meta.env.BASE_URL}models/${LANGS[lang].vosk}.tar.gz`;

interface Cmd extends VoiceCommand {
  label: string;
  icon: string;
}
const DEFAULT_COMMANDS: Cmd[] = [
  { id: 'next', icon: '⏭️', label: 'Next slide', phrases: ['następny', 'dalej', 'next'] },
  { id: 'prev', icon: '⏮️', label: 'Previous slide', phrases: ['poprzedni', 'wstecz', 'back', 'previous'] },
  { id: 'dark', icon: '🌙', label: 'Lights off', phrases: ['ciemno', 'zgaś światło', 'lights off', 'dark'] },
  { id: 'light', icon: '💡', label: 'Lights on', phrases: ['jasno', 'zapal światło', 'lights on', 'bright'] },
  { id: 'red', icon: '🟥', label: 'Red', phrases: ['czerwony', 'red'] },
  { id: 'green', icon: '🟩', label: 'Green', phrases: ['zielony', 'green'] },
  { id: 'blue', icon: '🟦', label: 'Blue', phrases: ['niebieski', 'blue'] },
  { id: 'confetti', icon: '🎉', label: 'Confetti', phrases: ['konfetti', 'brawo', 'hurra', 'confetti', 'party'] },
  { id: 'plus', icon: '➕', label: 'Counter +1', phrases: ['plus', 'dodaj', 'więcej', 'add', 'more'] },
  { id: 'minus', icon: '➖', label: 'Counter −1', phrases: ['minus', 'odejmij', 'mniej', 'less'] },
  { id: 'music', icon: '🎵', label: 'Play a tune', phrases: ['muzyka', 'zagraj', 'music', 'play'] },
  { id: 'stop', icon: '⏹️', label: 'Stop listening', phrases: ['stop', 'koniec', 'stop listening'] },
];
const SLIDES = ['🚀 Voice control', '🧠 Runs in your browser', '🎙️ Say “next” or “dalej”', '🎉 Say “confetti”'];
const COLORS: Record<string, string> = { red: '#e5484d', green: '#30a46c', blue: '#0090ff' };

function loadCommands(): Cmd[] {
  try {
    const saved = JSON.parse(localStorage.getItem('fb:voice-cmds') ?? 'null') as Record<string, string[]> | null;
    if (saved) return DEFAULT_COMMANDS.map((c) => ({ ...c, phrases: saved[c.id] ?? c.phrases }));
  } catch {
    /* ignore */
  }
  return DEFAULT_COMMANDS;
}

interface Line {
  id: string;
  text: string;
  final: boolean;
  latencyMs?: number;
}

export function VoiceCommands() {
  const [engine, setEngine] = useState<EngineId>(isWebSpeechSupported() ? 'webspeech' : 'whisper');
  const [lang, setLang] = useState<Lang>('pl');
  const [onDevice, setOnDevice] = useState(false);
  const [grammar, setGrammar] = useState(true);
  const [commands, setCommands] = useState<Cmd[]>(loadCommands);
  const [state, setState] = useState<'idle' | 'loading' | 'listening' | 'processing'>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [log, setLog] = useState<{ icon: string; text: string }[]>([]);
  const [level, setLevel] = useState(0);
  const [sound, setSound] = useState(sfxEnabled());
  // stage
  const [slide, setSlide] = useState(0);
  const [dark, setDark] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [bursts, setBursts] = useState<number[]>([]);
  const [pulse, setPulse] = useState<string | null>(null);

  const whisper = useDemo('Voice commands (Whisper)', 'automatic-speech-recognition');
  const recRef = useRef<Recognizer | null>(null);
  const spotter = useRef(new KeywordSpotter(commands));
  spotter.current.commands = commands;
  const models = useLoadedModels();
  const voskEntry = models.find((m) => m.runtime === 'vosk' && m.model === LANGS[lang].vosk);

  useEffect(() => {
    try {
      localStorage.setItem('fb:voice-cmds', JSON.stringify(Object.fromEntries(commands.map((c) => [c.id, c.phrases]))));
    } catch {
      /* ignore */
    }
  }, [commands]);

  // Stop everything when leaving the page or switching engine/language.
  useEffect(() => () => void recRef.current?.stop(), []);
  useEffect(() => {
    void stop();
  }, [engine, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mic level meter.
  useEffect(() => {
    if (state !== 'listening' && state !== 'processing') return;
    const id = setInterval(() => setLevel(recRef.current?.level() ?? 0), 80);
    return () => clearInterval(id);
  }, [state]);

  const act = (c: Cmd) => {
    setLog((l) => [{ icon: c.icon, text: c.label }, ...l].slice(0, 10));
    setPulse(c.id);
    setTimeout(() => setPulse(null), 400);
    switch (c.id) {
      case 'next':
        setSlide((s) => (s + 1) % SLIDES.length);
        sfx.whoosh();
        break;
      case 'prev':
        setSlide((s) => (s - 1 + SLIDES.length) % SLIDES.length);
        sfx.whoosh();
        break;
      case 'dark':
        setDark(true);
        sfx.reset();
        break;
      case 'light':
        setDark(false);
        sfx.theme();
        break;
      case 'red':
      case 'green':
      case 'blue':
        setColor(COLORS[c.id]);
        sfx.theme();
        break;
      case 'confetti':
        setBursts((b) => [...b, Date.now()]);
        sfx.confetti();
        break;
      case 'plus':
        setCount((n) => n + 1);
        sfx.pop();
        break;
      case 'minus':
        setCount((n) => n - 1);
        sfx.miss();
        break;
      case 'music':
        sfx.hearts();
        setTimeout(() => sfx.confetti(), 450);
        break;
      case 'stop':
        void stop();
        break;
    }
  };

  const onTranscript = (e: TranscriptEvent) => {
    setLines((ls) => {
      const rest = ls.filter((l) => l.id !== e.utteranceId);
      return [...rest, { id: e.utteranceId, text: e.text, final: e.final, latencyMs: e.latencyMs }].slice(-12);
    });
    for (const m of spotter.current.feed(e.text, e.utteranceId, e.final)) {
      // Read commands through the spotter ref – this callback outlives renders while listening.
      const c = (spotter.current.commands as Cmd[]).find((x) => x.id === m.id);
      if (c) act(c);
    }
    if (e.final) logRun({ demo: 'Voice commands', lib: engine, model: engine === 'whisper' ? whisper.choice.model : engine === 'vosk' ? LANGS[lang].vosk : `Web Speech (${LANGS[lang].bcp47})`, device: engine === 'whisper' ? whisper.choice.device : engine === 'vosk' ? 'wasm' : onDevice ? 'on-device?' : 'cloud', inferMs: e.latencyMs, note: e.text.slice(0, 40) });
  };

  async function start() {
    setError(null);
    const callbacks = { onTranscript, onError: setError, onSpeech: setSpeaking, onState: setState };
    try {
      const rec =
        engine === 'webspeech'
          ? createWebSpeechRecognizer({ ...callbacks, lang: LANGS[lang].bcp47, preferOnDevice: onDevice })
          : engine === 'whisper'
            ? createWhisperRecognizer({
                ...callbacks,
                spec: { task: 'automatic-speech-recognition', model: whisper.choice.model, device: whisper.choice.device, dtype: whisper.choice.dtype || undefined },
                language: whisper.choice.model.includes('whisper') ? LANGS[lang].whisper : undefined,
              })
            : createVoskRecognizer({ ...callbacks, modelUrl: voskUrl(lang), grammar: grammar ? commandWords(commands) : undefined });
      recRef.current = rec;
      await rec.start();
      if (engine === 'webspeech') setState('listening');
    } catch (e) {
      recRef.current = null;
      setState('idle');
      const msg = (e as Error).message || String(e);
      setError(engine === 'vosk' && /fetch|404|load/i.test(msg) ? `${msg}\nThe Vosk model is served with the deployed site (${voskUrl(lang)}); it isn't available in local dev.` : msg);
    }
  }

  async function stop() {
    const r = recRef.current;
    recRef.current = null;
    setSpeaking(false);
    setLevel(0);
    if (r) await r.stop();
    setState('idle');
  }

  const listening = state === 'listening' || state === 'processing';
  const allKeywords = useMemo(() => commands.flatMap((c) => c.phrases.flatMap((p) => normalizeWords(p))), [commands]);
  const highlight = (text: string) =>
    text.split(/(\s+)/).map((w, i) => {
      const n = normalizeWords(w)[0];
      return n && allKeywords.some((k) => wordMatches(n, k)) ? (
        <mark key={i} className="kw">
          {w}
        </mark>
      ) : (
        <span key={i}>{w}</span>
      );
    });

  const aside =
    engine === 'whisper' ? (
      <ModelPanel d={whisper} />
    ) : (
      <Card title="Engine" className="model-panel">
        {engine === 'webspeech' ? (
          <>
            <p className="hint">
              Browser speech recognition – instant, streaming, no download. <b>Chrome/Edge usually send the audio to the vendor’s cloud</b>; Safari may use
              on-device recognition. Not available in Firefox.
            </p>
            <p className="hint">Supported here: {isWebSpeechSupported() ? '✅ yes' : '⛔ no'}</p>
            <label className="check">
              <input type="checkbox" checked={onDevice} onChange={(e) => setOnDevice(e.target.checked)} /> prefer on-device (Chrome 139+ if the language pack is installed)
            </label>
          </>
        ) : (
          <>
            <p className="hint">
              Vosk (Kaldi in WebAssembly): streaming, fully on-device. Model <code>{LANGS[lang].vosk}</code> ({LANGS[lang].voskSize}), served with this site.
            </p>
            <label className="check">
              <input type="checkbox" checked={grammar} onChange={(e) => setGrammar(e.target.checked)} disabled={listening} /> command mode – only listen for the command words
              (much more accurate)
            </label>
            <div className="load-state">
              <span className={`dot ${voskEntry?.status ?? 'idle'}`} />
              <span>{voskEntry ? `${voskEntry.status}${voskEntry.bytes ? ' · ' + formatBytes(voskEntry.bytes) : ''}` : 'Not loaded – loads on Start'}</span>
            </div>
            <button disabled={!voskEntry || listening} onClick={() => voskEntry && registry.unload(voskEntry.key)}>
              Unload
            </button>
          </>
        )}
        <UseInProject title="voice commands" getSnippets={() => voiceSnippets(engine, lang === 'pl' ? 'pl-PL' : 'en-US')} />
      </Card>
    );

  return (
    <DemoGrid aside={aside}>
      <Card>
        <div className="row wrap">
          <Segmented
            value={engine}
            onChange={setEngine}
            options={[
              { id: 'webspeech', label: 'Web Speech', title: 'Built into the browser (usually cloud)' },
              { id: 'whisper', label: 'Whisper', title: 'On-device, Transformers.js' },
              { id: 'vosk', label: 'Vosk', title: 'On-device, streaming, WebAssembly' },
            ]}
          />
          <Segmented value={lang} onChange={setLang} options={[{ id: 'pl', label: '🇵🇱 PL' }, { id: 'en', label: '🇬🇧 EN' }]} />
          <button
            className={sound ? 'chip active' : 'chip'}
            onClick={() => {
              setSfxEnabled(!sound);
              setSound(!sound);
            }}
          >
            {sound ? '🔊' : '🔇'}
          </button>
        </div>
        <div className="mic-row">
          <button className={listening ? 'mic-btn on' : 'mic-btn'} onClick={listening ? stop : start} disabled={state === 'loading'} aria-pressed={listening}>
            {state === 'loading' ? '⏳' : listening ? '■' : '🎙️'}
          </button>
          <div className="stack grow">
            <b>{state === 'loading' ? 'Loading model…' : listening ? (speaking ? 'Hearing you…' : 'Listening – say a command') : 'Press to start listening'}</b>
            <span className="level">
              <span style={{ width: `${Math.round(level * 100)}%` }} />
            </span>
            <small className="hint">
              {engine === 'whisper' && 'Whisper transcribes each phrase after you pause (~0.6 s) and shows interim text while you speak.'}
              {engine === 'webspeech' && 'Words appear as you speak.'}
              {engine === 'vosk' && 'Streaming – words appear as you speak.'}
              {state === 'processing' && ' · transcribing…'}
            </small>
          </div>
        </div>
        <ErrorBox error={error} />
      </Card>

      <div className={`voice-stage${dark ? ' dark' : ''}`} style={color ? { borderColor: color, boxShadow: `inset 0 0 0 4px ${color}` } : undefined}>
        <div className="voice-slide" style={color ? { background: color } : undefined}>
          <small>
            {slide + 1}/{SLIDES.length}
          </small>
          <b>{SLIDES[slide]}</b>
        </div>
        <div className="voice-counter">
          Counter: <b>{count}</b>
        </div>
        {bursts.map((b) => (
          <div key={b} className="burst" onAnimationEnd={() => setBursts((x) => x.filter((y) => y !== b))}>
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i} style={{ '--a': `${i * 20}deg`, '--d': `${80 + (i % 4) * 30}px` } as React.CSSProperties}>
                {['🎉', '✨', '🎊'][i % 3]}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="grid2">
        <Card title="Live transcript">
          {lines.length === 0 ? (
            <p className="hint">Nothing yet.</p>
          ) : (
            <ul className="transcript">
              {lines.map((l) => (
                <li key={l.id} className={l.final ? '' : 'interim'}>
                  {highlight(l.text)}
                  {l.final && l.latencyMs != null && <small className="hint"> · {Math.round(l.latencyMs)} ms</small>}
                </li>
              ))}
            </ul>
          )}
          {log.length > 0 && (
            <div className="row wrap">
              {log.map((x, i) => (
                <span key={i} className="badge">
                  {x.icon} {x.text}
                </span>
              ))}
            </div>
          )}
        </Card>
        <Card
          title="Commands"
          actions={
            <button className="chip" onClick={() => setCommands(DEFAULT_COMMANDS)}>
              Reset
            </button>
          }
        >
          <p className="hint">Comma-separated phrases. Matching ignores diacritics and word endings (następny / następna).</p>
          <div className="cmd-list">
            {commands.map((c) => (
              <label key={c.id} className={pulse === c.id ? 'cmd active' : 'cmd'}>
                <span>
                  {c.icon} {c.label}
                </span>
                <input
                  value={c.phrases.join(', ')}
                  onChange={(e) => setCommands((cs) => cs.map((x) => (x.id === c.id ? { ...x, phrases: e.target.value.split(',').map((p) => p.trim()).filter(Boolean) } : x)))}
                />
              </label>
            ))}
          </div>
        </Card>
      </div>
    </DemoGrid>
  );
}

/** Unique lowercase words for Vosk's grammar (command mode). */
function commandWords(commands: VoiceCommand[]) {
  return [...new Set(commands.flatMap((c) => c.phrases.flatMap((p) => p.toLowerCase().split(/\s+/))).filter(Boolean))];
}
