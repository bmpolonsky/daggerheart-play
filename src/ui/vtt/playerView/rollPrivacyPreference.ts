import { useEffect, useState } from 'preact/hooks';

const PRIVATE_ROLL_STORAGE_KEY = 'daggerheart-play:private-rolls';

export function usePrivateRollPreference(): [boolean, (value: boolean) => void] {
  const [privateRoll, setPrivateRoll] = useState(() => readPrivateRollPreference());

  useEffect(() => {
    writePrivateRollPreference(privateRoll);
  }, [privateRoll]);

  return [privateRoll, setPrivateRoll];
}

function readPrivateRollPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PRIVATE_ROLL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePrivateRollPreference(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRIVATE_ROLL_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // localStorage is optional for player view preferences.
  }
}
