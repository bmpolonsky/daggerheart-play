import type { AppLocalStorageState, AppSessionStorageState } from '../../appBrowserStorage';

export interface AppStorageMigrationContext<T extends object> {
  storage: Storage;
  state: T;
  migrated: boolean;
}

export type LocalStorageMigrationContext = AppStorageMigrationContext<AppLocalStorageState>;
export type SessionStorageMigrationContext = AppStorageMigrationContext<AppSessionStorageState>;
