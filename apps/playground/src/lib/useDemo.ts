import { useEffect, useMemo, useRef, useState } from 'react';
import { findModel, modelsForTask, type CatalogModel } from '@front-brain/catalog';
import { assessFit, type ModelRequirements } from '@front-brain/core';
import { useHardware, usePipeline } from '@front-brain/react';
import type { Device } from '@front-brain/transformers';

export interface Choice {
  model: string;
  device: Device;
  dtype: string;
}

export const requirementsOf = (m: CatalogModel | undefined): ModelRequirements | null =>
  m ? { sizeMB: m.sizeMB, needsWebGPU: m.needsWebGPU, needsF16: m.needsF16 } : null;

/** Model choice (from the catalog or custom) + a Transformers.js pipeline bound to it. */
export function useDemo(label: string, task: string) {
  const presets = useMemo(() => modelsForTask(task), [task]);
  const hw = useHardware();
  const [choice, setChoice] = useState<Choice>({ model: presets[0]?.id ?? '', device: 'wasm', dtype: presets[0]?.dtype ?? '' });
  const picked = useRef(false);

  // Once hardware is known, default to the suggested device (only until the user picks one).
  useEffect(() => {
    if (!hw || picked.current) return;
    const req = requirementsOf(findModel(choice.model));
    if (!req) return;
    const device = assessFit(req, hw).suggestedDevice;
    // fp16 weights need WebGPU shader-f16; otherwise start from plain 4-bit (user can still change it).
    const f16ok = device === 'webgpu' && hw.f16;
    setChoice((c) => ({ ...c, device, dtype: /f16/.test(c.dtype) && !f16ok ? 'q4' : c.dtype }));
  }, [hw]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (c: Choice) => {
    picked.current = true;
    setChoice(c);
  };
  const pipe = usePipeline({ task, model: choice.model, device: choice.device, dtype: choice.dtype || undefined }, { label });
  return { label, task, presets, choice, setChoice: update, pipe, hw };
}

export type Demo = ReturnType<typeof useDemo>;
