import React, { useState, useEffect, useCallback } from 'react';
import {
  Heart, Folder, Download, Eye, Grid3X3, List, RefreshCw, X,
  Check, AlertCircle, ChevronLeft, ChevronRight, Share2, Sparkles
} from 'lucide-react';
import { rawStoriesApiUrl, getThumbnailUrl } from '../api/rawStoriesBackend';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface FavItem {
  id: string;
  key: string;
  filename: string;
  imageUrl: string;
  folderPath: string;
  folderName: string;
  isVideo?: boolean;
}

interface FolderGroup {
  folderPath: string;
  folderName: string;
  items: FavItem[];
}

export default function Favorites() {
  const [folderGroups, setFolderGroups] = useState<FolderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = all folders summary

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloadingZip, setDownloadingZip] = useState<string | null>(null); // folderPath being downloaded
  const [notifications, setNotifications] = useState<{ id: string; msg: string; type: string }[]>([]);

  const notify = (msg: string, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setNotifications((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 4000);
  };

  const fetchAllFavorites = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch shares to collect share favorites
      const sharesRes = await fetch(rawStoriesApiUrl('/default/listshares')).catch(() => null);
      const sharesData = sharesRes ? await sharesRes.json().catch(() => null) : null;

      const shareFavKeys = new Set<string>();
      if (sharesData?.success && Array.isArray(sharesData.shares)) {
        sharesData.shares.forEach((share: any) => {
          if (Array.isArray(share.favorites)) {
            share.favorites.forEach((k: string) => shareFavKeys.add(k));
          }
        });
      }

      // 2. Fetch all images with metadata from getallimages
      const imagesRes = await fetch(rawStoriesApiUrl('/default/getallimages?prefix=&recursive=true'));
      const imagesData = await imagesRes.json().catch(() => null);

      if (!imagesRes.ok || !imagesData?.success) {
        throw new Error(imagesData?.message || 'Failed to load gallery items');
      }

      const allFiles = imagesData.files || [];
      const favItemsMap = new Map<string, FavItem>();

      allFiles.forEach((file: any) => {
        const key = file.key || '';
        const isFav = file.isFavorite || shareFavKeys.has(key);
        if (isFav) {
          const parts = key.split('/');
          const filename = parts.pop() || key;
          const folderPath = parts.join('/') || 'root';
          const folderName = parts.length > 0 ? parts[parts.length - 1] : 'Main Gallery';

          favItemsMap.set(key, {
            id: key,
            key,
            filename,
            imageUrl: file.presigned_url || file.url || `${rawStoriesApiUrl('')}/uploads/${key}`,
            folderPath,
            folderName: folderName.replace(/_/g, ' ').replace(/-/g, ' '),
            isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(key),
          });
        }
      });

      // Group by folderPath
      const groupsMap = new Map<string, FolderGroup>();
      favItemsMap.forEach((item) => {
        if (!groupsMap.has(item.folderPath)) {
          groupsMap.set(item.folderPath, {
            folderPath: item.folderPath,
            folderName: item.folderName,
            items: [],
          });
        }
        groupsMap.get(item.folderPath)!.items.push(item);
      });

      const resultGroups = Array.from(groupsMap.values());
      setFolderGroups(resultGroups);
    } catch (err: any) {
      setError(err.message || 'Failed to load favorite photos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllFavorites();
  }, [fetchAllFavorites]);

  // ZIP download for specific folder's favorites
  const handleDownloadFolderZip = async (group: FolderGroup) => {
    if (group.items.length === 0) return;
    setDownloadingZip(group.folderPath);
    notify(`Preparing ZIP for ${group.folderName} (${group.items.length} photos)...`, 'info');

    try {
      const zip = new JSZip();
      let count = 0;

      for (const item of group.items) {
        try {
          const downloadUrl = rawStoriesApiUrl(`/default/downloadimage?key=${encodeURIComponent(item.key)}`);
          const res = await fetch(downloadUrl);
          const data = await res.json();

          if (data?.success && data?.url) {
            const mediaRes = await fetch(data.url);
            if (mediaRes.ok) {
              const blob = await mediaRes.blob();
              zip.file(item.filename, blob);
              count++;
            }
          }
        } catch (err) {
          console.error('Download item failed:', item.key, err);
        }
      }

      if (count === 0) throw new Error('Could not fetch photo files for ZIP');

      notify('Creating ZIP archive...', 'info');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const safeName = group.folderName.replace(/[\\/:*?"<>|\s]+/g, '_');
      saveAs(zipBlob, `favorites_${safeName}.zip`);
      notify(`Successfully downloaded ${count} favorite photo(s) for ${group.folderName}!`, 'success');
    } catch (err: any) {
      notify(`ZIP Export failed: ${err.message}`, 'error');
    } finally {
      setDownloadingZip(null);
    }
  };

  const activeGroup = folderGroups.find((g) => g.folderPath === selectedFolder);
  const activeItems = activeGroup ? activeGroup.items : folderGroups.flatMap((g) => g.items);

  return (
    <div className="min-h-screen text-slate-100 p-4 sm:p-8" style={{ background: '#0b0f19', fontFamily: "'Inter', sans-serif" }}>
      {/* Notifications */}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {notifications.map((n) => (
          <div key={n.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold shadow-2xl backdrop-blur-xl border ${n.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/50' : n.type === 'error' ? 'bg-red-950/90 border-red-500/40 text-red-200 shadow-red-950/50' : 'bg-slate-900/90 border-slate-700 text-white'}`}>
            <span>{n.msg}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-400">
            <Heart className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Client Favorites Gallery</h1>
            <p className="text-slate-400 text-xs sm:text-sm">Client favorited photos organized separately by folder</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={fetchAllFavorites} className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-all">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-slate-900/60 border border-slate-800 rounded-3xl">
            <div className="w-12 h-12 border-3 border-slate-700 border-t-rose-400 rounded-full animate-spin" />
            <p className="text-rose-400 text-xs font-semibold tracking-widest uppercase">Loading favorites grouped by folder...</p>
          </div>
        ) : error ? (
          <div className="bg-slate-900/60 border border-red-500/30 rounded-3xl p-10 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 font-bold text-base mb-1">{error}</p>
            <button onClick={fetchAllFavorites} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold">Try Again</button>
          </div>
        ) : folderGroups.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-16 text-center">
            <Heart className="h-14 w-14 text-slate-700 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No Favorite Photos Found</h3>
            <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto">When clients select their favorite photos in shared galleries, they will appear here organized separately by folder.</p>
          </div>
        ) : (
          <>
            {/* Folder Selection Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button onClick={() => setSelectedFolder(null)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${selectedFolder === null ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20' : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'}`}>
                All Folders ({folderGroups.reduce((s, g) => s + g.items.length, 0)})
              </button>
              {folderGroups.map((group) => (
                <button key={group.folderPath} onClick={() => setSelectedFolder(group.folderPath)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${selectedFolder === group.folderPath ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20' : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'}`}>
                  <Folder className="h-3.5 w-3.5 text-amber-400" />
                  <span>{group.folderName}</span>
                  <span className="bg-slate-950/60 px-2 py-0.5 rounded-full text-[10px] font-extrabold text-rose-300">{group.items.length}</span>
                </button>
              ))}
            </div>

            {/* Folder Groups Listing */}
            <div className="space-y-10">
              {(selectedFolder ? folderGroups.filter((g) => g.folderPath === selectedFolder) : folderGroups).map((group) => (
                <div key={group.folderPath} className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
                  {/* Folder Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
                        <Folder className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-extrabold text-white capitalize">{group.folderName}</h2>
                        <p className="text-xs text-slate-400">{group.items.length} Favorite Photos in this Folder</p>
                      </div>
                    </div>

                    <button onClick={() => handleDownloadFolderZip(group)} disabled={downloadingZip === group.folderPath} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs transition-all border border-slate-700 disabled:opacity-50 shadow-md">
                      {downloadingZip === group.folderPath ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Download className="h-4 w-4 text-cyan-400" />}
                      <span>Download Folder ZIP</span>
                    </button>
                  </div>

                  {/* Photo Grid for this folder */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {group.items.map((item, idx) => {
                      const globalIdx = activeItems.findIndex((x) => x.id === item.id);
                      return (
                        <div key={item.id} onClick={() => setLightboxIndex(globalIdx)} className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 hover:border-rose-400 transition-all cursor-pointer shadow-md hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/10">
                          <img src={getThumbnailUrl(item.key, 400)} alt={item.filename} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />

                          <div className="absolute top-2 right-2 w-7 h-7 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-lg">
                            <Heart className="h-4 w-4 fill-current" />
                          </div>

                          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent text-[11px] font-semibold text-slate-200 truncate">
                            {item.filename}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && activeItems[lightboxIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4">
          <button onClick={() => setLightboxIndex(null)} className="absolute top-5 right-5 p-3 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white transition-all z-20">
            <X className="h-6 w-6" />
          </button>

          {lightboxIndex > 0 && (
            <button onClick={() => setLightboxIndex((p) => p! - 1)} className="absolute left-5 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-slate-900 border border-slate-700 text-white transition-all z-20">
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {lightboxIndex < activeItems.length - 1 && (
            <button onClick={() => setLightboxIndex((p) => p! + 1)} className="absolute right-5 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-slate-900 border border-slate-700 text-white transition-all z-20">
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-4">
            <img src={activeItems[lightboxIndex].imageUrl} alt={activeItems[lightboxIndex].filename} className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl" />
            <div className="text-center">
              <p className="text-sm font-extrabold text-white">{activeItems[lightboxIndex].filename}</p>
              <p className="text-xs text-rose-400 font-medium">{activeItems[lightboxIndex].folderName}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
