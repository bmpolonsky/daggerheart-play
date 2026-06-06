import { useEffect, useState } from 'preact/hooks';
import { localAppStorageStore } from '../../../core/persistence/appBrowserStorage';

export function usePrivateRollPreference(): [boolean, (value: boolean) => void] {
  const [privateRoll, setPrivateRoll] = useState(() => readPrivateRollPreference());

  useEffect(() => {
    writePrivateRollPreference(privateRoll);
  }, [privateRoll]);

  return [privateRoll, setPrivateRoll];
}

function readPrivateRollPreference(): boolean {
  return localAppStorageStore.getState().preferences?.privateRolls === true;
}

function writePrivateRollPreference(value: boolean): void {
  localAppStorageStore.update((state) => ({
    preferences: {
      ...state.preferences,
      privateRolls: value
    }
  }));
}
