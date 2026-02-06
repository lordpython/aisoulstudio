/**
 * VersionHistoryPanel - UI for browsing and restoring project snapshots
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Clock,
  Save,
  RotateCcw,
  Trash2,
  ChevronRight,
  Calendar,
  Tag,
  X,
  AlertCircle,
  Check,
  Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryState } from '@/types';
import {
  getSnapshots,
  createSnapshot,
  deleteSnapshot,
  renameSnapshot,
  getHistoryStats,
  formatSnapshotDate,
  type VersionSnapshot,
  type VersionHistoryStats,
} from '@/services/versionHistoryService';

interface VersionHistoryPanelProps {
  projectId: string;
  currentState: StoryState;
  onRestore: (state: StoryState) => void;
  className?: string;
}

export function VersionHistoryPanel({
  projectId,
  currentState,
  onRestore,
  className,
}: VersionHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([]);
  const [stats, setStats] = useState<VersionHistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState<VersionSnapshot | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [filter, setFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const type = filter === 'all' ? undefined : filter;
      const [snapshotList, historyStats] = await Promise.all([
        getSnapshots(projectId, { type, limit: 50 }),
        getHistoryStats(projectId),
      ]);
      setSnapshots(snapshotList);
      setStats(historyStats);
    } catch (error) {
      console.error('[VersionHistory] Failed to load snapshots:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, filter]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleSaveSnapshot = async () => {
    if (!saveName.trim()) return;

    try {
      await createSnapshot(projectId, currentState, saveName, saveDescription, 'manual');
      setShowSaveDialog(false);
      setSaveName('');
      setSaveDescription('');
      await loadSnapshots();
    } catch (error) {
      console.error('[VersionHistory] Failed to save snapshot:', error);
    }
  };

  const handleDelete = async (snapshotId: string) => {
    try {
      await deleteSnapshot(snapshotId);
      setSnapshots(prev => prev.filter(s => s.id !== snapshotId));
      if (selectedSnapshot?.id === snapshotId) {
        setSelectedSnapshot(null);
      }
    } catch (error) {
      console.error('[VersionHistory] Failed to delete snapshot:', error);
    }
  };

  const handleRestore = (snapshot: VersionSnapshot) => {
    onRestore(snapshot.state);
    setConfirmRestore(null);
    setSelectedSnapshot(null);
  };

  const handleRename = async (snapshotId: string) => {
    if (!editName.trim()) return;

    try {
      await renameSnapshot(snapshotId, editName);
      setSnapshots(prev =>
        prev.map(s => (s.id === snapshotId ? { ...s, name: editName } : s))
      );
      setEditingId(null);
      setEditName('');
    } catch (error) {
      console.error('[VersionHistory] Failed to rename snapshot:', error);
    }
  };

  const getTypeIcon = (type: VersionSnapshot['type']) => {
    switch (type) {
      case 'manual':
        return <Save className="w-3 h-3" />;
      case 'auto':
        return <Clock className="w-3 h-3" />;
      case 'checkpoint':
        return <Tag className="w-3 h-3" />;
    }
  };

  const getTypeColor = (type: VersionSnapshot['type']) => {
    switch (type) {
      case 'manual':
        return 'text-violet-400 bg-violet-500/20';
      case 'auto':
        return 'text-blue-400 bg-blue-500/20';
      case 'checkpoint':
        return 'text-amber-400 bg-amber-500/20';
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-black/40 rounded-xl border border-white/10', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-violet-400" />
          <h3 className="font-medium text-white">Version History</h3>
        </div>
        <button
          onClick={() => setShowSaveDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          Save Version
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-4 py-2 border-b border-white/5 text-xs text-white/50 flex items-center gap-4">
          <span>{stats.totalSnapshots} versions</span>
          <span>{stats.manualSnapshots} saved</span>
          <span>{stats.autoSnapshots} auto</span>
          {stats.totalSizeBytes > 0 && (
            <span>{(stats.totalSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-white/5">
        {(['all', 'manual', 'auto'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1 text-xs rounded-full transition-colors capitalize',
              filter === f
                ? 'bg-violet-600 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Snapshot List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-8 text-white/40">
            <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No versions saved yet</p>
            <p className="text-xs mt-1">Click "Save Version" to create a snapshot</p>
          </div>
        ) : (
          <AnimatePresence>
            {snapshots.map((snapshot) => (
              <motion.div
                key={snapshot.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  'p-3 rounded-lg border transition-colors cursor-pointer',
                  selectedSnapshot?.id === snapshot.id
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-white/5 hover:border-white/20 bg-white/5'
                )}
                onClick={() => setSelectedSnapshot(snapshot)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {editingId === snapshot.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(snapshot.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="flex-1 px-2 py-1 text-sm bg-black/30 border border-white/20 rounded text-white"
                          autoFocus
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRename(snapshot.id);
                          }}
                          className="p-1 text-green-400 hover:bg-green-500/20 rounded"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'p-1 rounded',
                            getTypeColor(snapshot.type)
                          )}
                        >
                          {getTypeIcon(snapshot.type)}
                        </span>
                        <span className="font-medium text-white text-sm truncate">
                          {snapshot.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(snapshot.id);
                            setEditName(snapshot.name);
                          }}
                          className="p-1 text-white/40 hover:text-white/70 opacity-0 group-hover:opacity-100"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-white/40">
                      <Calendar className="w-3 h-3" />
                      <span>{formatSnapshotDate(snapshot.timestamp)}</span>
                    </div>
                    {snapshot.metadata && (
                      <div className="flex items-center gap-2 mt-1 text-xs text-white/30">
                        <span>{snapshot.metadata.sceneCount} scenes</span>
                        <span>•</span>
                        <span>{snapshot.metadata.shotCount} shots</span>
                        <span>•</span>
                        <span>{snapshot.metadata.step}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {confirmRestore === snapshot.id ? (
                      <div className="flex items-center gap-1 bg-amber-500/20 rounded-lg p-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(snapshot);
                          }}
                          className="p-1.5 text-green-400 hover:bg-green-500/20 rounded"
                          title="Confirm restore"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmRestore(null);
                          }}
                          className="p-1.5 text-red-400 hover:bg-red-500/20 rounded"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmRestore(snapshot.id);
                          }}
                          className="p-1.5 text-white/40 hover:text-violet-400 hover:bg-violet-500/20 rounded transition-colors"
                          title="Restore this version"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(snapshot.id);
                          }}
                          className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Save Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowSaveDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-gray-900 rounded-xl border border-white/10 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-lg font-medium text-white mb-4">Save Version</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Version Name</label>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="e.g., Before major changes"
                    className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder:text-white/30"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Description (optional)</label>
                  <textarea
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    placeholder="Notes about this version..."
                    className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder:text-white/30 resize-none h-20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-2 text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSnapshot}
                  disabled={!saveName.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Save Version
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default VersionHistoryPanel;
