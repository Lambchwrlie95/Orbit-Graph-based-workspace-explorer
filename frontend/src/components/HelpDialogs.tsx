import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { X, HelpCircle, Keyboard, FileText, ExternalLink } from "lucide-react";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function Dialog({ isOpen, onClose, title, children }: DialogProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>{title}</h2>
          <button className="dialog-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

export function AboutDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    // Listen for menu events from Tauri
    const unlisten = listen("menu-about", () => {
      setIsOpen(true);
    });

    // Get app version
    getVersion().then(setVersion).catch(() => {});

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="About Orbit">
      <div className="about-dialog">
        <div className="about-logo">
          <div className="about-logo-mark">O</div>
          <h1>Orbit</h1>
          <p className="about-version">Version {version}</p>
        </div>
        <p className="about-description">
          A graph-first file intelligence IDE that helps you understand files through
          relationships: folders, imports, links, tags, assets, and recent work.
        </p>
        <div className="about-links">
          <a
            href="https://orbit-app.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link"
          >
            <ExternalLink size={14} />
            Website
          </a>
          <a
            href="https://github.com/orbit-app/orbit"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link"
          >
            <FileText size={14} />
            GitHub
          </a>
        </div>
        <p className="about-copyright">
          © 2026 Orbit. All rights reserved.
        </p>
      </div>
    </Dialog>
  );
}

export function KeyboardShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen("menu-keyboard-shortcuts", () => {
      setIsOpen(true);
    });
    const handleOrbitEvent = () => setIsOpen(prev => !prev);
    document.addEventListener("orbit:keyboard-help", handleOrbitEvent);

    return () => {
      unlisten.then((f) => f());
      document.removeEventListener("orbit:keyboard-help", handleOrbitEvent);
    };
  }, []);

  const shortcuts = [
    { section: "Global", items: [
      { key: "Ctrl/Cmd + P", description: "Open command palette" },
      { key: "Ctrl/Cmd + B", description: "Toggle left sidebar" },
      { key: "Ctrl/Cmd + Shift + B", description: "Toggle right sidebar" },
      { key: "Ctrl/Cmd + L", description: "Edit workspace path" },
      { key: "Ctrl/Cmd + 1", description: "Show Explorer" },
      { key: "Ctrl/Cmd + 2", description: "Show Search" },
      { key: "Ctrl/Cmd + 3", description: "Show Assets" },
      { key: "Backspace", description: "Navigate back in graph" },
      { key: "Enter", description: "Open / drill into selection" },
      { key: "Space", description: "Quick-open image in viewer" },
    ]},
    { section: "Graph", items: [
      { key: "Click node", description: "Select and inspect node" },
      { key: "Double-click node", description: "Open in editor" },
      { key: "Right-click node", description: "Context menu (open, copy path, notes)" },
      { key: "Click folder node", description: "Drill into folder graph" },
      { key: "Backspace", description: "Go back to parent folder" },
      { key: "Escape", description: "Deselect / exit PathFinder mode" },
    ]},
    { section: "3D Graph", items: [
      { key: "Left drag", description: "Rotate graph" },
      { key: "Right drag / scroll", description: "Zoom" },
      { key: "Arrow keys", description: "Navigate between nodes" },
    ]},
  ];

  return (
    <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Keyboard Shortcuts">
      <div className="shortcuts-dialog">
        {shortcuts.map((section) => (
          <div key={section.section} className="shortcuts-section">
            <div className="shortcuts-section-title">{section.section}</div>
            {section.items.map((shortcut, i) => (
              <div key={i} className="shortcut-item">
                <kbd className="shortcut-key">{shortcut.key}</kbd>
                <span className="shortcut-description">{shortcut.description}</span>
              </div>
            ))}
          </div>
        ))}
        <p className="shortcuts-note">
          <HelpCircle size={14} />
          Press <kbd>?</kbd> anytime to open this panel
        </p>
      </div>
    </Dialog>
  );
}

export function HelpMenuDialogs() {
  return (
    <>
      <AboutDialog />
      <KeyboardShortcutsDialog />
    </>
  );
}

export default HelpMenuDialogs;
