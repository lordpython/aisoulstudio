/**
 * Project Service
 *
 * CRUD operations for user projects stored in Firestore.
 * Projects are stored under /users/{userId}/projects/{projectId}
 * Export history is stored as a subcollection /users/{userId}/projects/{projectId}/exports
 */
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
  addDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from './firebase/config';
import { getCurrentUser } from './firebase/authService';

// ============================================================
// Types
// ============================================================

export type ProjectType = 'production' | 'story' | 'visualizer';
export type ProjectStatus = 'draft' | 'in_progress' | 'completed' | 'archived';

export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string;
  type: ProjectType;
  status: ProjectStatus;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;

  // Visual metadata
  thumbnailUrl?: string;
  duration?: number; // seconds

  // Project config
  style?: string;
  topic?: string;
  language?: string;

  // Progress tracking
  sceneCount?: number;
  hasVisuals?: boolean;
  hasNarration?: boolean;
  hasMusic?: boolean;
  hasExport?: boolean;

  // Cloud storage reference
  cloudSessionId: string;

  // Tags for filtering
  tags?: string[];
  isFavorite?: boolean;
}

export interface ExportRecord {
  id: string;
  projectId: string;
  format: 'mp4' | 'webm' | 'gif';
  quality: 'draft' | 'standard' | 'high' | 'ultra';
  aspectRatio: '16:9' | '9:16' | '1:1';
  cloudUrl?: string;
  localUrl?: string;
  fileSize?: number;
  duration?: number;
  createdAt: Date;
  settings?: Record<string, unknown>;
}

export interface CreateProjectInput {
  title: string;
  type: ProjectType;
  topic?: string;
  style?: string;
  description?: string;
}

export interface UpdateProjectInput {
  title?: string;
  description?: string;
  status?: ProjectStatus;
  thumbnailUrl?: string;
  duration?: number;
  style?: string;
  topic?: string;
  sceneCount?: number;
  hasVisuals?: boolean;
  hasNarration?: boolean;
  hasMusic?: boolean;
  hasExport?: boolean;
  tags?: string[];
  isFavorite?: boolean;
}

// ============================================================
// Helpers
// ============================================================

function generateProjectId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `proj_${timestamp}_${random}`;
}

function generateCloudSessionId(projectId: string): string {
  return `production_${projectId}`;
}

function timestampToDate(timestamp: unknown): Date {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return new Date();
}

function docToProject(data: DocumentData): Project {
  return {
    id: data.id,
    userId: data.userId,
    title: data.title || 'Untitled Project',
    description: data.description,
    type: data.type || 'production',
    status: data.status || 'draft',
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
    lastAccessedAt: data.lastAccessedAt ? timestampToDate(data.lastAccessedAt) : undefined,
    thumbnailUrl: data.thumbnailUrl,
    duration: data.duration,
    style: data.style,
    topic: data.topic,
    language: data.language,
    sceneCount: data.sceneCount,
    hasVisuals: data.hasVisuals,
    hasNarration: data.hasNarration,
    hasMusic: data.hasMusic,
    hasExport: data.hasExport,
    cloudSessionId: data.cloudSessionId,
    tags: data.tags || [],
    isFavorite: data.isFavorite || false,
  };
}

function docToExportRecord(data: DocumentData): ExportRecord {
  return {
    id: data.id,
    projectId: data.projectId,
    format: data.format || 'mp4',
    quality: data.quality || 'standard',
    aspectRatio: data.aspectRatio || '16:9',
    cloudUrl: data.cloudUrl,
    localUrl: data.localUrl,
    fileSize: data.fileSize,
    duration: data.duration,
    createdAt: timestampToDate(data.createdAt),
    settings: data.settings,
  };
}

// ============================================================
// Project CRUD Operations
// ============================================================

/**
 * Create a new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project | null> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    console.warn('[ProjectService] Cannot create - no auth or Firebase not configured');
    return null;
  }

  try {
    const projectId = generateProjectId();
    const cloudSessionId = generateCloudSessionId(projectId);
    const now = serverTimestamp();

    const projectData = {
      id: projectId,
      userId: user.uid,
      title: input.title,
      description: input.description || '',
      type: input.type,
      status: 'draft' as ProjectStatus,
      topic: input.topic || '',
      style: input.style || '',
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      cloudSessionId,
      sceneCount: 0,
      hasVisuals: false,
      hasNarration: false,
      hasMusic: false,
      hasExport: false,
      tags: [],
      isFavorite: false,
    };

    const docRef = doc(db, 'users', user.uid, 'projects', projectId);
    await setDoc(docRef, projectData);

    console.log(`[ProjectService] Created project ${projectId}`);

    // Return with proper dates
    return {
      ...projectData,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
    };
  } catch (error) {
    console.error('[ProjectService] Failed to create project:', error);
    return null;
  }
}

/**
 * Get a project by ID
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return null;
  }

  try {
    const docRef = doc(db, 'users', user.uid, 'projects', projectId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log(`[ProjectService] Project ${projectId} not found`);
      return null;
    }

    const project = docToProject(docSnap.data());

    // Verify ownership
    if (project.userId !== user.uid) {
      console.warn('[ProjectService] Project belongs to different user');
      return null;
    }

    console.log(`[ProjectService] Loaded project ${projectId}`);
    return project;
  } catch (error) {
    console.error('[ProjectService] Failed to get project:', error);
    return null;
  }
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: string,
  updates: UpdateProjectInput
): Promise<boolean> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return false;
  }

  try {
    const docRef = doc(db, 'users', user.uid, 'projects', projectId);

    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    console.log(`[ProjectService] Updated project ${projectId}`);
    return true;
  } catch (error) {
    console.error('[ProjectService] Failed to update project:', error);
    return false;
  }
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return false;
  }

  try {
    // First verify ownership
    const docRef = doc(db, 'users', user.uid, 'projects', projectId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log(`[ProjectService] Project ${projectId} not found`);
      return false;
    }

    const data = docSnap.data();
    if (data.userId !== user.uid) {
      console.warn('[ProjectService] Cannot delete - project belongs to different user');
      return false;
    }

    // Delete the project document
    // Note: Exports subcollection will remain orphaned but Firebase doesn't cascade deletes
    // For full cleanup, we would need to delete exports first or use Cloud Functions
    await deleteDoc(docRef);

    console.log(`[ProjectService] Deleted project ${projectId}`);
    return true;
  } catch (error) {
    console.error('[ProjectService] Failed to delete project:', error);
    return false;
  }
}

/**
 * List user's projects
 */
export async function listUserProjects(maxResults: number = 50): Promise<Project[]> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return [];
  }

  try {
    const projectsRef = collection(db, 'users', user.uid, 'projects');
    const q = query(
      projectsRef,
      orderBy('updatedAt', 'desc'),
      limit(maxResults)
    );

    const snapshot = await getDocs(q);
    const projects: Project[] = [];

    snapshot.forEach((docSnapshot) => {
      projects.push(docToProject(docSnapshot.data()));
    });

    console.log(`[ProjectService] Listed ${projects.length} projects`);
    return projects;
  } catch (error) {
    console.error('[ProjectService] Failed to list projects:', error);
    return [];
  }
}

/**
 * Mark project as accessed (updates lastAccessedAt)
 */
export async function markProjectAccessed(projectId: string): Promise<void> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) return;

  try {
    const docRef = doc(db, 'users', user.uid, 'projects', projectId);
    await updateDoc(docRef, {
      lastAccessedAt: serverTimestamp(),
    });
  } catch (error) {
    // Non-critical, just log
    console.warn('[ProjectService] Failed to mark accessed:', error);
  }
}

/**
 * Toggle project favorite status
 */
export async function toggleFavorite(projectId: string): Promise<boolean> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return false;
  }

  try {
    const docRef = doc(db, 'users', user.uid, 'projects', projectId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return false;
    }

    const currentFavorite = docSnap.data().isFavorite || false;

    await updateDoc(docRef, {
      isFavorite: !currentFavorite,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error('[ProjectService] Failed to toggle favorite:', error);
    return false;
  }
}

// ============================================================
// Export History Operations
// ============================================================

/**
 * Save an export record
 */
export async function saveExportRecord(
  projectId: string,
  exportData: Omit<ExportRecord, 'id' | 'projectId' | 'createdAt'>
): Promise<ExportRecord | null> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return null;
  }

  try {
    const exportsRef = collection(db, 'users', user.uid, 'projects', projectId, 'exports');

    const exportDoc = {
      ...exportData,
      projectId,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(exportsRef, exportDoc);

    // Also update project to mark hasExport
    await updateProject(projectId, { hasExport: true });

    console.log(`[ProjectService] Saved export record ${docRef.id}`);

    return {
      id: docRef.id,
      projectId,
      ...exportData,
      createdAt: new Date(),
    };
  } catch (error) {
    console.error('[ProjectService] Failed to save export record:', error);
    return null;
  }
}

/**
 * Get export history for a project
 */
export async function getExportHistory(
  projectId: string,
  maxResults: number = 20
): Promise<ExportRecord[]> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return [];
  }

  try {
    const exportsRef = collection(db, 'users', user.uid, 'projects', projectId, 'exports');
    const q = query(
      exportsRef,
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );

    const snapshot = await getDocs(q);
    const exports: ExportRecord[] = [];

    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      exports.push(docToExportRecord({ ...data, id: docSnapshot.id }));
    });

    return exports;
  } catch (error) {
    console.error('[ProjectService] Failed to get export history:', error);
    return [];
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Check if project service is available
 */
export function isProjectServiceAvailable(): boolean {
  return isFirebaseConfigured() && getCurrentUser() !== null;
}

/**
 * Get project count for current user
 */
export async function getProjectCount(): Promise<number> {
  const projects = await listUserProjects(1000);
  return projects.length;
}

/**
 * Search projects by title
 */
export async function searchProjects(searchTerm: string): Promise<Project[]> {
  // Firestore doesn't support full-text search natively
  // So we fetch all and filter client-side (acceptable for personal projects)
  const projects = await listUserProjects(100);

  const term = searchTerm.toLowerCase();
  return projects.filter(
    (p) =>
      p.title.toLowerCase().includes(term) ||
      p.topic?.toLowerCase().includes(term) ||
      p.description?.toLowerCase().includes(term)
  );
}

/**
 * Get recent projects (last 5 accessed)
 */
export async function getRecentProjects(): Promise<Project[]> {
  const db = getFirebaseDb();
  const user = getCurrentUser();

  if (!db || !user) {
    return [];
  }

  try {
    const projectsRef = collection(db, 'users', user.uid, 'projects');
    const q = query(
      projectsRef,
      orderBy('lastAccessedAt', 'desc'),
      limit(5)
    );

    const snapshot = await getDocs(q);
    const projects: Project[] = [];

    snapshot.forEach((docSnapshot) => {
      projects.push(docToProject(docSnapshot.data()));
    });

    return projects;
  } catch (error) {
    console.error('[ProjectService] Failed to get recent projects:', error);
    return [];
  }
}

/**
 * Get favorite projects
 */
export async function getFavoriteProjects(): Promise<Project[]> {
  const projects = await listUserProjects(100);
  return projects.filter((p) => p.isFavorite);
}
