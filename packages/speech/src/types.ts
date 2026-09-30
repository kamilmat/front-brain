export type EngineId = 'webspeech' | 'whisper' | 'vosk';

export interface TranscriptEvent {
  /** Stable id of the utterance (interim results of one utterance share it). */
  utteranceId: string;
  text: string;
  final: boolean;
  /** Recognition latency for final results, when known (ms from end of speech). */
  latencyMs?: number;
}

export interface Recognizer {
  engine: EngineId;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Microphone input level 0..1 (0 when unknown). */
  level(): number;
  readonly listening: boolean;
}

export interface RecognizerCallbacks {
  onTranscript: (e: TranscriptEvent) => void;
  onError?: (message: string) => void;
  /** Speech started / ended (VAD or engine events). */
  onSpeech?: (speaking: boolean) => void;
  onState?: (state: 'idle' | 'loading' | 'listening' | 'processing') => void;
}
