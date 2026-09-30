import { useModelChoice, useTjs, type ModelPreset } from './useTjs';

/** Model choice + runner wired together; spread `panel` into <TjsPanel>. */
export function useDemo(name: string, task: string, presets: ModelPreset[]) {
  const { choice, setChoice, gpu } = useModelChoice(presets);
  const tjs = useTjs(name, task, choice);
  return { choice, tjs, panel: { presets, choice, setChoice, gpu, tjs } };
}
