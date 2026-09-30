/// <reference lib="webworker" />
/** WebLLM worker entry. Import from your own worker file or let WebLLMRuntime spawn it. */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
