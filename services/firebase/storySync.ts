/**
 * Firestore Story Sync Service
 *
 * Real-time synchronization of story state to Firestore.
 * Stores metadata only - media files go to GCS via cloudStorageService.
 */
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from './config';
import { getCurrentUser } from './authService';
import type { StoryState } from '@/types';

/**
 * Story document stored in Firestore
 * Contains metadata and cloud URLs - no base64 data
 */
export interface StorySyncDocument {
  // Identifiers
  id: string; // Document ID = sessionId
  userId: string;
  title: string;
  topic?: string;

  // Timestamps
  createdAt: ReturnType<typeof serverTimestamp>;
  updatedAt: ReturnType<typeof serverTimestamp>;

  // Story state (stripped of base64 data)
  state: StoryState;

  // Cloud storage references
  cloudSessionId: string; // Maps to GCS folder: production_{sessionId}/
}

/**
 * Strip base64/blob data from state before syncing to Firestore.
 * Media URLs that start with https:// (cloud URLs) are kept.
 */
function stripLocalMediaData(state: StoryState): StoryState {
  const stripped = { ...state };

  // Strip shotlist imageUrls that are local (blob: or data:)
  if (stripped.shotlist) {
    stripped.shotlist = stripped.shotlist.map((shot) => ({
      ...shot,
      imageUrl: shot.imageUrl?.startsWith('https://') ? shot.imageUrl : undefined,
    }));
  }

  // Strip narration audioUrls that are local
  if (stripped.narrationSegments) {
    stripped.narrationSegments = stripped.narrationSegments.map((seg) => ({
      ...seg,
      audioUrl: seg.audioUrl?.startsWith('https://') ? seg.audioUrl : '',
    }));
  }

  // Strip animated shot videoUrls that are local
  if (stripped.animatedShots) {
    stripped.animatedShots = stripped.animatedShots.map((shot) => ({
      ...shot,
      videoUrl: shot.videoUrl?.startsWith('https://') ? shot.videoUrl : '',
      thumbnailUrl: shot.thumbnailUrl?.startsWith('https://')
        ? shot.thumbnailUrl
        : undefined,
    }));
  }

  // Strip final video URL if local
  if (stripped.finalVideoUrl && !stripped.finalVideoUrl.startsWith('https://')) {
    stripped.finalVideoUrl = undefined;
  }

  return stripped;
}

/**
 * Generate a title from story state
 */
function generateTitle(state: StoryState): string {
  // Try to get title from script
  if (state.script?.title) {
    return state.script.title;
  }

  // Try to get from first scene heading
  if (state.breakdown.length > 0 && state.breakdown[0]?.heading) {
    return state.breakdown[0].heading.substring(0, 50);
  }

  // Default
  return 'Untitled Story';
}

/**
 * Save story state to Firestore
 */
export async function saveStoryToCloud(
  sessionId: string,
  state: StoryState,
  topic?: string
): Promise<boolean> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    console.log('[StorySync] Cannot save - no auth or Firebase not configured');
    return false;
  }

  try {
    const docRef = doc(db, 'stories', sessionId);
    const strippedState = stripLocalMediaData(state);

    const storyDoc: Omit<StorySyncDocument, 'createdAt'> & {
      createdAt?: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    } = {
      id: sessionId,
      userId: user.uid,
      title: generateTitle(state),
      topic,
      updatedAt: serverTimestamp(),
      state: strippedState,
      cloudSessionId: sessionId,
    };

    // Check if document exists to preserve createdAt
    const existing = await getDoc(docRef);
    if (!existing.exists()) {
      storyDoc.createdAt = serverTimestamp();
    }

    await setDoc(docRef, storyDoc, { merge: true });
    console.log(`[StorySync] Saved story ${sessionId} to Firestore`);
    return true;
  } catch (error) {
    console.error('[StorySync] Failed to save:', error);
    return false;
  }
}

/**
 * Load story state from Firestore
 */
export async function loadStoryFromCloud(
  sessionId: string
): Promise<StoryState | null> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return null;
  }

  try {
    const docRef = doc(db, 'stories', sessionId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as StorySyncDocument;

    // Verify ownership
    if (data.userId !== user.uid) {
      console.warn('[StorySync] Story belongs to different user');
      return null;
    }

    console.log(`[StorySync] Loaded story ${sessionId} from Firestore`);
    return data.state;
  } catch (error) {
    console.error('[StorySync] Failed to load:', error);
    return null;
  }
}

/**
 * Delete story from Firestore
 */
export async function deleteStoryFromCloud(sessionId: string): Promise<boolean> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return false;
  }

  try {
    const docRef = doc(db, 'stories', sessionId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as StorySyncDocument;
      if (data.userId !== user.uid) {
        console.warn('[StorySync] Cannot delete - story belongs to different user');
        return false;
      }
    }

    await deleteDoc(docRef);
    console.log(`[StorySync] Deleted story ${sessionId}`);
    return true;
  } catch (error) {
    console.error('[StorySync] Failed to delete:', error);
    return false;
  }
}

/**
 * List user's stories
 */
export interface StoryListItem {
  id: string;
  title: string;
  topic?: string;
  updatedAt: Date;
  createdAt: Date;
  sceneCount: number;
  hasVisuals: boolean;
  hasNarration: boolean;
  hasAnimation: boolean;
}

export async function listUserStories(
  maxResults: number = 20
): Promise<StoryListItem[]> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return [];
  }

  try {
    const storiesRef = collection(db, 'stories');
    const q = query(
      storiesRef,
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(maxResults)
    );

    const snapshot = await getDocs(q);
    const stories: StoryListItem[] = [];

    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() as DocumentData;
      // Firestore timestamps come back as Timestamp objects when read
      const updatedAt = data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : new Date();
      const createdAt = data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date();

      stories.push({
        id: data.id,
        title: data.title,
        topic: data.topic,
        updatedAt,
        createdAt,
        sceneCount: data.state?.breakdown?.length || 0,
        hasVisuals: (data.state?.scenesWithVisuals?.length || 0) > 0,
        hasNarration: (data.state?.narrationSegments?.length || 0) > 0,
        hasAnimation: (data.state?.animatedShots?.length || 0) > 0,
      });
    });

    return stories;
  } catch (error) {
    console.error('[StorySync] Failed to list stories:', error);
    return [];
  }
}

/**
 * Subscribe to real-time updates for a story
 */
export function subscribeToStory(
  sessionId: string,
  onUpdate: (state: StoryState | null) => void
): Unsubscribe | null {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return null;
  }

  const docRef = doc(db, 'stories', sessionId);

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (!docSnap.exists()) {
        onUpdate(null);
        return;
      }

      const data = docSnap.data() as StorySyncDocument;

      // Verify ownership
      if (data.userId !== user.uid) {
        console.warn('[StorySync] Real-time update for story owned by different user');
        onUpdate(null);
        return;
      }

      onUpdate(data.state);
    },
    (error) => {
      console.error('[StorySync] Real-time subscription error:', error);
    }
  );
}

/**
 * Check if story sync is available
 */
export function isSyncAvailable(): boolean {
  return isFirebaseConfigured() && getCurrentUser() !== null;
}

/**
 * Debounced save function to avoid too many writes
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 2000; // 2 seconds

export function debouncedSaveToCloud(
  sessionId: string,
  state: StoryState,
  topic?: string
): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    await saveStoryToCloud(sessionId, state, topic);
    saveTimeout = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Flush any pending saves immediately
 */
export async function flushPendingSave(
  sessionId: string,
  state: StoryState,
  topic?: string
): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  await saveStoryToCloud(sessionId, state, topic);
}
