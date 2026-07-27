import { play, setEnabled, type SoundName } from 'cuelume';

const STORAGE_KEY = 'joblog:sound-enabled';

function readStoredPreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

let enabled = readStoredPreference();
setEnabled(enabled);

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
  setEnabled(value);
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

function playCue(sound: SoundName) {
  play(sound);
}

export const playCheck = () => playCue('droplet');
export const playComplete = () => playCue('chime');
export const playAccepted = () => playCue('success');
export const playStatusChange = () => playCue('toggle');
export const playReject = () => playCue('whisper');
export const playAdd = () => playCue('bloom');
export const playDelete = () => playCue('release');
