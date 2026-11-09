import { NotImplemented } from '../domain/errors';
import type { Repository } from './repository';

/** Lane A implements: one JSON object under STORAGE_KEY, one setItem per save. */
export function createLocalStorageRepository(): Repository {
  throw new NotImplemented('createLocalStorageRepository');
}
