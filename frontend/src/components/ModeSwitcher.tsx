import React from 'react';
import { Network, FolderTree, ImageIcon, Code, Search } from 'lucide-react';

export type ModeId = 'graph' | 'explorer' | 'assets' | 'code' | 'search';

interface Mode {
  id: ModeId;
  label: string;
  icon: React.ElementType;
}

const MODES: Mode[] = [
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'explorer', label: 'Explorer', icon: FolderTree },
  { id: 'assets', label: 'Assets', icon: ImageIcon },
  { id: 'code', label: 'Code', icon: Code },
  { id: 'search', label: 'Search', icon: Search },
];

interface ModeSwitcherProps {
  currentMode: ModeId;
  onModeChange: (mode: ModeId) => void;
  className?: string;
}

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({
  currentMode,
  onModeChange,
  className = '',
}) => {
  return (
    <nav className={`mode-switcher ${className}`}>
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={`mode-button ${currentMode === id ? 'active' : ''}`}
          onClick={() => onModeChange(id)}
          title={label}
          aria-label={`Switch to ${label} mode`}
          aria-pressed={currentMode === id}
        >
          <Icon className="mode-icon" size={16} />
          <span className="mode-label">{label}</span>
        </button>
      ))}
    </nav>
  );
};

export default ModeSwitcher;
