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

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const shortcuts = [
    { key: "Ctrl/Cmd + O", description: "Open Folder" },
    { key: "Ctrl/Cmd + N", description: "New Window" },
    { key: "Ctrl/Cmd + R", description: "Reload" },
    { key: "Ctrl/Cmd + Shift + I", description: "Toggle Developer Tools" },
    { key: "Ctrl/Cmd + F", description: "Search Files" },
    { key: "Ctrl/Cmd + S", description: "Save File (in editor)" },
    { key: "Esc", description: "Close Dialog / Cancel Operation" },
    { key: "Enter", description: "Confirm / Open Selected" },
    { key: "Arrow Keys", description: "Navigate in Lists" },
  ];

  return (
    <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Keyboard Shortcuts">
      <div className="shortcuts-dialog">
        <div className="shortcuts-list">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="shortcut-item">
              <kbd className="shortcut-key">{shortcut.key}</kbd>
              <span className="shortcut-description">{shortcut.description}</span>
            </div>
          ))}
        </div>
        <p className="shortcuts-note">
          <HelpCircle size={14} />
          Keyboard shortcuts may vary by platform
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
