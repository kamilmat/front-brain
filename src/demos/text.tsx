import { useState } from 'react';
import { Card, ScoreBars, TjsPanel } from '../components/ui';
import { useDemo } from '../react/useDemo';

const flat = (r: any) => [r].flat(2);

export function Sentiment() {
  const d = useDemo('Sentiment', 'text-classification', [
    { id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', size: '67 MB', mobile: true, note: 'English, positive/negative.' },
    { id: 'Xenova/bert-base-multilingual-uncased-sentiment', size: '170 MB', mobile: true, note: '1–5 stars, EN/DE/FR/ES/IT/NL.' },
    { id: 'Xenova/toxic-bert', size: '110 MB', mobile: true, note: 'Toxicity – multi-label.' },
  ]);
  const [text, setText] = useState('I love how fast this runs directly in my browser!');
  const [out, setOut] = useState<any[] | null>(null);
  return (
    <TjsPanel {...d.panel} onRun={async () => setOut(flat(await d.tjs.run([text], { top_k: null })))} output={out && <Card title="Labels"><ScoreBars items={out} /></Card>}>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
    </TjsPanel>
  );
}

const ENT_COLORS: Record<string, string> = { PER: '#e57373', ORG: '#64b5f6', LOC: '#81c784', MISC: '#ffb74d', DATE: '#ba68c8' };

export function NER() {
  const d = useDemo('NER', 'token-classification', [
    { id: 'Xenova/bert-base-NER', size: '110 MB', mobile: true },
    { id: 'Xenova/bert-base-multilingual-cased-ner-hrl', size: '180 MB', note: 'Multilingual (10 languages).' },
  ]);
  const [text, setText] = useState('Kamil works at Google in Warsaw and met Satya Nadella from Microsoft in Seattle.');
  const [out, setOut] = useState<any[] | null>(null);
  // Merge WordPiece sub-tokens and B-/I- tags into entity spans.
  const spans: { word: string; type: string; score: number }[] = [];
  for (const t of out ?? []) {
    const type = String(t.entity).replace(/^[BI]-/, '');
    const last = spans[spans.length - 1];
    if (t.word.startsWith('##') && last) last.word += t.word.slice(2);
    else if (String(t.entity).startsWith('I-') && last?.type === type) last.word += ' ' + t.word;
    else spans.push({ word: t.word, type, score: t.score });
  }
  return (
    <TjsPanel
      {...d.panel}
      onRun={async () => setOut(flat(await d.tjs.run([text])))}
      output={
        out && (
          <Card title="Entities">
            <div className="row wrap">
              {spans.map((s, i) => (
                <span key={i} className="entity" style={{ background: ENT_COLORS[s.type] ?? '#999' }}>
                  {s.word} <small>{s.type}</small>
                </span>
              ))}
              {!spans.length && <p className="hint">No entities found.</p>}
            </div>
          </Card>
        )
      }
    >
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
    </TjsPanel>
  );
}

export function ZeroShot() {
  const d = useDemo('Zero-shot text', 'zero-shot-classification', [
    { id: 'Xenova/mobilebert-uncased-mnli', size: '25 MB', mobile: true },
    { id: 'Xenova/nli-deberta-v3-xsmall', size: '90 MB', mobile: true },
    { id: 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7', size: '280 MB', note: 'Multilingual, incl. Polish.' },
  ]);
  const [text, setText] = useState('The new phone has an amazing camera but the battery dies by noon.');
  const [labels, setLabels] = useState('technology, sports, politics, complaint, praise');
  const [multi, setMulti] = useState(true);
  const [out, setOut] = useState<any>(null);
  return (
    <TjsPanel
      {...d.panel}
      onRun={async () => setOut(await d.tjs.run([text, labels.split(',').map((s) => s.trim()).filter(Boolean)], { multi_label: multi }))}
      output={out && <Card title="Scores"><ScoreBars items={out.labels.map((l: string, i: number) => ({ label: l, score: out.scores[i] }))} /></Card>}
    >
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <label>
        Candidate labels (comma-separated)
        <input value={labels} onChange={(e) => setLabels(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> multi-label
      </label>
    </TjsPanel>
  );
}

export function FillMask() {
  const d = useDemo('Fill mask', 'fill-mask', [
    { id: 'Xenova/bert-base-uncased', size: '110 MB', mobile: true },
    { id: 'Xenova/distilbert-base-uncased', size: '67 MB', mobile: true },
    { id: 'Xenova/xlm-roberta-base', size: '280 MB', note: 'Multilingual – try Polish.' },
  ]);
  const [text, setText] = useState('The capital of Poland is [MASK].');
  const [out, setOut] = useState<any[] | null>(null);
  return (
    <TjsPanel
      {...d.panel}
      onRun={async () => setOut(flat(await d.tjs.run([text], { top_k: 8 })))}
      output={out && <Card title="Predictions"><ScoreBars items={out.map((o) => ({ label: o.token_str, score: o.score }))} /></Card>}
    >
      <p className="hint">Use [MASK] (auto-converted to the model's own mask token).</p>
      <input value={text} onChange={(e) => setText(e.target.value)} />
    </TjsPanel>
  );
}

export function QA() {
  const d = useDemo('Question answering', 'question-answering', [
    { id: 'Xenova/distilbert-base-cased-distilled-squad', size: '65 MB', mobile: true },
    { id: 'Xenova/distilbert-base-uncased-distilled-squad', size: '65 MB', mobile: true },
  ]);
  const [q, setQ] = useState('Where do the models run?');
  const [ctx, setCtx] = useState('Front Brain is a playground where every AI model runs locally in the web browser using WebGPU or WebAssembly, so no data leaves the device.');
  const [out, setOut] = useState<any>(null);
  return (
    <TjsPanel
      {...d.panel}
      onRun={async () => setOut(await d.tjs.run([q, ctx]))}
      output={out && <Card title="Answer"><p className="big">{out.answer}</p><p className="hint">score {(out.score * 100).toFixed(1)}%</p></Card>}
    >
      <label>
        Question
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <label>
        Context
        <textarea rows={5} value={ctx} onChange={(e) => setCtx(e.target.value)} />
      </label>
    </TjsPanel>
  );
}

export function Summarize() {
  const d = useDemo('Summarization', 'summarization', [
    { id: 'Xenova/distilbart-cnn-6-6', size: '300 MB' },
    { id: 'Xenova/t5-small', size: '60 MB', mobile: true },
    { id: 'Xenova/bart-large-cnn', size: '400 MB' },
  ]);
  const [text, setText] = useState(
    'WebGPU is a new web API that exposes modern GPU capabilities to web applications. Unlike WebGL, which was designed for graphics, WebGPU provides first-class support for general-purpose compute shaders. This makes it possible to run machine learning models, including large language models, directly in the browser with performance approaching native applications. Libraries such as Transformers.js, WebLLM and ONNX Runtime Web take advantage of WebGPU to execute neural networks locally, which improves privacy because user data never leaves the device, reduces server costs and enables offline use.',
  );
  const [out, setOut] = useState<string | null>(null);
  return (
    <TjsPanel
      {...d.panel}
      onRun={async () => {
        const r = await d.tjs.run([d.choice.model.includes('t5') ? 'summarize: ' + text : text], { max_new_tokens: 120 }, { stream: true });
        if (r) setOut(flat(r)[0].summary_text);
      }}
      output={(out || d.tjs.streamText) && <Card title="Summary"><p>{d.tjs.busy ? d.tjs.streamText : out}</p></Card>}
    >
      <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
    </TjsPanel>
  );
}

const NLLB_LANGS: Record<string, string> = {
  English: 'eng_Latn', Polish: 'pol_Latn', German: 'deu_Latn', French: 'fra_Latn', Spanish: 'spa_Latn', Italian: 'ita_Latn',
  Ukrainian: 'ukr_Cyrl', Russian: 'rus_Cyrl', Czech: 'ces_Latn', Chinese: 'zho_Hans', Japanese: 'jpn_Jpan', Arabic: 'arb_Arab',
};

export function Translate() {
  const d = useDemo('Translation', 'translation', [
    { id: 'Xenova/nllb-200-distilled-600M', size: '~900 MB (q8)', dtype: 'q8', note: '200 languages. Large download – WebGPU recommended.' },
  ]);
  const [text, setText] = useState('Sztuczna inteligencja działająca w przeglądarce to przyszłość prywatnych aplikacji.');
  const [src, setSrc] = useState('Polish');
  const [tgt, setTgt] = useState('English');
  const [out, setOut] = useState<string | null>(null);
  const langSelect = (v: string, set: (s: string) => void) => (
    <select value={v} onChange={(e) => set(e.target.value)}>
      {Object.keys(NLLB_LANGS).map((l) => <option key={l}>{l}</option>)}
    </select>
  );
  return (
    <TjsPanel
      {...d.panel}
      onRun={async () => {
        const r = await d.tjs.run([text], { src_lang: NLLB_LANGS[src], tgt_lang: NLLB_LANGS[tgt], max_new_tokens: 256 }, { stream: true });
        if (r) setOut(flat(r)[0].translation_text);
      }}
      output={(out || d.tjs.streamText) && <Card title="Translation"><p className="big">{d.tjs.busy ? d.tjs.streamText : out}</p></Card>}
    >
      <div className="row">
        <label>From {langSelect(src, setSrc)}</label>
        <label>To {langSelect(tgt, setTgt)}</label>
      </div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
    </TjsPanel>
  );
}

export function Embeddings() {
  const d = useDemo('Embeddings', 'feature-extraction', [
    { id: 'Xenova/all-MiniLM-L6-v2', size: '23 MB', mobile: true, note: 'English.' },
    { id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', size: '120 MB', mobile: true, note: 'Multilingual, incl. Polish.' },
    { id: 'Xenova/bge-small-en-v1.5', size: '34 MB', mobile: true },
  ]);
  const [query, setQuery] = useState('How do I run AI without a server?');
  const [docs, setDocs] = useState(
    'Models can execute locally in the browser with WebGPU.\nThe weather in Kraków is sunny today.\nWebAssembly lets you run compiled code on the client.\nMy cat likes to sleep on the keyboard.\nServerless inference reduces cloud costs.',
  );
  const [out, setOut] = useState<{ text: string; score: number }[] | null>(null);
  return (
    <TjsPanel
      {...d.panel}
      runLabel="Rank by similarity"
      onRun={async () => {
        const lines = docs.split('\n').map((s) => s.trim()).filter(Boolean);
        const r = await d.tjs.run([[query, ...lines]], { pooling: 'mean', normalize: true });
        if (!r) return;
        const { dims, data } = r.__tensor as { dims: number[]; data: number[] };
        const dim = dims[1];
        const vec = (i: number) => data.slice(i * dim, (i + 1) * dim);
        const q = vec(0);
        const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
        setOut(lines.map((text, i) => ({ text, score: dot(q, vec(i + 1)) })).sort((a, b) => b.score - a.score));
      }}
      output={out && <Card title="Cosine similarity to query"><ScoreBars items={out.map((o) => ({ label: o.text, score: Math.max(0, o.score) }))} /></Card>}
    >
      <label>
        Query
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>
        Documents (one per line)
        <textarea rows={6} value={docs} onChange={(e) => setDocs(e.target.value)} />
      </label>
    </TjsPanel>
  );
}
