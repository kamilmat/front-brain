import { useEffect, useMemo, useRef, useState } from 'react';
import { assessFit, FIT_ICON, formatMB, logRun } from '@front-brain/core';
import { useHardware, useLoadedModel } from '@front-brain/react';
import { getWebLLMRuntime, listWebLLMModels, type WebLLMModelInfo } from '@front-brain/webllm';
import { availabilityAll, createSession, isSessionAlive, promptStreaming, type Availability, type ChromeAIApi } from '@front-brain/chrome-ai';
import { Card, ErrorBox, FitCard, Stats } from '../components/ui';
import { DemoGrid, DemoShell } from '../components/DemoShell';
import { ChatView, type ChatMsg } from '../components/Chat';
import { useDemo } from '../lib/useDemo';
import { UseInProject } from '../components/UseInProject';
import { chromeAISnippets, webllmSnippets } from '../lib/snippets';

const SYSTEM: ChatMsg = { role: 'system', content: "You are a helpful, concise assistant running locally in the user's browser." };

// ---------------------------------------------------------------- Transformers.js chat
export function TjsChat() {
  const d = useDemo('LLM chat (Transformers.js)', 'text-generation');
  const [messages, setMessages] = useState<ChatMsg[]>([SYSTEM]);
  const [maxTokens, setMaxTokens] = useState(256);
  const [temp, setTemp] = useState(0.7);

  async function send(text: string) {
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    const r = await d.pipe.run([next], { max_new_tokens: maxTokens, do_sample: temp > 0, temperature: temp || undefined }, { stream: true });
    if (!r) return;
    const gen = r[0].generated_text;
    setMessages([...next, { role: 'assistant', content: Array.isArray(gen) ? gen.at(-1).content : String(gen) }]);
  }

  return (
    <DemoShell d={d}>
      <ChatView messages={messages} pending={d.pipe.streamText} busy={d.pipe.busy} onSend={send} onReset={() => setMessages([SYSTEM])} />
      <details>
        <summary className="hint">Generation settings</summary>
        <div className="row">
          <label>
            max_new_tokens
            <input type="number" value={maxTokens} min={16} max={4096} onChange={(e) => setMaxTokens(+e.target.value)} />
          </label>
          <label>
            temperature
            <input type="number" step={0.1} min={0} max={2} value={temp} onChange={(e) => setTemp(+e.target.value)} />
          </label>
        </div>
      </details>
      <Stats stats={d.pipe.stats} />
    </DemoShell>
  );
}

// ---------------------------------------------------------------- WebLLM
export function WebLLMChat() {
  const rt = getWebLLMRuntime();
  const hw = useHardware();
  const [models, setModels] = useState<WebLLMModelInfo[]>([]);
  const [model, setModel] = useState(rt.model ?? '');
  const [filter, setFilter] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const entry = useLoadedModel(model ? `webllm:${model}` : undefined);
  const [messages, setMessages] = useState<ChatMsg[]>([SYSTEM]);
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perf, setPerf] = useState<string | null>(null);

  useEffect(() => {
    listWebLLMModels().then((list) => {
      setModels(list);
      setModel((cur) => cur || list.find((m) => m.id.startsWith('Qwen2.5-0.5B-Instruct'))?.id || list[0]?.id || '');
    });
  }, []);

  const info = models.find((m) => m.id === model);
  const fitOf = (m: WebLLMModelInfo) => (hw ? assessFit({ memoryMB: m.vramMB || undefined, needsWebGPU: true, needsF16: /f16/.test(m.id) }, hw, 'webgpu') : null);
  const fit = info ? fitOf(info) : null;
  const shown = useMemo(() => models.filter((m) => m.id.toLowerCase().includes(filter.toLowerCase()) || m.id === model), [models, filter, model]);
  const loaded = entry?.status === 'ready' && rt.model === model;

  /** Returns false when loading failed (the error is shown). */
  async function load() {
    setError(null);
    try {
      const { loadMs, cancelled } = await rt.load(model, (p) => setProgress(`${Math.round(p.progress * 100)}% · ${p.text}`), info?.vramMB);
      if (cancelled) return false;
      logRun({ demo: 'LLM chat (WebLLM)', lib: 'webllm', model, device: 'webgpu', loadMs, note: 'load' });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setProgress(null);
    }
  }

  async function send(text: string) {
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setBusy(true);
    setPending('');
    setError(null);
    try {
      if (!loaded && !(await load())) return;
      const r = await rt.chat(next, { onToken: (_, full) => setPending(full) });
      setMessages([...next, { role: 'assistant', content: r.text }]);
      setPerf(`prefill ${r.prefillTps?.toFixed(1)} tok/s · decode ${r.decodeTps?.toFixed(1)} tok/s · ${r.completionTokens} tokens`);
      logRun({ demo: 'LLM chat (WebLLM)', lib: 'webllm', model, device: 'webgpu', inferMs: r.totalMs, note: `${r.decodeTps?.toFixed(1)} tok/s decode` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const aside = (
    <Card title="Model" className="model-panel">
      <label>
        Search ({models.length} prebuilt models)
        <input value={filter} placeholder="llama, qwen, phi, q4f16…" onChange={(e) => setFilter(e.target.value)} />
      </label>
      <label>
        Model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {shown.map((m) => {
            const f = fitOf(m);
            return (
              <option key={m.id} value={m.id}>
                {f ? FIT_ICON[f.fit] + ' ' : ''}
                {m.id} · {m.vramMB ? formatMB(m.vramMB) : '?'}
              </option>
            );
          })}
        </select>
      </label>
      <FitCard fit={fit} />
      <div className="load-state">
        <span className={`dot ${loaded ? 'ready' : entry?.status ?? 'idle'}`} />
        <span>{loaded ? `Loaded${entry?.loadMs ? ` · ${(entry.loadMs / 1000).toFixed(1)} s` : ''}` : progress ?? (rt.model ? `Engine holds ${rt.model}` : 'Not loaded')}</span>
      </div>
      <div className="row">
        <button className="primary" onClick={load} disabled={!model || !!progress || loaded}>
          {loaded ? 'Loaded' : progress ? 'Loading…' : 'Load'}
        </button>
        <button onClick={() => rt.unload()} disabled={(!rt.model && !entry) || busy}>
          Unload
        </button>
      </div>
      {progress && <progress value={entry?.progress ?? 0} max={1} />}
      <p className="hint">One WebLLM model is held at a time; loading another replaces it. Weights stay cached on disk (see Models → Downloaded).</p>
      <UseInProject title={model || 'WebLLM'} disabled={!model} getSnippets={() => webllmSnippets(model)} />
    </Card>
  );

  return (
    <DemoGrid aside={aside}>
      <Card title="Chat">
        {hw && !hw.webgpu && <p className="error">No WebGPU here – WebLLM will most likely fail. You can still try.</p>}
        <ChatView
          messages={messages}
          pending={pending}
          busy={busy}
          onSend={send}
          onStop={() => rt.interrupt()}
          onReset={() => {
            setMessages([SYSTEM]);
            rt.resetChat();
          }}
          placeholder={loaded ? undefined : 'Type a message – the model loads on first send'}
        />
        {perf && (
          <div className="stats">
            <span>{perf}</span>
          </div>
        )}
        <ErrorBox error={error} />
      </Card>
    </DemoGrid>
  );
}

// ---------------------------------------------------------------- Chrome built-in AI (Gemini Nano)
type Tool = 'prompt' | 'summarize' | 'translate' | 'detect' | 'write' | 'rewrite';
const TOOL_API: Record<Tool, ChromeAIApi> = { prompt: 'LanguageModel', summarize: 'Summarizer', translate: 'Translator', detect: 'LanguageDetector', write: 'Writer', rewrite: 'Rewriter' };

export function ChromeAI() {
  const [tool, setTool] = useState<Tool>('prompt');
  const [avail, setAvail] = useState<Partial<Record<ChromeAIApi, Availability>>>({});
  const [text, setText] = useState('Explain in two sentences why running AI models in the browser is useful.');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dl, setDl] = useState<number | null>(null);
  const [src, setSrc] = useState('en');
  const [tgt, setTgt] = useState('pl');
  const sessionRef = useRef<any>(null);
  /** One reusable session per API + options (re-created if it was unloaded). */
  const sessions = useRef(new Map<string, any>());
  const session = async (api: ChromeAIApi, options: Record<string, unknown>) => {
    const k = api + JSON.stringify(options);
    let sess = sessions.current.get(k);
    if (!isSessionAlive(sess)) {
      sess = await createSession(api, options, setDl);
      sessions.current.set(k, sess);
    }
    return sess;
  };

  useEffect(() => {
    availabilityAll().then(setAvail);
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    setOut('');
    const t0 = performance.now();
    try {
      const api = TOOL_API[tool];
      if (tool === 'prompt') {
        if (!isSessionAlive(sessionRef.current)) sessionRef.current = await createSession(api, { initialPrompts: [{ role: 'system', content: SYSTEM.content }] }, setDl);
        await promptStreaming(sessionRef.current, text, setOut);
      } else if (tool === 'summarize') {
        setOut(await (await session(api, { type: 'key-points', format: 'markdown', length: 'medium' })).summarize(text));
      } else if (tool === 'translate') {
        setOut(await (await session(api, { sourceLanguage: src, targetLanguage: tgt })).translate(text));
      } else if (tool === 'detect') {
        const r = await (await session(api, {})).detect(text);
        setOut(r.slice(0, 5).map((x: any) => `${x.detectedLanguage}: ${(x.confidence * 100).toFixed(1)}%`).join('\n'));
      } else if (tool === 'write') {
        setOut(await (await session(api, { tone: 'neutral' })).write(text));
      } else {
        setOut(await (await session(api, { tone: 'more-formal' })).rewrite(text));
      }
      logRun({ demo: 'Chrome built-in AI', lib: 'chrome-ai', model: `Gemini Nano (${api})`, device: 'on-device', inferMs: performance.now() - t0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setDl(null);
    }
  }

  const nonePresent = Object.keys(avail).length > 0 && Object.values(avail).every((v) => v === 'not present');
  const aside = (
    <Card title="APIs" className="model-panel">
      {(Object.keys(TOOL_API) as Tool[]).map((t) => (
        <button key={t} className={tool === t ? 'list-btn active' : 'list-btn'} onClick={() => setTool(t)}>
          <span>{TOOL_API[t]}</span>
          <small className={`badge ${avail[TOOL_API[t]]}`}>{avail[TOOL_API[t]] ?? '…'}</small>
        </button>
      ))}
      {nonePresent && (
        <p className="hint">
          Not exposed in this browser. Needs desktop Chrome 138+ (Summarizer / Translator / LanguageDetector are stable; Prompt / Writer / Rewriter may need
          chrome://flags) and ~22 GB free disk for Gemini Nano.
        </p>
      )}
      {dl != null && <progress value={dl} max={1} />}
      <UseInProject title={TOOL_API[tool]} getSnippets={() => chromeAISnippets(TOOL_API[tool])} />
    </Card>
  );
  return (
    <DemoGrid aside={aside}>
      <Card title={TOOL_API[tool]}>
        {tool === 'translate' && (
          <div className="row">
            <label>From <input value={src} onChange={(e) => setSrc(e.target.value)} size={4} /></label>
            <label>To <input value={tgt} onChange={(e) => setTgt(e.target.value)} size={4} /></label>
          </div>
        )}
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <button className="primary" onClick={run} disabled={busy}>{busy ? 'Working…' : 'Run'}</button>
          {tool === 'prompt' && (
            <button onClick={() => { sessionRef.current?.destroy?.(); sessionRef.current = null; }}>New session</button>
          )}
        </div>
        <ErrorBox error={error} />
        {out && <pre className="output">{out}</pre>}
      </Card>
    </DemoGrid>
  );
}
