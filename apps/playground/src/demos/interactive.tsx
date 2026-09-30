import { useEffect, useRef, useState } from 'react';
import { assessFit, logRun } from '@front-brain/core';
import { useHardware, useLoadedModels } from '@front-brain/react';
import {
  BlinkDetector,
  createVisionTask,
  GestureController,
  MOOD_EMOJI,
  MOODS,
  MoodTracker,
  runVideoLoop,
  VISION_TASKS,
  type BlinkState,
  type GestureEvent,
  type GestureName,
  type Mood,
  type VisionKind,
  type VisionTask,
} from '@front-brain/mediapipe';
import { Card, ErrorBox, FitCard, ScoreBars, Segmented } from '../components/ui';
import { VideoSource } from '../components/inputs';
import { DemoGrid } from '../components/DemoShell';
import { UseInProject } from '../components/UseInProject';
import { gestureSnippets, moodSnippets } from '../lib/snippets';
import { setSfxEnabled, sfx, sfxEnabled, Theremin } from '../lib/sfx';

/** Camera + one MediaPipe task + per-frame result callback. */
function useVisionCamera(kind: VisionKind, label: string) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [delegate, setDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [task, setTask] = useState<VisionTask | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const loadingRef = useRef(false);
  const onResult = useRef<(r: any, t: number) => void>(() => {});
  const loadedKeys = useLoadedModels().map((m) => m.key);
  const alive = task && loadedKeys.includes(task.key) ? task : null;
  const current = alive?.delegate === delegate ? alive : null;

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      alive?.close();
      const t0 = performance.now();
      const t = await createVisionTask(kind, { delegate });
      logRun({ demo: label, lib: 'mediapipe', model: kind, device: delegate, loadMs: performance.now() - t0, note: 'load' });
      setTask(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!current || !playing) return;
    return runVideoLoop(videoRef.current!, canvasRef.current!, current, (s) => setFps(s.fps), (r, t) => onResult.current(r, t));
  }, [current, playing]);
  useEffect(() => () => task?.close(), [task]);

  return { videoRef, canvasRef, delegate, setDelegate, current, alive, loading, error, fps, playing, setPlaying, load, onResult };
}

type Cam = ReturnType<typeof useVisionCamera>;

function CameraPanel({ cam, kind, title, snippets }: { cam: Cam; kind: VisionKind; title: string; snippets: () => ReturnType<typeof gestureSnippets> }) {
  const hw = useHardware();
  // MediaPipe's GPU delegate is WebGL, not WebGPU – don't require WebGPU for it.
  const fit = hw ? assessFit({ sizeMB: VISION_TASKS[kind].sizeMB, realtime: true }, hw, cam.delegate === 'GPU' ? undefined : 'wasm') : null;
  return (
    <Card title="Camera & model" className="model-panel">
      <VideoSource
        videoRef={cam.videoRef}
        onReady={() => {
          cam.setPlaying(true);
          if (!cam.current) cam.load();
        }}
        onStop={() => cam.setPlaying(false)}
      />
      <div className="video-wrap mirror">
        <video ref={cam.videoRef} playsInline muted />
        <canvas ref={cam.canvasRef} />
      </div>
      <div className="stats">
        {cam.playing && cam.current && <span>{cam.fps} FPS</span>}
        {cam.loading && <span>Loading {VISION_TASKS[kind].label}…</span>}
      </div>
      <div className="field">
        <span className="field-label">Delegate</span>
        <Segmented value={cam.delegate} onChange={cam.setDelegate} options={[{ id: 'GPU', label: 'GPU (WebGL)' }, { id: 'CPU', label: 'CPU (WASM)' }]} />
      </div>
      <FitCard fit={fit} />
      <div className="row">
        <button className="primary" disabled={cam.loading || !!cam.current} onClick={cam.load}>
          {cam.current ? 'Loaded' : 'Load'}
        </button>
        <button disabled={!cam.alive} onClick={() => cam.alive?.close()}>
          Unload
        </button>
      </div>
      <ErrorBox error={cam.error} />
      <UseInProject title={title} getSnippets={snippets} />
    </Card>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(sfxEnabled());
  return (
    <button
      className={on ? 'chip active' : 'chip'}
      onClick={() => {
        setSfxEnabled(!on);
        setOn(!on);
      }}
    >
      {on ? '🔊 Sound on' : '🔇 Sound off'}
    </button>
  );
}

// ================================================================ Gesture control
const GESTURE_ACTIONS: Record<GestureName, { icon: string; action: string }> = {
  Thumb_Up: { icon: '👍', action: 'Confetti' },
  Thumb_Down: { icon: '👎', action: 'Boo (shake)' },
  Victory: { icon: '✌️', action: 'Take a photo' },
  ILoveYou: { icon: '🤟', action: 'Hearts' },
  Closed_Fist: { icon: '✊', action: 'Reset score' },
  Pointing_Up: { icon: '☝️', action: 'Next color theme' },
  Open_Palm: { icon: '✋', action: 'Swipe ← → to change card' },
};
const THEMES = ['#5b5bd6', '#e5484d', '#30a46c', '#f76b15', '#0090ff', '#d6409f'];
const CARDS = [
  { title: 'Swipe me', body: 'Open palm, move fast left or right.' },
  { title: 'Pinch = click', body: 'Touch thumb and index finger to pop bubbles.' },
  { title: 'Gestures = actions', body: '👍 ✌️ 🤟 ✊ ☝️ 👎 each trigger something.' },
  { title: 'All on-device', body: 'MediaPipe runs in your browser – no video leaves it.' },
];

interface Bubble {
  id: number;
  x: number;
  y: number;
  r: number;
  vy: number;
  hue: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  char?: string;
  color: string;
}

export function GestureControl() {
  const cam = useVisionCamera('gesture', 'Gesture control');
  const boardRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const controller = useRef(new GestureController());
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [pinching, setPinching] = useState(false);
  const [gesture, setGesture] = useState<GestureName | null>(null);
  const [score, setScore] = useState(0);
  const [card, setCard] = useState(0);
  const [theme, setTheme] = useState(0);
  const [shake, setShake] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<Particle[]>([]);
  const nextId = useRef(1);
  const theremin = useRef(new Theremin());
  const thereminOn = useRef(false);
  const [thereminUi, setThereminUi] = useState(false);
  useEffect(() => () => theremin.current.stop(), []);

  const push = (msg: string) => setLog((l) => [msg, ...l].slice(0, 8));

  function burst(x: number, y: number, n: number, opts: { chars?: string[]; colors?: string[]; speed?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 6) * (0.3 + Math.random());
      particles.current.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 3,
        life: 60 + Math.random() * 30,
        char: opts.chars?.[i % opts.chars.length],
        color: opts.colors?.[i % opts.colors.length] ?? `hsl(${Math.random() * 360} 90% 60%)`,
      });
    }
  }

  function takePhoto() {
    const v = cam.videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = Math.round((240 * v.videoHeight) / v.videoWidth);
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setPhotos((p) => [c.toDataURL('image/jpeg', 0.8), ...p].slice(0, 6));
  }

  function onEvent(e: GestureEvent) {
    const board = boardRef.current!;
    const W = board.clientWidth;
    const H = board.clientHeight;
    if (e.type === 'pinch') {
      const px = e.x * W;
      const py = e.y * H;
      const hit = bubbles.current.find((b) => Math.hypot(b.x - px, b.y - py) < b.r + 12);
      if (hit) {
        bubbles.current = bubbles.current.filter((b) => b !== hit);
        burst(hit.x, hit.y, 18, { colors: [`hsl(${hit.hue} 90% 60%)`] });
        setScore((s) => s + 1);
        sfx.pop();
      } else {
        burst(px, py, 6, { colors: ['#999'], speed: 3 });
        if (!thereminOn.current) sfx.miss();
      }
    } else if (e.type === 'swipe') {
      if (e.direction === 'left') setCard((c) => (c + 1) % CARDS.length);
      if (e.direction === 'right') setCard((c) => (c - 1 + CARDS.length) % CARDS.length);
      push(`Swipe ${e.direction}`);
      sfx.whoosh();
    } else if (e.type === 'gesture') {
      const a = GESTURE_ACTIONS[e.name];
      push(`${a?.icon ?? ''} ${e.name.replace('_', ' ')} → ${a?.action ?? '—'}`);
      if (e.name === 'Thumb_Up') {
        burst(W / 2, H / 2, 80);
        sfx.confetti();
      }
      if (e.name === 'ILoveYou') {
        burst(W / 2, H * 0.6, 24, { chars: ['❤️', '💖', '💜'], speed: 5 });
        sfx.hearts();
      }
      if (e.name === 'Victory') {
        takePhoto();
        sfx.shutter();
      }
      if (e.name === 'Closed_Fist') {
        setScore(0);
        sfx.reset();
      }
      if (e.name === 'Pointing_Up') {
        setTheme((t) => (t + 1) % THEMES.length);
        sfx.theme();
      }
      if (e.name === 'Thumb_Down') {
        sfx.boo();
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    }
  }

  // Per-frame hand tracking → controller → UI.
  cam.onResult.current = (r, t) => {
    const f = controller.current.update(r, t);
    if (thereminOn.current) theremin.current.update(f.pointer);
    setPointer(f.pointer);
    setPinching(f.pinching);
    setGesture(f.gesture);
    f.events.forEach(onEvent);
  };

  // Bubble game + particle effects.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = fxRef.current;
      const board = boardRef.current;
      if (!c || !board) return;
      const W = (c.width = board.clientWidth);
      const H = (c.height = board.clientHeight);
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      if (bubbles.current.length < 7 && Math.random() < 0.04) {
        const r = 22 + Math.random() * 22;
        bubbles.current.push({ id: nextId.current++, x: r + Math.random() * (W - 2 * r), y: H + r, r, vy: 0.6 + Math.random() * 1.1, hue: Math.random() * 360 });
      }
      for (const b of bubbles.current) {
        b.y -= b.vy;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${b.hue} 85% 60% / 0.35)`;
        ctx.strokeStyle = `hsl(${b.hue} 85% 55%)`;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      }
      bubbles.current = bubbles.current.filter((b) => b.y > -b.r);
      ctx.font = '22px system-ui';
      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.life--;
        ctx.globalAlpha = Math.max(0, p.life / 90);
        if (p.char) ctx.fillText(p.char, p.x, p.y);
        else {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, 6, 6);
        }
      }
      ctx.globalAlpha = 1;
      particles.current = particles.current.filter((p) => p.life > 0 && p.y < H + 40);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  const accent = THEMES[theme];
  return (
    <DemoGrid aside={<CameraPanel cam={cam} kind="gesture" title="Gesture control" snippets={gestureSnippets} />}>
      <Card
        title={`Score: ${score}`}
        actions={
          <div className="row wrap">
            <SoundToggle />
            <button
              className={thereminUi ? 'chip active' : 'chip'}
              onClick={() => {
                const on = !thereminOn.current;
                thereminOn.current = on;
                setThereminUi(on);
                if (on) theremin.current.start();
                else theremin.current.stop();
              }}
            >
              🎵 Theremin
            </button>
            <span className="badge">{gesture ? `${GESTURE_ACTIONS[gesture]?.icon ?? ''} ${gesture.replace('_', ' ')}` : 'no gesture'}</span>
          </div>
        }
      >
        <p className="hint">
          Start the camera, then point with your index finger. Pinch (thumb + index) on a bubble to pop it.
          {thereminUi && ' Theremin: move your hand – left/right = pitch, up/down = volume.'}
        </p>
        <div ref={boardRef} className={`gesture-board${shake ? ' shake' : ''}`} style={{ borderColor: accent }}>
          <canvas ref={fxRef} className="fx" />
          <div className="swipe-card" style={{ background: accent }}>
            <small>
              {card + 1}/{CARDS.length}
            </small>
            <b>{CARDS[card].title}</b>
            <span>{CARDS[card].body}</span>
          </div>
          {pointer && (
            <div
              className={`air-cursor${pinching ? ' pinch' : ''}`}
              style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%`, borderColor: accent, background: pinching ? accent : undefined }}
            />
          )}
          {!cam.playing && <div className="board-hint">📷 Start the camera to play</div>}
        </div>
      </Card>
      <div className="grid2">
        <Card title="Gestures → actions">
          <ul className="gesture-list">
            {(Object.keys(GESTURE_ACTIONS) as GestureName[]).map((g) => (
              <li key={g} className={gesture === g ? 'active' : ''}>
                <span className="g-icon">{GESTURE_ACTIONS[g].icon}</span>
                <span>{GESTURE_ACTIONS[g].action}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Event log">
          {log.length ? (
            <ul className="event-log">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="hint">Events appear here.</p>
          )}
          {photos.length > 0 && (
            <div className="photos">
              {photos.map((p, i) => (
                <img key={i} src={p} alt={`Snapshot ${i + 1}`} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </DemoGrid>
  );
}

// ================================================================ Mood & blink detector
const MOOD_COLOR: Record<Mood, string> = { happy: '#30a46c', surprised: '#f5a623', sad: '#0090ff', angry: '#e5484d', neutral: '#8b8d98' };

export function MoodBlink() {
  const cam = useVisionCamera('face', 'Mood & blinks');
  const mood = useRef(new MoodTracker());
  const blink = useRef(new BlinkDetector());
  const [state, setState] = useState<{ mood: Mood; scores: Record<Mood, number> } | null>(null);
  const [eyes, setEyes] = useState<BlinkState | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [alarm, setAlarm] = useState(true);
  const [face, setFace] = useState(false);
  const history = useRef<{ t: number; mood: Mood }[]>([]);
  const timelineRef = useRef<HTMLCanvasElement>(null);
  const lastFrame = useRef(0);
  const beeped = useRef(false);
  const lastMood = useRef<Mood | null>(null);
  const lastMoodSound = useRef(0);
  const [moodSounds, setMoodSounds] = useState(true);
  const moodSoundsRef = useRef(true);
  moodSoundsRef.current = moodSounds;

  cam.onResult.current = (r, t) => {
    const cats = r.faceBlendshapes?.[0]?.categories;
    if (!cats) {
      if (face) setFace(false);
      return;
    }
    const m = mood.current.update(cats);
    const b = blink.current.update(cats, t);
    if (b.blinked) {
      setFlash('Blink!');
      sfx.blink();
    }
    if (b.wink) {
      setFlash(`😉 Wink (${b.wink})`);
      sfx.wink();
    }
    if (m.mood !== lastMood.current) {
      // At most one mood sound per 1.5 s – the dominant mood can flicker between two close scores.
      if (lastMood.current && moodSoundsRef.current && t - lastMoodSound.current > 1500) {
        sfx.mood(m.mood);
        lastMoodSound.current = t;
      }
      lastMood.current = m.mood;
    }
    if (b.closedMs > 1500 && alarm && !beeped.current) {
      beeped.current = true;
      sfx.alarm();
    }
    if (!b.eyesClosed) beeped.current = false;
    // Throttle React updates to ~15/s; timeline sampled at 4/s.
    if (t - lastFrame.current > 66) {
      lastFrame.current = t;
      setState(m);
      setEyes(b);
      setFace(true);
    }
    const h = history.current;
    if (!h.length || t - h[h.length - 1].t > 250) {
      h.push({ t, mood: m.mood });
      while (h.length && t - h[0].t > 60000) h.shift();
    }
  };

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(id);
  }, [flash]);

  // Mood timeline (last 60 s).
  useEffect(() => {
    const id = setInterval(() => {
      const c = timelineRef.current;
      if (!c) return;
      const W = (c.width = c.clientWidth);
      const H = (c.height = 28);
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      const now = performance.now();
      for (const p of history.current) {
        const x = W - ((now - p.t) / 60000) * W;
        ctx.fillStyle = MOOD_COLOR[p.mood];
        ctx.fillRect(x, 0, Math.max(2, W / 240), H);
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  const drowsy = (eyes?.closedMs ?? 0) > 1500;
  return (
    <DemoGrid aside={<CameraPanel cam={cam} kind="face" title="Mood & blink detection" snippets={moodSnippets} />}>
      {drowsy && <div className="drowsy">😴 Eyes closed for {((eyes?.closedMs ?? 0) / 1000).toFixed(1)} s – wake up!</div>}
      <div className="grid2">
        <Card title="Mood">
          <div className="mood-big" style={{ color: state ? MOOD_COLOR[state.mood] : undefined }}>
            <span className="mood-emoji">{face && state ? MOOD_EMOJI[state.mood] : '🙂'}</span>
            <b className={face && state ? 'cap' : ''}>{face && state ? state.mood : cam.playing ? 'Looking for a face…' : 'Start the camera'}</b>
          </div>
          {state && <ScoreBars items={MOODS.map((m) => ({ label: `${MOOD_EMOJI[m]} ${m}`, score: state.scores[m] }))} />}
          <div>
            <span className="field-label">Last 60 s</span>
            <canvas ref={timelineRef} className="timeline" />
          </div>
        </Card>
        <Card title="Eyes">
          <div className="eye-row">
            <div className="eye">
              <span className="eye-ball" style={{ transform: `scaleY(${1 - (eyes?.left ?? 0) * 0.9})` }} />
              <small>L {Math.round((eyes?.left ?? 0) * 100)}%</small>
            </div>
            <div className="eye">
              <span className="eye-ball" style={{ transform: `scaleY(${1 - (eyes?.right ?? 0) * 0.9})` }} />
              <small>R {Math.round((eyes?.right ?? 0) * 100)}%</small>
            </div>
          </div>
          <div className="stat-grid">
            <div>
              <b>{eyes?.blinks ?? 0}</b>
              <span>blinks</span>
            </div>
            <div>
              <b>{eyes?.blinksPerMinute ?? 0}</b>
              <span>per minute</span>
            </div>
            <div>
              <b>{eyes?.winksLeft ?? 0}</b>
              <span>winks L</span>
            </div>
            <div>
              <b>{eyes?.winksRight ?? 0}</b>
              <span>winks R</span>
            </div>
          </div>
          {flash && <div className="flash">{flash}</div>}
          <div className="row wrap">
            <SoundToggle />
            <label className="check">
              <input type="checkbox" checked={alarm} onChange={(e) => setAlarm(e.target.checked)} /> alarm when eyes stay closed &gt; 1.5 s
            </label>
            <label className="check">
              <input type="checkbox" checked={moodSounds} onChange={(e) => setMoodSounds(e.target.checked)} /> sound on mood change
            </label>
            <button onClick={() => blink.current.reset()}>Reset counters</button>
          </div>
          <p className="hint">Typical rate is 15–20 blinks/min; it drops a lot when staring at a screen.</p>
        </Card>
      </div>
      <p className="hint">
        Mood is a heuristic over MediaPipe’s 52 face blendshapes (smile, brow, jaw, eye-wide…), not a trained emotion classifier. Everything runs locally.
      </p>
    </DemoGrid>
  );
}
