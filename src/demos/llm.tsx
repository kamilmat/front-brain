import { useEffect, useMemo, useRef, useState } from 'react';
import type { MLCEngineInterface } from '@mlc-ai/web-llm';
import { Card, ErrorBox, TjsPanel } from '../components/ui';
import { ChatView, type ChatMsg } from '../components/Chat';
import { useDemo } from '../react/useDemo';
import { hasWebGPU } from '../core/env';
import { logRun } from '../core/runlog';

const SYSTEM: ChatMsg = { role: 'system', content: 'You are a helpful, concise assistant running locally in the user\'s browser.' };

// ---------------------------------------------------------------- Transformers.js chat
export function TjsChat() {
  const d = useDemo('LLM chat (Transformers.js)', 'text-generation', [
    { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', size: '~250 MB', dtype: 'q4f16', mobile: true, note: 'Tiny, fast. q4f16 needs WebGPU with shader-f16; on WASM switch dtype to q4 or q8.' },
    { id: 'onnx-community/Qwen2.5-0.5B-Instruct', size: '~400 MB', dtype: 'q4f16', mobile: true, note: 'Multilingual (incl. Polish).' },
    { id: 'onnx-community/Qwen3-0.6B-ONNX', size: '~500 MB', dtype: 'q4f16', note: 'Reasoning model – emits <think> blocks.' },
    { id: 'onnx-community/Llama-3.2-1B-Instruct-q4f16', size: '~1.1 GB', dtype: 'q4f16' },
    { id: 'onnx-community/gemma-3-1b-it-ONNX', size: '~1 GB', dtype: 'q4f16' },
    { id: 'onnx-community/Phi-3.5-mini-instruct-onnx-web', size: '~2.2 GB', dtype: 'q4f16', note: 'Desktop GPU only.' },
  ]);
  const [messages, setMessages] = useState<ChatMsg[]>([SYSTEM]);
  const [maxTokens, setMaxTokens] = useState(256);
  const [temp, setTemp] = useState(0.7);

  async function send(text: string) {
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    const r = await d.tjs.run([next], { max_new_tokens: maxTokens, do_sample: temp > 0, temperature: temp || undefined }, { stream: true });
    if (!r) return;
    const gen = r[0].generated_text;
    setMessages([...next, { role: 'assistant', content: Array.isArray(gen) ? gen.at(-1).content : String(gen) }]);
  }

  return (
    <TjsPanel {...d.panel}>
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
      <ChatView messages={messages} pending={d.tjs.streamText} busy={d.tjs.busy} onSend={send} onReset={() => setMessages([SYSTEM])} />
    </TjsPanel>
  );
}

// ---------------------------------------------------------------- WebLLM
let engine: MLCEngineInterface | null = null;
let engineModel = '';

export function WebLLMChat() {
  const [models, setModels] = useState<{ id: string; vram: number; low: boolean }[]>([]);
  const [model, setModel] = useState('');
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<{ text: string; progress: number } | null>(null);
  const [loaded, setLoaded] = useState(engineModel);
  const [messages, setMessages] = useState<ChatMsg[]>([SYSTEM]);
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perf, setPerf] = useState<string | null>(null);

  useEffect(() => {
    hasWebGPU().then(setGpu);
    import('@mlc-ai/web-llm').then(({ prebuiltAppConfig }) => {
      const list = prebuiltAppConfig.model_list
        .filter((m) => !/embed/i.test(m.model_id) && m.model_type !== 1 /* embedding */)
        .map((m) => ({ id: m.model_id, vram: Math.round(m.vram_required_MB ?? 0), low: !!m.low_resource_required }))
        .sort((a, b) => a.vram - b.vram);
      setModels(list);
      setModel((cur) => cur || engineModel || list.find((m) => m.id.startsWith('Qwen2.5-0.5B-Instruct'))?.id || list[0]?.id || '');
    });
  }, []);

  async function load() {
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const webllm = await import('@mlc-ai/web-llm');
      const initProgressCallback = (p: { text: string; progress: number }) => setProgress(p);
      if (!engine) {
        engine = await webllm.CreateWebWorkerMLCEngine(new Worker(new URL('../core/webllm.worker.ts', import.meta.url), { type: 'module' }), model, { initProgressCallback });
      } else {
        engine.setInitProgressCallback(initProgressCallback);
        await engine.reload(model);
      }
      engineModel = model;
      setLoaded(model);
      logRun({ demo: 'LLM chat (WebLLM)', lib: 'web-llm', model, device: 'webgpu', loadMs: performance.now() - t0, note: 'load' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function send(text: string) {
    if (!engine) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setBusy(true);
    setPending('');
    setError(null);
    const t0 = performance.now();
    let acc = '';
    try {
      const chunks = await engine.chat.completions.create({ messages: next, stream: true, stream_options: { include_usage: true } });
      for await (const c of chunks) {
        acc += c.choices[0]?.delta?.content ?? '';
        setPending(acc);
        if (c.usage) {
          const x = (c.usage as any).extra ?? {};
          setPerf(`prefill ${x.prefill_tokens_per_s?.toFixed(1)} tok/s · decode ${x.decode_tokens_per_s?.toFixed(1)} tok/s · ${c.usage.completion_tokens} tokens`);
          logRun({ demo: 'LLM chat (WebLLM)', lib: 'web-llm', model: engineModel, device: 'webgpu', inferMs: performance.now() - t0, note: `${x.decode_tokens_per_s?.toFixed(1)} tok/s decode` });
        }
      }
      setMessages([...next, { role: 'assistant', content: acc }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = models.find((m) => m.id === model);
  return (
    <>
      <Card>
        {gpu === false && <p className="error">WebLLM requires WebGPU, which is not available in this browser. Try Chrome/Edge 113+ (desktop) or Chrome on recent Android.</p>}
        <div className="picker">
          <label>
            Model ({models.length} prebuilt)
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.vram && m.vram < 1500 ? '📱 ' : ''}
                  {m.id} — {m.vram ? `${(m.vram / 1024).toFixed(1)} GB VRAM` : '?'}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={load} disabled={busy || !model || gpu === false}>
            {loaded === model ? 'Reload' : 'Load model'}
          </button>
        </div>
        {current?.low && <p className="hint">Marked as low-resource by MLC.</p>}
        {loaded && <p className="hint">Loaded: <b>{loaded}</b></p>}
        {progress && (
          <div className="progress">
            <progress value={progress.progress} max={1} />
            <span className="hint">{progress.text}</span>
          </div>
        )}
        {perf && <div className="stats"><span>{perf}</span></div>}
        <ErrorBox error={error} />
      </Card>
      <Card>
        <ChatView
          messages={messages}
          pending={pending}
          busy={busy && !!loaded && !progress}
          onSend={send}
          onStop={() => engine?.interruptGenerate()}
          onReset={() => {
            setMessages([SYSTEM]);
            engine?.resetChat();
          }}
          placeholder={loaded ? undefined : 'Load a model first'}
        />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- Chrome built-in AI (Gemini Nano)
type Tool = 'prompt' | 'summarize' | 'translate' | 'detect' | 'write' | 'rewrite';
const TOOL_API: Record<Tool, string> = { prompt: 'LanguageModel', summarize: 'Summarizer', translate: 'Translator', detect: 'LanguageDetector', write: 'Writer', rewrite: 'Rewriter' };

export function ChromeAI() {
  const [tool, setTool] = useState<Tool>('prompt');
  const [avail, setAvail] = useState<Record<string, string>>({});
  const [text, setText] = useState('Explain in two sentences why running AI models in the browser is useful.');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dl, setDl] = useState<number | null>(null);
  const [src, setSrc] = useState('en');
  const [tgt, setTgt] = useState('pl');
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const res: Record<string, string> = {};
      for (const [t, api] of Object.entries(TOOL_API)) {
        const A = (self as any)[api];
        try {
          res[t] = !A ? 'not present' : t === 'translate' ? await A.availability({ sourceLanguage: 'en', targetLanguage: 'pl' }) : await A.availability();
        } catch (e) {
          res[t] = 'error';
        }
      }
      setAvail(res);
    })();
  }, []);

  const monitor = (m: EventTarget) => m.addEventListener('downloadprogress', (e: any) => setDl(e.loaded));

  async function run() {
    setBusy(true);
    setError(null);
    setOut('');
    const t0 = performance.now();
    try {
      const A = (self as any)[TOOL_API[tool]];
      if (!A) throw new Error(`${TOOL_API[tool]} API is not available in this browser.`);
      if (tool === 'prompt') {
        sessionRef.current ??= await A.create({ monitor, initialPrompts: [{ role: 'system', content: SYSTEM.content }] });
        let acc = '';
        for await (const chunk of sessionRef.current.promptStreaming(text)) {
          acc += chunk;
          setOut(acc);
        }
      } else if (tool === 'summarize') {
        const s = await A.create({ monitor, type: 'key-points', format: 'markdown', length: 'medium' });
        setOut(await s.summarize(text));
      } else if (tool === 'translate') {
        const s = await A.create({ monitor, sourceLanguage: src, targetLanguage: tgt });
        setOut(await s.translate(text));
      } else if (tool === 'detect') {
        const s = await A.create({ monitor });
        const r = await s.detect(text);
        setOut(r.slice(0, 5).map((x: any) => `${x.detectedLanguage}: ${(x.confidence * 100).toFixed(1)}%`).join('\n'));
      } else if (tool === 'write') {
        const s = await A.create({ monitor, tone: 'neutral' });
        setOut(await s.write(text));
      } else {
        const s = await A.create({ monitor, tone: 'more-formal' });
        setOut(await s.rewrite(text));
      }
      logRun({ demo: 'Chrome built-in AI', lib: 'chrome-ai', model: `Gemini Nano (${TOOL_API[tool]})`, device: 'on-device', inferMs: performance.now() - t0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setDl(null);
    }
  }

  const anyPresent = useMemo(() => Object.values(avail).some((v) => v !== 'not present'), [avail]);
  return (
    <>
      <Card title="Availability">
        {!anyPresent && Object.keys(avail).length > 0 && (
          <p className="hint">
            None of the built-in AI APIs are exposed. They ship in desktop Chrome 138+ (Summarizer, Translator, LanguageDetector stable; Prompt/Writer/Rewriter may need flags such as
            chrome://flags/#prompt-api-for-gemini-nano) and need ~22 GB free disk for Gemini Nano.
          </p>
        )}
        <div className="row wrap">
          {(Object.keys(TOOL_API) as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'chip active' : 'chip'} onClick={() => setTool(t)}>
              {TOOL_API[t]} <small className={`badge ${avail[t]}`}>{avail[t] ?? '…'}</small>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        {tool === 'translate' && (
          <div className="row">
            <label>From <input value={src} onChange={(e) => setSrc(e.target.value)} size={4} /></label>
            <label>To <input value={tgt} onChange={(e) => setTgt(e.target.value)} size={4} /></label>
          </div>
        )}
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <button className="primary" onClick={run} disabled={busy}>{busy ? 'Working…' : 'Run'}</button>
          {tool === 'prompt' && <button onClick={() => { sessionRef.current?.destroy?.(); sessionRef.current = null; }}>New session</button>}
          {dl != null && <span className="hint">Downloading model… {(dl * 100).toFixed(0)}%</span>}
        </div>
        <ErrorBox error={error} />
        {out && <pre className="output">{out}</pre>}
      </Card>
    </>
  );
}
