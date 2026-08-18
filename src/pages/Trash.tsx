import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, RefreshCcw, AlertCircle, Loader2, Image, Folder } from 'lucide-react';
import { rawStoriesApiUrl, getRawStoriesToken } from '../api/rawStoriesBackend';

interface TrashItem {
  key: string;
  filename: string;
  size: number;
  last_modified: string;
  presigned_url: string;
  isFolder: boolean;
}

export default function Trash() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchTrashItems();
  }, []);

  const fetchTrashItems = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        rawStoriesApiUrl('/default/getallimages?prefix=trash/'),
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
          mode: 'cors',
        }
      );
      if (!response.ok) throw new Error('Failed to fetch trash');
      const data = await response.json();
      
      const files = (data.files || []).map((f: any) => ({
        key: f.key,
        filename: f.filename,
        size: f.size,
        last_modified: f.last_modified,
        presigned_url: f.presigned_url,
        isFolder: false,
      }));
      const folders = (data.folders || []).map((f: any) => ({
        key: f.path.replace(/^\//, ''),
        filename: f.name,
        size: 0,
        last_modified: '',
        presigned_url: '',
        isFolder: true,
      }));

      setItems([...folders, ...files]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (key: string) => {
    setSelectedItems(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleRestore = async () => {
    if (selectedItems.length === 0) return;
    setActionLoading(true);
    try {
      const response = await fetch(rawStoriesApiUrl('/default/restoreimage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        body: JSON.stringify({ keys: selectedItems }),
      });
      if (response.ok) {
        setSelectedItems([]);
        fetchTrashItems();
      } else {
        alert('Failed to restore items');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('Are you sure you want to permanently delete ALL items in trash? This cannot be undone.')) return;
    setActionLoading(true);
    try {
      const response = await fetch(rawStoriesApiUrl('/default/emptytrash'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
      });
      if (response.ok) {
        setItems([]);
        setSelectedItems([]);
      } else {
        alert('Failed to empty trash');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Trash</h1>
          <p className="text-slate-400">Items here will be permanently deleted after 30 days.</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleRestore}
            disabled={selectedItems.length === 0 || actionLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold rounded-xl disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
          >
            <RefreshCcw className="w-4 h-4" />
            Restore Selected ({selectedItems.length})
          </button>
          <button
            onClick={handleEmptyTrash}
            disabled={items.length === 0 || actionLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl disabled:opacity-50 transition-all border border-red-500/30"
          >
            <Trash2 className="w-4 h-4" />
            Empty Trash
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 bg-slate-800/20 rounded-3xl border border-slate-700/50">
          <Trash2 className="w-16 h-16 text-slate-600 mb-4" />
          <h2 className="text-xl font-bold text-slate-300">Trash is empty</h2>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.key}
              onClick={() => toggleSelect(item.key)}
              className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer border-2 transition-all ${
                selectedItems.includes(item.key) ? 'border-[#00BCEB] scale-95 shadow-[0_0_20px_rgba(0,188,235,0.4)]' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="absolute inset-0 bg-slate-800 flex items-center justify-center flex-col p-4 text-center">
                {item.isFolder ? (
                  <Folder className="w-12 h-12 text-slate-400 mb-2" />
                ) : item.presigned_url ? (
                  <img src={item.presigned_url} alt={item.filename} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                ) : (
                  <Image className="w-12 h-12 text-slate-400 mb-2" />
                )}
                <span className="relative z-10 text-xs text-white bg-slate-900/80 px-2 py-1 rounded truncate w-full">
                  {item.filename}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
