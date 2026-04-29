import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Editor state management using Zustand
 * 
 * Tracks open files, active file, modified state, and file contents.
 * Uses persist middleware to restore open files on app restart.
 */

export interface EditorState {
  // State
  openFiles: string[];
  activeFile: string | null;
  modifiedFiles: Set<string>;
  fileContents: Map<string, string>;

  // Actions
  openFile: (path: string, content: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  markModified: (path: string) => void;
  markSaved: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  getContent: (path: string) => string | undefined;
  isModified: (path: string) => boolean;
  reorderFiles: (files: string[]) => void;
  closeAllFiles: () => void;
  closeOtherFiles: (keepPath: string) => void;
}

// Custom storage serializer for Set and Map
interface PersistedState {
  openFiles: string[];
  activeFile: string | null;
  modifiedFiles: string[];
  fileContents: Array<[string, string]>;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      // Initial state
      openFiles: [],
      activeFile: null,
      modifiedFiles: new Set(),
      fileContents: new Map(),

      // Open a file and set it as active
      openFile: (path: string, content: string) => {
        set((state) => {
          const newOpenFiles = state.openFiles.includes(path)
            ? state.openFiles
            : [...state.openFiles, path];
          
          const newFileContents = new Map(state.fileContents);
          newFileContents.set(path, content);

          return {
            openFiles: newOpenFiles,
            activeFile: path,
            fileContents: newFileContents,
          };
        });
      },

      // Close a file and clean up state
      closeFile: (path: string) => {
        set((state) => {
          const newOpenFiles = state.openFiles.filter((f) => f !== path);
          const newModifiedFiles = new Set(state.modifiedFiles);
          newModifiedFiles.delete(path);
          
          const newFileContents = new Map(state.fileContents);
          newFileContents.delete(path);

          // Update active file if we closed the active one
          let newActiveFile = state.activeFile;
          if (state.activeFile === path) {
            const closedIndex = state.openFiles.indexOf(path);
            if (newOpenFiles.length > 0) {
              // Try to select the file to the left, otherwise the first file
              newActiveFile = newOpenFiles[Math.min(closedIndex, newOpenFiles.length - 1)];
            } else {
              newActiveFile = null;
            }
          }

          return {
            openFiles: newOpenFiles,
            activeFile: newActiveFile,
            modifiedFiles: newModifiedFiles,
            fileContents: newFileContents,
          };
        });
      },

      // Set the active file
      setActiveFile: (path: string) => {
        set({ activeFile: path });
      },

      // Mark a file as having unsaved changes
      markModified: (path: string) => {
        set((state) => {
          const newModifiedFiles = new Set(state.modifiedFiles);
          newModifiedFiles.add(path);
          return { modifiedFiles: newModifiedFiles };
        });
      },

      // Mark a file as saved (clear modified state)
      markSaved: (path: string) => {
        set((state) => {
          const newModifiedFiles = new Set(state.modifiedFiles);
          newModifiedFiles.delete(path);
          return { modifiedFiles: newModifiedFiles };
        });
      },

      // Update file content and mark as modified
      updateContent: (path: string, content: string) => {
        set((state) => {
          const newFileContents = new Map(state.fileContents);
          newFileContents.set(path, content);
          
          const newModifiedFiles = new Set(state.modifiedFiles);
          newModifiedFiles.add(path);

          return {
            fileContents: newFileContents,
            modifiedFiles: newModifiedFiles,
          };
        });
      },

      // Get content for a file
      getContent: (path: string) => {
        return get().fileContents.get(path);
      },

      // Check if a file has unsaved changes
      isModified: (path: string) => {
        return get().modifiedFiles.has(path);
      },

      // Reorder open files (for drag-and-drop)
      reorderFiles: (files: string[]) => {
        set({ openFiles: files });
      },

      // Close all files
      closeAllFiles: () => {
        set({
          openFiles: [],
          activeFile: null,
          modifiedFiles: new Set(),
          fileContents: new Map(),
        });
      },

      // Close all files except the specified one
      closeOtherFiles: (keepPath: string) => {
        set((state) => {
          const content = state.fileContents.get(keepPath);
          const isModified = state.modifiedFiles.has(keepPath);
          
          const newFileContents = new Map<string, string>();
          if (content !== undefined) {
            newFileContents.set(keepPath, content);
          }

          const newModifiedFiles = new Set<string>();
          if (isModified) {
            newModifiedFiles.add(keepPath);
          }

          return {
            openFiles: [keepPath],
            activeFile: keepPath,
            modifiedFiles: newModifiedFiles,
            fileContents: newFileContents,
          };
        });
      },
    }),
    {
      name: 'orbit-editor-storage',
      // Only persist open files list, not content or modified state
      partialize: (state): PersistedState => ({
        openFiles: state.openFiles,
        activeFile: state.activeFile,
        modifiedFiles: Array.from(state.modifiedFiles),
        fileContents: Array.from(state.fileContents.entries()),
      }),
      // Deserialize Sets and Maps on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert arrays back to Set and Map
          const persistedState = state as unknown as PersistedState;
          return {
            ...state,
            modifiedFiles: new Set(persistedState.modifiedFiles || []),
            fileContents: new Map(persistedState.fileContents || []),
          } as EditorState;
        }
      },
    }
  )
);

export default useEditorStore;
