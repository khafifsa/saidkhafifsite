import type { Store } from './content';

let store: Store | undefined;

export function setStore(s: Store): void {
  store = s;
}

export function getStore(): Store {
  if (!store) throw new Error('Store not loaded');
  return store;
}
