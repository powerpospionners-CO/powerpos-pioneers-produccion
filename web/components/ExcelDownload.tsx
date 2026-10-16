'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import api from '@/lib/api';

export default function ExcelDownload({ url, filename, params, disabled = false }: {
  url: string; filename: string; params?: Record<string, string | number>; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.get(url, { params, responseType: 'blob' });
      const objectUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError('No se pudo descargar el Excel. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }
  return <div>
    <button type="button" disabled={disabled || busy} onClick={download}
      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
      <Download size={16} />{busy ? 'Preparando Excel…' : 'Descargar Excel'}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
  </div>;
}
