import React from 'react';
import { Network, FolderTree, ImageIcon, Search } from 'lucide-react';
import { Mode as ModeId } from '../types';

interface ModeDefinition {
  id: ModeId;
  label: string;
  icon: React.ElementType;
}

const MODES: ModeDefinition[] = [
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'explorer', label: 'Explorer', icon: FolderTree },
  { id: 'assets', label: 'Assets', icon: ImageIcon },
  { id: 'search', label: 'Search', icon: Search },
];

type ModeSwitcherVariant = 'default' | 'toolbar';

interface ModeSwitcherProps {
  currentMode: ModeId;
  onModeChange: (mode: ModeId) => void;
  modes?: ModeId[];
  className?: string;
  /** Icon-only horizontal strip (graph-file-manager–style workbench) */
  variant?: ModeSwitcherVariant;
  /** Rendered first inside the toolbar nav (e.g. workspace folder) */
  toolbarLeading?: React.ReactNode;
}

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({
  currentMode,
  onModeChange,
  modes,
  className = '',
  variant = 'default',
  toolbarLeading,
}) => {
  const visibleModes = modes ? MODES.filter((mode) => modes.includes(mode.id)) : MODES;
  const isToolbar = variant === 'toolbar';

  return (
    <nav
      className={`mode-switcher ${isToolbar ? 'mode-switcher--toolbar' : ''} ${className}`.trim()}
      aria-label={toolbarLeading ? 'Workspace and view modes' : 'Workspace modes'}
    >
      {isToolbar && toolbarLeading}
      {visibleModes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`mode-button ${currentMode === id ? 'active' : ''}`}
          onClick={() => onModeChange(id)}
          title={label}
          aria-label={`Switch to ${label} mode`}
          aria-pressed={currentMode === id}
        >
          <Icon className="mode-icon" size={isToolbar ? 14 : 16} strokeWidth={isToolbar ? 1.75 : 2} />
          {!isToolbar && <span className="mode-label">{label}</span>}
        </button>
      ))}
    </nav>
  );
};

export default ModeSwitcher;
