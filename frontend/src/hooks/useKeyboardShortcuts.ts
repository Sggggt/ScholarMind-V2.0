// ============================================================
// 全局快捷键支持
// ============================================================

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '../stores/taskStore';
import { useToastStore } from '../stores/toastStore';
import { useTheme } from './useTheme';

export function useKeyboardShortcuts() {
  const setCurrentTaskId = useTaskStore((s) => s.setCurrentTaskId);
  const toggleSidebar = useTaskStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Ignore shortcuts when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (isMod && e.key === 'n') {
        // Ctrl/Cmd + N: New task
        e.preventDefault();
        setCurrentTaskId(null);
        navigate('/');
        useToastStore.getState().addToast('info', '新建研究任务', 2000);
      } else if (isMod && e.key === 'b') {
        // Ctrl/Cmd + B: Toggle sidebar
        e.preventDefault();
        toggleSidebar();
      } else if (isMod && e.key === ',') {
        // Ctrl/Cmd + ,: Open settings
        e.preventDefault();
        navigate('/settings');
      } else if (isMod && e.key === 'd') {
        // Ctrl/Cmd + D: Toggle dark mode
        e.preventDefault();
        setTheme(theme === 'dark' ? 'light' : 'dark');
      } else if (e.key === 'Escape' && !isInput) {
        // Escape: Back to dashboard
        setCurrentTaskId(null);
        navigate('/');
      } else if (isMod && e.key === '/') {
        // Ctrl/Cmd + /: Focus search
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
        searchInput?.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setCurrentTaskId, toggleSidebar, navigate, theme, setTheme]);
}
