import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import type { LogEntry } from '../shared/types';

/** ANSI color codes for log levels */
const LEVEL_COLORS: Record<string, string> = {
  info:  '\x1b[36m',   // cyan
  warn:  '\x1b[33m',   // yellow
  error: '\x1b[31m',   // red
  debug: '\x1b[90m',   // gray
};
const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const PURPLE = '\x1b[35m';

function formatLog(log: LogEntry): string {
  const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const lvl = (LEVEL_COLORS[log.level] || '') + log.level.toUpperCase().padEnd(5) + RESET;
  const mod = log.module_id ? `${PURPLE}[${log.module_id}]${RESET} ` : '';
  return `${DIM}${time}${RESET} ${lvl} ${mod}${log.message}`;
}

interface XTerminalProps {
  logs: LogEntry[];
  autoScroll?: boolean;
}

export default function XTerminal({ logs, autoScroll = true }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenCountRef = useRef(0);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#1a1a2e',
        foreground: '#d4d4d8',
        cursor: '#10a37f',
        selectionBackground: '#10a37f40',
        black: '#1a1a2e',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#d4d4d8',
        brightBlack: '#71717a',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#fafafa',
      },
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      lineHeight: 1.5,
      cursorBlink: false,
      cursorStyle: 'bar',
      disableStdin: true,
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    // Delay fit until container is actually visible and has dimensions
    const tryFit = () => {
      try {
        if (containerRef.current && containerRef.current.clientWidth > 0) {
          fitAddon.fit();
        }
      } catch { /* ignore */ }
    };
    requestAnimationFrame(tryFit);
    // Retry after a short delay in case container wasn't measured yet
    setTimeout(tryFit, 200);

    termRef.current = term;
    fitRef.current = fitAddon;
    writtenCountRef.current = 0;

    // Handle resize
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch { /* ignore */ }
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      writtenCountRef.current = 0;
    };
  }, []);

  // Write new logs incrementally
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const start = writtenCountRef.current;
    if (start >= logs.length) return;

    const newLogs = logs.slice(start);
    for (const log of newLogs) {
      term.writeln(formatLog(log));
    }
    writtenCountRef.current = logs.length;

    if (autoScroll) {
      term.scrollToBottom();
    }
  }, [logs, autoScroll]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[300px] rounded-xl overflow-hidden"
      style={{ background: '#1a1a2e' }}
    />
  );
}
