/**
 * useModalState - Unified modal state management
 *
 * Replaces scattered boolean state flags with a single state machine
 * for managing modals and side panels.
 */

import { useState, useCallback, useMemo } from 'react';

export type ModalType =
  | 'export'
  | 'quality'
  | 'sceneEditor'
  | 'music'
  | 'settings'
  | 'timeline'
  | null;

export interface ModalOptions {
  /** Data to pass to the modal */
  data?: Record<string, unknown>;
  /** Callback when modal closes */
  onClose?: () => void;
}

export interface ModalState {
  activeModal: ModalType;
  modalData: Record<string, unknown>;
}

export interface UseModalStateReturn {
  /** Currently active modal (null if none) */
  activeModal: ModalType;
  /** Data passed to the active modal */
  modalData: Record<string, unknown>;
  /** Open a specific modal */
  openModal: (modal: ModalType, options?: ModalOptions) => void;
  /** Close the currently active modal */
  closeModal: () => void;
  /** Toggle a modal open/closed */
  toggleModal: (modal: ModalType, options?: ModalOptions) => void;
  /** Check if a specific modal is open */
  isOpen: (modal: ModalType) => boolean;
  /** Close all modals */
  closeAll: () => void;

  // Convenience boolean getters for common use cases
  showExport: boolean;
  showQuality: boolean;
  showSceneEditor: boolean;
  showMusic: boolean;
  showSettings: boolean;
  showTimeline: boolean;

  // Convenience setters for backwards compatibility
  setShowExport: (show: boolean) => void;
  setShowQuality: (show: boolean) => void;
  setShowSceneEditor: (show: boolean) => void;
  setShowMusic: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowTimeline: (show: boolean) => void;
}

/**
 * Hook for managing modal/panel visibility state
 *
 * @example
 * ```tsx
 * const { activeModal, openModal, closeModal, showExport } = useModalState();
 *
 * // Open with data
 * openModal('export', { data: { videoTitle: 'My Video' } });
 *
 * // Use convenience boolean
 * if (showExport) { ... }
 *
 * // Toggle
 * toggleModal('sceneEditor');
 * ```
 */
export function useModalState(initialModal: ModalType = null): UseModalStateReturn {
  const [state, setState] = useState<ModalState>({
    activeModal: initialModal,
    modalData: {},
  });

  const [closeCallback, setCloseCallback] = useState<(() => void) | null>(null);

  const openModal = useCallback((modal: ModalType, options?: ModalOptions) => {
    setState({
      activeModal: modal,
      modalData: options?.data || {},
    });
    if (options?.onClose) {
      setCloseCallback(() => options.onClose);
    }
  }, []);

  const closeModal = useCallback(() => {
    if (closeCallback) {
      closeCallback();
      setCloseCallback(null);
    }
    setState({
      activeModal: null,
      modalData: {},
    });
  }, [closeCallback]);

  const toggleModal = useCallback((modal: ModalType, options?: ModalOptions) => {
    setState((prev) => {
      if (prev.activeModal === modal) {
        if (closeCallback) {
          closeCallback();
          setCloseCallback(null);
        }
        return { activeModal: null, modalData: {} };
      }
      if (options?.onClose) {
        setCloseCallback(() => options.onClose);
      }
      return {
        activeModal: modal,
        modalData: options?.data || {},
      };
    });
  }, [closeCallback]);

  const isOpen = useCallback((modal: ModalType): boolean => {
    return state.activeModal === modal;
  }, [state.activeModal]);

  const closeAll = useCallback(() => {
    if (closeCallback) {
      closeCallback();
      setCloseCallback(null);
    }
    setState({ activeModal: null, modalData: {} });
  }, [closeCallback]);

  // Convenience booleans
  const showExport = state.activeModal === 'export';
  const showQuality = state.activeModal === 'quality';
  const showSceneEditor = state.activeModal === 'sceneEditor';
  const showMusic = state.activeModal === 'music';
  const showSettings = state.activeModal === 'settings';
  const showTimeline = state.activeModal === 'timeline';

  // Convenience setters for backwards compatibility
  const setShowExport = useCallback((show: boolean) => {
    if (show) openModal('export');
    else if (state.activeModal === 'export') closeModal();
  }, [openModal, closeModal, state.activeModal]);

  const setShowQuality = useCallback((show: boolean) => {
    if (show) openModal('quality');
    else if (state.activeModal === 'quality') closeModal();
  }, [openModal, closeModal, state.activeModal]);

  const setShowSceneEditor = useCallback((show: boolean) => {
    if (show) openModal('sceneEditor');
    else if (state.activeModal === 'sceneEditor') closeModal();
  }, [openModal, closeModal, state.activeModal]);

  const setShowMusic = useCallback((show: boolean) => {
    if (show) openModal('music');
    else if (state.activeModal === 'music') closeModal();
  }, [openModal, closeModal, state.activeModal]);

  const setShowSettings = useCallback((show: boolean) => {
    if (show) openModal('settings');
    else if (state.activeModal === 'settings') closeModal();
  }, [openModal, closeModal, state.activeModal]);

  const setShowTimeline = useCallback((show: boolean) => {
    if (show) openModal('timeline');
    else if (state.activeModal === 'timeline') closeModal();
  }, [openModal, closeModal, state.activeModal]);

  return useMemo(() => ({
    activeModal: state.activeModal,
    modalData: state.modalData,
    openModal,
    closeModal,
    toggleModal,
    isOpen,
    closeAll,
    showExport,
    showQuality,
    showSceneEditor,
    showMusic,
    showSettings,
    showTimeline,
    setShowExport,
    setShowQuality,
    setShowSceneEditor,
    setShowMusic,
    setShowSettings,
    setShowTimeline,
  }), [
    state,
    openModal,
    closeModal,
    toggleModal,
    isOpen,
    closeAll,
    showExport,
    showQuality,
    showSceneEditor,
    showMusic,
    showSettings,
    showTimeline,
    setShowExport,
    setShowQuality,
    setShowSceneEditor,
    setShowMusic,
    setShowSettings,
    setShowTimeline,
  ]);
}

export default useModalState;
