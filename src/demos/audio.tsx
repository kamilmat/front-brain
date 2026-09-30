import { useState } from 'react';
import { Card, ScoreBars, TjsPanel } from '../components/ui';
import { AudioInput } from '../components/inputs';
import { decodeAudio, toWav } from '../core/audio';
import { useDemo } from '../react/useDemo';

const flat = (r: any) => [r].flat(2);

function useAudioSrc() {
  return useState<{ src: Blob | string; preview: string; label: string } | null>(null);
}

export function ASR() {
  const d = useDemo('Speech recognition', 'automatic-speech-recognition', [
    { id: 'onnx-community/whisper-tiny', size: '~40 MB (q8)', mobile: true },
    { id: 'onnx-community/whisper-base', size: '~80 MB (q8)', mobile: true },
    { id: 'onnx-community/whisper-small', size: '~250 MB (q8)', note: 'Much better for Polish.' },
    { id: 'onnx-community/whisper-large-v3-turbo', size: '~800 MB', dtype: 'q4', note: 'Best quality – WebGPU recommended.' },
    { id: 'onnx-community/moonshine-base-ONNX', size: '~60 MB', mobile: true, note: 'Moonshine – fast English ASR.' },
  ]);
  const [audio, setAudio] = useAudioSrc();
  const [lang, setLang] = useState('');
  const [ts, setTs] = useState(false);
  const [out, setOut] = useState<any>(null);
  const whisper = d.choice.model.includes('whisper');
  return (
    <TjsPanel
      {...d.panel}
      runDisabled={!audio}
      runLabel="Transcribe"
      onRun={async () => {
        const pcm = await decodeAudio(audio!.src);
        const opts: Record<string, unknown> = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: ts };
        if (whisper && lang) Object.assign(opts, { language: lang, task: 'transcribe' });
        setOut(await d.tjs.run([pcm], opts));
      }}
      output={
        (out || d.tjs.streamText) && (
          <Card title="Transcript">
            <p className="big">{d.tjs.busy ? d.tjs.streamText : out?.text}</p>
            {!d.tjs.busy && out?.chunks && (
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
    </TjsPanel>
  );
}

export function TTS() {
  const d = useDemo('Text to speech', 'text-to-speech', [
    { id: 'Xenova/mms-tts-eng', size: '30 MB', mobile: true, note: 'Meta MMS – English.' },
    { id: 'Xenova/speecht5_tts', size: '~150 MB', dtype: 'fp32', note: 'SpeechT5 – uses a default speaker embedding.' },
    { id: 'Xenova/mms-tts-deu', size: '30 MB', mobile: true, note: 'Meta MMS – German.' },
    { id: 'Xenova/mms-tts-fra', size: '30 MB', mobile: true, note: 'Meta MMS – French.' },
  ]);
  const [text, setText] = useState('Hello! This voice was generated entirely inside your web browser.');
  const [url, setUrl] = useState<string | null>(null);
  return (
    <TjsPanel
      {...d.panel}
      runLabel="Speak"
      onRun={async () => {
        const opts = d.choice.model.includes('speecht5') ? { speaker_embeddings: 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin' } : {};
        const r = await d.tjs.run([text], opts);
        const a = r?.__audio ?? flat(r)[0]?.__audio;
        if (a) setUrl(URL.createObjectURL(toWav(a.audio, a.sampling_rate)));
      }}
      output={url && <Card title="Audio"><audio controls autoPlay src={url} /></Card>}
    >
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
    </TjsPanel>
  );
}

export function AudioClassify() {
  const d = useDemo('Audio classification', 'audio-classification', [
    { id: 'Xenova/ast-finetuned-audioset-10-10-0.4593', size: '~90 MB (q8)', note: '527 AudioSet classes (music, speech, dog bark…).' },
    { id: 'Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech', size: '~320 MB (q8)', note: 'Speaker gender.' },
  ]);
  const [audio, setAudio] = useAudioSrc();
  const [out, setOut] = useState<any[] | null>(null);
  return (
    <TjsPanel
      {...d.panel}
      runDisabled={!audio}
      onRun={async () => setOut(flat(await d.tjs.run([await decodeAudio(audio!.src)], { top_k: 8 })))}
      output={out && <Card title="Labels"><ScoreBars items={out} /></Card>}
    >
      <AudioInput onChange={setAudio} current={audio?.preview} />
    </TjsPanel>
  );
}
