import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore, type ToastType } from '../stores/toastStore';

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-green-500" />,
  error: <XCircle size={16} className="text-red-500" />,
  warning: <AlertTriangle size={16} className="text-yellow-500" />,
  info: <Info size={16} className="text-blue-500" />,
};

const bgMap: Record<ToastType, string> = {
  success: 'border-green-200 dark:border-green-800 bg-white dark:bg-[#1e1e2e]',
  error: 'border-red-200 dark:border-red-800 bg-white dark:bg-[#1e1e2e]',
  warning: 'border-yellow-200 dark:border-yellow-800 bg-white dark:bg-[#1e1e2e]',
  info: 'border-blue-200 dark:border-blue-800 bg-white dark:bg-[#1e1e2e]',
};

function ToastItem({ id, type, message }: { id: string; type: ToastType; message: string }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => removeToast(id), 200);
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg transition-all duration-200 max-w-sm ${bgMap[type]} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <span className="shrink-0 mt-0.5">{iconMap[type]}</span>
      <p className="flex-1 text-sm text-[#0d0d0d] dark:text-[#e5e5e5] leading-relaxed">{message}</p>
      <button
        onClick={handleClose}
        className="shrink-0 p-0.5 rounded hover:bg-[#f4f4f4] dark:hover:bg-[#333] text-[#999] transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} type={t.type} message={t.message} />
      ))}
    </div>
  );
}
