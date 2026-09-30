import { useEffect, useState } from 'react';
import { Card, ErrorBox, Progress } from '../components/ui';
import { SAMPLE_IMAGES } from '../components/inputs';
import { clearRuns, hasWebGPU, logRun } from '@front-brain/core';
import { useRuns, type FileProgress } from '@front-brain/react';
import { getTransformersRuntime, type Device } from '@front-brain/transformers';

export function RunLog() {
  const runs = useRuns();
  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' }));
    a.download = `front-brain-runs-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
  };
  return (
    <Card
      title={`Run log (${runs.length})`}
      actions={
        <div className="row">
          <button onClick={exportJson} disabled={!runs.length}>Export JSON</button>
          <button onClick={clearRuns} disabled={!runs.length}>Clear</button>
        </div>
      }
    >
      <p className="hint">Every run is recorded locally in this browser (localStorage) so you can compare models, devices and dtypes.</p>
      <div className="table-scroll">
        <table className="log">
          <thead>
            <tr>
              <th>Time</th>
              <th>Demo</th>
              <th>Library</th>
              <th>Model</th>
              <th>Device</th>
              <th>dtype</th>
              <th>Load</th>
              <th>Inference</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i}>
                <td>{new Date(r.ts).toLocaleTimeString()}</td>
                <td>{r.demo}</td>
                <td>{r.lib}</td>
                <td className="mono">{r.model}</td>
                <td>{r.device}</td>
                <td>{r.dtype}</td>
                <td>{r.loadMs ? `${(r.loadMs / 1000).toFixed(2)} s` : '–'}</td>
                <td>{r.inferMs != null ? `${r.inferMs.toFixed(0)} ms` : '–'}</td>
                <td>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface BenchCase {
  name: string;
  task: string;
  model: string;
  args: unknown[];
  options?: Record<string, unknown>;
}
const CASES: BenchCase[] = [
  { name: 'Embeddings – MiniLM (23 MB)', task: 'feature-extraction', model: 'Xenova/all-MiniLM-L6-v2', args: [['The quick brown fox jumps over the lazy dog.', 'Browsers can run neural networks now.']], options: { pooling: 'mean', normalize: true } },
  { name: 'Sentiment – DistilBERT (67 MB)', task: 'text-classification', model: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', args: ['This benchmark is surprisingly fun.'] },
  { name: 'Image classification – ViT (90 MB)', task: 'image-classification', model: 'Xenova/vit-base-patch16-224', args: [SAMPLE_IMAGES[0].url] },
  { name: 'Object detection – YOLOS-tiny (26 MB)', task: 'object-detection', model: 'Xenova/yolos-tiny', args: [SAMPLE_IMAGES[2].url], options: { threshold: 0.5 } },
  { name: 'Depth – Depth Anything v2 small (27 MB)', task: 'depth-estimation', model: 'onnx-community/depth-anything-v2-small', args: [SAMPLE_IMAGES[2].url] },
  { name: 'Text generation – SmolLM2-135M, 32 tokens', task: 'text-generation', model: 'HuggingFaceTB/SmolLM2-135M-Instruct', args: ['Once upon a time'], options: { max_new_tokens: 32, do_sample: false } },
];

interface BenchResult {
  device: Device;
  dtype: string;
  loadMs: number;
  median: number;
  min: number;
  max: number;
}

export function Benchmark() {
  const [caseIdx, setCaseIdx] = useState(0);
  const [iters, setIters] = useState(5);
  const [dtypes, setDtypes] = useState('fp32, q8');
  const [devices, setDevices] = useState<Device[]>(['wasm']);
  const [gpu, setGpu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [files, setFiles] = useState<Record<string, FileProgress>>({});
  const [results, setResults] = useState<BenchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unloadAfter, setUnloadAfter] = useState(true);
  const rt = getTransformersRuntime();

  useEffect(() => {
    hasWebGPU().then((ok) => {
      setGpu(ok);
      if (ok) setDevices(['wasm', 'webgpu']);
    });
  }, []);

  async function run() {
    const c = CASES[caseIdx];
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      for (const device of devices) {
        for (const dtype of dtypes.split(',').map((s) => s.trim())) {
          setStatus(`${device} / ${dtype}: loading + warm-up`);
          const spec = { task: c.task, model: c.model, device, dtype: dtype === 'auto' ? undefined : dtype };
          let warm;
          try {
            warm = await rt.run(spec, c.args, c.options, {
              onProgress: (p) => p.file && setFiles((f) => ({ ...f, [p.file]: { file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0, status: p.status } })),
            });
          } catch (e) {
            setError((prev) => `${prev ?? ''}${device}/${dtype}: ${(e as Error).message}\n`);
            continue;
          } finally {
            setFiles({});
          }
          const times: number[] = [];
          for (let i = 0; i < iters; i++) {
            setStatus(`${device} / ${dtype}: iteration ${i + 1}/${iters}`);
            times.push((await rt.run(spec, c.args, c.options)).stats.inferMs);
          }
          times.sort((a, b) => a - b);
          if (unloadAfter) await rt.unload(spec);
          const res = { device, dtype, loadMs: warm.stats.loadMs, median: times[Math.floor(times.length / 2)], min: times[0], max: times.at(-1)! };
          setResults((r) => [...r, res]);
          logRun({ demo: 'Benchmark', lib: 'transformers', model: c.model, device, dtype, loadMs: res.loadMs, inferMs: res.median, note: `median of ${iters}` });
        }
      }
      setStatus('Done');
    } finally {
      setBusy(false);
    }
  }

  const best = results.length ? Math.min(...results.map((r) => r.median)) : 0;
  return (
    <>
      <Card>
        <div className="picker">
          <label>
            Workload
            <select value={caseIdx} onChange={(e) => setCaseIdx(+e.target.value)}>
              {CASES.map((c, i) => (
                <option key={i} value={i}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            dtypes (comma-separated)
            <input value={dtypes} onChange={(e) => setDtypes(e.target.value)} />
          </label>
          <label>
            Iterations
            <input type="number" min={1} max={50} value={iters} onChange={(e) => setIters(+e.target.value)} />
          </label>
        </div>
        <div className="row">
          {(['wasm', 'webgpu'] as Device[]).map((d) => (
            <label key={d} className="check">
              <input
                type="checkbox"
                disabled={d === 'webgpu' && !gpu}
                checked={devices.includes(d)}
                onChange={(e) => setDevices((ds) => (e.target.checked ? [...ds, d] : ds.filter((x) => x !== d)))}
              />
              {d}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={unloadAfter} onChange={(e) => setUnloadAfter(e.target.checked)} />
            unload after each config
          </label>
          <button className="primary" onClick={run} disabled={busy || !devices.length}>{busy ? 'Running…' : 'Run benchmark'}</button>
          <span className="hint">{status}</span>
        </div>
        <Progress files={files} />
        <ErrorBox error={error} />
      </Card>
      {results.length > 0 && (
        <Card title="Results">
          <table className="log">
            <thead>
              <tr><th>Device</th><th>dtype</th><th>Load</th><th>Median</th><th>Min</th><th>Max</th><th /></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.device}</td>
                  <td>{r.dtype}</td>
                  <td>{r.loadMs ? `${(r.loadMs / 1000).toFixed(2)} s` : 'cached'}</td>
                  <td><b>{r.median.toFixed(1)} ms</b></td>
                  <td>{r.min.toFixed(1)}</td>
                  <td>{r.max.toFixed(1)}</td>
                  <td>{r.median === best ? '🏆' : `${(r.median / best).toFixed(1)}× slower`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
