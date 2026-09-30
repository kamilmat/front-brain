import { useState } from 'react';
import { Card, ScoreBars } from '../components/ui';
import { DemoShell } from '../components/DemoShell';
import { AudioInput } from '../components/inputs';
import { decodeAudio, toWav } from '@front-brain/core';
import { useDemo } from '../lib/useDemo';
import { flat } from '../lib/result';


function useAudioSrc() {
  return useState<{ src: Blob | string; preview: string; label: string } | null>(null);
}

export function ASR() {
  const d = useDemo('Speech recognition', 'automatic-speech-recognition');
  const [audio, setAudio] = useAudioSrc();
  const [lang, setLang] = useState('');
  const [ts, setTs] = useState(false);
  const [out, setOut] = useState<any>(null);
  const whisper = d.choice.model.includes('whisper');
  return (
    <DemoShell
      d={d}
      runDisabled={!audio}
      runLabel="Transcribe"
      onRun={async () => {
        const pcm = await decodeAudio(audio!.src);
        const opts: Record<string, unknown> = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: ts };
        if (whisper && lang) Object.assign(opts, { language: lang, task: 'transcribe' });
        setOut(await d.pipe.run([pcm], opts));
      }}
      output={
        (out || d.pipe.streamText) && (
          <Card title="Transcript">
            <p className="big">{d.pipe.busy ? d.pipe.streamText : out?.text}</p>
            {!d.pipe.busy && out?.chunks && (
              <ul className="chunks">
                {out.chunks.map((c: any, i: number) => (
                  <li key={i}>
                    <code>[{c.timestamp?.[0]?.toFixed(1)}–{c.timestamp?.[1]?.toFixed(1) ?? '…'}]</code> {c.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      }
    >
      <AudioInput onChange={setAudio} current={audio?.preview} />
      <div className="row">
        {whisper && (
          <label>
            Language (Whisper, empty = auto)
            <input value={lang} placeholder="polish / english / …" onChange={(e) => setLang(e.target.value)} />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={ts} onChange={(e) => setTs(e.target.checked)} /> timestamps
        </label>
      </div>
    </DemoShell>
  );
}

export function TTS() {
  const d = useDemo('Text to speech', 'text-to-speech');
  const [text, setText] = useState('Hello! This voice was generated entirely inside your web browser.');
  const [url, setUrl] = useState<string | null>(null);
  return (
    <DemoShell
      d={d}
      runLabel="Speak"
      onRun={async () => {
        const opts = d.choice.model.includes('speecht5') ? { speaker_embeddings: 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin' } : {};
        const r = await d.pipe.run([text], opts);
        const a = r?.__audio ?? flat(r)?.[0]?.__audio;
        if (a) setUrl(URL.createObjectURL(toWav(a.audio, a.sampling_rate)));
      }}
      output={url && <Card title="Audio"><audio controls autoPlay src={url} /></Card>}
    >
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
    </DemoShell>
  );
}

export function AudioClassify() {
  const d = useDemo('Audio classification', 'audio-classification');
  const [audio, setAudio] = useAudioSrc();
  const [out, setOut] = useState<any[] | null>(null);
  return (
    <DemoShell
      d={d}
      runDisabled={!audio}
      onRun={async () => setOut(flat(await d.pipe.run([await decodeAudio(audio!.src)], { top_k: 8 })))}
      output={out && <Card title="Labels"><ScoreBars items={out} /></Card>}
    >
      <AudioInput onChange={setAudio} current={audio?.preview} />
    </DemoShell>
  );
}
