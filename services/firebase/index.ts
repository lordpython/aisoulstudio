/**
 * Firebase Services
 *
 * Exports authentication and story sync functionality.
 */
export { isFirebaseConfigured } from './config';

export {
  signInWithGoogle,
  signInWithEmail,
  createAccount,
  signOut,
  getCurrentUser,
  onAuthChange,
  isAuthAvailable,
  type AuthUser,
} from './authService';

export {
  saveStoryToCloud,
  loadStoryFromCloud,
  deleteStoryFromCloud,
  listUserStories,
  subscribeToStory,
  isSyncAvailable,
  debouncedSaveToCloud,
  flushPendingSave,
  type StoryListItem,
  type StorySyncDocument,
} from './storySync';
