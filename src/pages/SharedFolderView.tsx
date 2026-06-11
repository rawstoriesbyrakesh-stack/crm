import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Grid3X3, List, Download, Eye, X, Loader2,
  AlertCircle, Lock, Check, ChevronLeft, ChevronRight,
  Image, Play, ZoomIn, Camera, MessageSquare, Send, RotateCw, GripHorizontal,
  Heart, MessageCircle
} from 'lucide-react';
import { rawStoriesApiUrl } from '../api/rawStoriesBackend';

const SHARE_API = rawStoriesApiUrl('/default/SharedLinkAccess');

interface Item { id: string; title: string; imageUrl: string; presigned_url?: string; isVideo?: boolean; allowDownload?: boolean; comments?: {text: string, author: string, createdAt: string}[]; }

function notify(setFn: React.Dispatch<React.SetStateAction<{id:string;msg:string;type:string}[]>>, msg: string, type = 'info') {
  const id = `${Date.now()}-${Math.random()}`;
  setFn(p => [...p, { id, msg, type }]);
  setTimeout(() => setFn(p => p.filter(n => n.id !== id)), 4500);
}

export default function SharedFolderView() {
  const { folderPath } = useParams<{ folderPath: string }>();
  const [searchParams] = useSearchParams();
  const shareId = searchParams.get('sid');
  const navigate = useNavigate();

  // State
  const [phase, setPhase] = useState<'checking'|'pin'|'denied'|'gallery'>('checking');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [lightbox, setLightbox] = useState<number|null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<{id:string;msg:string;type:string}[]>([]);
  const [allowDownload, setAllowDownload] = useState(true);
  const [denyReason, setDenyReason] = useState('');
  const [isPinProtected, setIsPinProtected] = useState(false);
  const [sharedItemsList, setSharedItemsList] = useState<string[]>([]);
  const [branding, setBranding] = useState<{ logoUrl?: string; brandColor?: string; client?: string } | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [lightboxRotation, setLightboxRotation] = useState(0);
  const lightboxGestureRef = useRef<{ startX: number; startY: number; active: boolean } | null>(null);

  // Client Favorites Proofing States & Functions
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isSubmittingFavs, setIsSubmittingFavs] = useState(false);
  const [showFavoritesSubmittedModal, setShowFavoritesSubmittedModal] = useState(false);

  const toggleFavorite = (id: string) => {
    setFavorites(p => {
      const n = new Set(p);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  };

  const submitFavorites = async () => {
    if (!shareId) return;
    setIsSubmittingFavs(true);
    try {
      const res = await fetch(SHARE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_favorites',
          sharedId: shareId,
          favorites: Array.from(favorites)
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowFavoritesSubmittedModal(true);
        notify(setNotifications, 'Favorites submitted successfully!', 'success');
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      notify(setNotifications, err.message || 'Failed to submit favorites', 'error');
    } finally {
      setIsSubmittingFavs(false);
    }
  };

  const decoded = folderPath ? decodeURIComponent(folderPath) : '';

  const filteredItems = items.filter(item => {
    if (showFavoritesOnly) return favorites.has(item.id);
    return true;
  });

  // ── Check access on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!shareId) { setPhase('gallery'); return; }
    (async () => {
      try {
        const res = await fetch(SHARE_API, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_share_link_status', sharedId: shareId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) { setDenyReason(data?.message || 'This link is invalid or has been revoked.'); setPhase('denied'); return; }
        const link = data.shareLink;
        if (!link?.isActive) { setDenyReason('This share link has been revoked or expired.'); setPhase('denied'); return; }
        
        // Save the specific items that were shared
        if (link.items && link.items.length > 0) {
          setSharedItemsList(link.items);
        }
        
        if (data.branding) setBranding(data.branding);

        if (data.favorites && Array.isArray(data.favorites)) {
          setFavorites(new Set(data.favorites));
        }

        if (link?.allowDownload === false) {
          setAllowDownload(false);
        }
        
        if (link?.isPinProtected || data.isPinProtected) { setIsPinProtected(true); setPhase('pin'); }
        else { setPhase('gallery'); }
      } catch {
        setDenyReason('Unable to verify access. Please try again.');
        setPhase('denied');
      }
    })();
  }, [shareId]);

  // ── Fetch images ─────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let prefix = decoded;
      if (prefix.startsWith('/')) prefix = prefix.slice(1);
      if (!prefix.endsWith('/')) prefix += '/';
      const res = await fetch(rawStoriesApiUrl(`/default/getallimages?prefix=${encodeURIComponent(prefix)}&recursive=true`));
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to load');
      
      let mapped: Item[] = (data.files || []).map((f: any) => ({
        id: f.key, title: (f.filename || f.key.split('/').pop() || '').replace(/\.[^.]+$/, ''),
        imageUrl: f.presigned_url || `${rawStoriesApiUrl('')}/uploads/${f.key}`,
        isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(f.key),
        allowDownload: true,
        comments: f.comments || [],
      }));
      
      // If the share link was created for specific items, filter the gallery to ONLY show those items
      if (sharedItemsList && sharedItemsList.length > 0) {
        // If shared items include a folder, we don't strictly filter out its contents
        const hasFolderShare = sharedItemsList.some(item => item.endsWith('/'));
        if (!hasFolderShare) {
          mapped = mapped.filter(item => sharedItemsList.includes(item.id));
        }
      }
      
      setItems(mapped);
    } catch (e: any) {
      setError(e.message || 'Failed to load shared items');
    }
    finally { setLoading(false); }
  }, [decoded, sharedItemsList]);

  useEffect(() => { if (phase === 'gallery') fetchItems(); }, [phase, fetchItems]);

  // ── Verify PIN ───────────────────────────────────────────────────────────
  const verifyPin = async () => {
    if (!pin.trim()) { setPinError('Please enter the PIN.'); return; }
    setPinLoading(true); setPinError('');
    try {
      const res = await fetch(SHARE_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_pin', sharedId: shareId, pin }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) { setPinError(data?.message || 'Incorrect PIN. Try again.'); setPin(''); }
      else { 
        if (data.branding) setBranding(data.branding);
        if (data.favorites && Array.isArray(data.favorites)) {
          setFavorites(new Set(data.favorites));
        }
        const link = data.shareLink;
        if (link?.items && link.items.length > 0) {
          setSharedItemsList(link.items);
        }
        if (link?.allowDownload === false) {
          setAllowDownload(false);
        }
        setPhase('gallery'); 
      }
    } catch { setPinError('Verification failed. Please try again.'); }
    finally { setPinLoading(false); }
  };

  // ── Download ─────────────────────────────────────────────────────────────
  const downloadItem = async (item: Item) => {
    try {
      const a = document.createElement('a');
      a.href = item.imageUrl; a.download = item.title; a.target = '_blank';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      notify(setNotifications, `Downloaded ${item.title}`, 'success');
    } catch { notify(setNotifications, 'Download failed', 'error'); }
  };

  const downloadSelected = () => {
    const toDown = items.filter(i => selected.has(i.id));
    if (!toDown.length) { notify(setNotifications, 'Select items first', 'info'); return; }
    toDown.forEach(downloadItem);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) =>
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleNextImage = () => {
    if (lightbox !== null && lightbox < filteredItems.length - 1) {
      setLightbox(lightbox + 1);
    }
  };

  const handlePrevImage = () => {
    if (lightbox !== null && lightbox > 0) {
      setLightbox(lightbox - 1);
    }
  };

  const handleRotateCurrentImage = () => {
    if (lightbox === null) return;
    const item = filteredItems[lightbox];
    if (!item || item.isVideo) return;
    setLightboxRotation(rotation => (rotation + 90) % 360);
  };

  const handleLightboxPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lightboxGestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      active: true,
    };
  };

  const handleLightboxPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = lightboxGestureRef.current;
    lightboxGestureRef.current = null;
    if (!gesture?.active) return;

    const deltaX = e.clientX - gesture.startX;
    const deltaY = e.clientY - gesture.startY;
    const swipeThreshold = 60;

    if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    if (deltaX < 0) {
      handleNextImage();
    } else {
      handlePrevImage();
    }
  };

  // ── Add Comment ──────────────────────────────────────────────────────────
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lightbox === null || !newComment.trim()) return;
    const item = filteredItems[lightbox];
    const author = authorName.trim() || 'Guest';
    try {
      const res = await fetch(rawStoriesApiUrl('/default/addcomment'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.id, text: newComment, author })
      });
      const data = await res.json();
      if (data.success) {
        setItems(prev => prev.map((it) => it.id === item.id ? { ...it, comments: [...(it.comments||[]), { text: newComment, author, createdAt: new Date().toISOString() }] } : it));
        setNewComment('');
        notify(setNotifications, 'Comment added', 'success');
      } else { throw new Error(data.message); }
    } catch (err: any) { notify(setNotifications, err.message || 'Failed to add comment', 'error'); }
  };

  // ── Lightbox keys ────────────────────────────────────────────────────────
  useEffect(() => {
    if (lightbox === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setLightbox(p => p !== null && p < filteredItems.length - 1 ? p + 1 : p);
      if (e.key === 'ArrowLeft')  setLightbox(p => p !== null && p > 0 ? p - 1 : p);
      if (e.key === 'Escape')     setLightbox(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox, filteredItems.length]);

  useEffect(() => {
    setLightboxRotation(0);
    lightboxGestureRef.current = null;
  }, [lightbox]);

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER: Checking
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'checking') return (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900 flex items-center justify-center">
      <div className="text-center text-white">
        <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-amber-400" />
        <p className="text-stone-300">Verifying access…</p>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER: Denied
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'denied') return (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="h-10 w-10 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Access Denied</h2>
        <p className="text-stone-300 mb-8 leading-relaxed">{denyReason}</p>
        {/* 'Go Home' button removed per request */}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER: PIN Entry
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'pin') return (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-10 max-w-sm w-full shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <Lock className="h-10 w-10 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Protected Gallery</h2>
          <p className="text-stone-400 text-sm">Enter the PIN provided by the photographer</p>
        </div>
        <div className="mb-5">
          <input
            type="text" value={pin} maxLength={8} autoFocus
            onChange={e => { setPin(e.target.value); setPinError(''); }}
            onKeyDown={e => e.key === 'Enter' && verifyPin()}
            placeholder="Enter PIN"
            className="w-full bg-white/10 border border-white/20 text-white placeholder-stone-500 rounded-xl px-5 py-4 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 transition"
          />
          {pinError && (
            <p className="mt-3 text-red-400 text-sm text-center flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4" />{pinError}
            </p>
          )}
        </div>
        <button
          onClick={verifyPin} disabled={pinLoading || !pin.trim()}
          className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 disabled:text-stone-500 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
        >
          {pinLoading ? <><Loader2 className="h-5 w-5 animate-spin" />Verifying…</> : <>
            <Check className="h-5 w-5" />Access Gallery
          </>}
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER: Gallery
  // ─────────────────────────────────────────────────────────────────────────
  const defaultTitle = decoded.split('/').filter(Boolean).pop() || 'Shared Gallery';
  const galleryTitle = branding?.client ? `${branding.client} Gallery` : defaultTitle;
  const brandColor = branding?.brandColor || '#d97706'; // default amber-600

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950">
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(n => (
          <div key={n.id} className={`px-4 py-3 rounded-xl shadow-xl text-white text-sm flex items-center gap-3 max-w-xs animate-fade-in ${
            n.type==='success'?'bg-emerald-600':n.type==='error'?'bg-red-600':'bg-stone-700'}`}>
            <span className="flex-1">{n.msg}</span>
            <button onClick={() => setNotifications(p=>p.filter(x=>x.id!==n.id))}><X className="h-4 w-4"/></button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-stone-950/80 backdrop-blur-lg border-b border-white/10" style={{ borderBottomColor: `${brandColor}40` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {branding?.logoUrl ? (
                <img src={branding.logoUrl} alt="Client Logo" className="h-8 object-contain flex-shrink-0" />
              ) : (
                <Camera className="h-5 w-5 flex-shrink-0" style={{ color: brandColor }} />
              )}
              <h1 className="text-white font-semibold text-lg truncate capitalize">{galleryTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {favorites.size > 0 && (
              <button 
                onClick={submitFavorites} 
                disabled={isSubmittingFavs}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all shadow-md shrink-0"
              >
                {isSubmittingFavs ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Heart className="h-4 w-4 fill-current" />
                )}
                Submit Favorites ({favorites.size})
              </button>
            )}
            {selected.size > 0 && (
              <button onClick={downloadSelected} className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium transition-all" style={{ backgroundColor: brandColor }}>
                <Download className="h-4 w-4" />{selected.size} selected
              </button>
            )}
            <div className="flex items-center bg-white/10 rounded-lg p-1 gap-1">
              <button 
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)} 
                className={`p-1.5 rounded-md transition-all flex items-center gap-1 text-xs ${showFavoritesOnly ? 'bg-red-600 text-white font-semibold' : 'text-stone-400 hover:text-white'}`}
                title="Filter by Favorites"
              >
                <Heart className={`h-3.5 w-3.5 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">Favorites Only</span>
              </button>
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode==='grid'?'text-white':'text-stone-400 hover:text-white'}`} style={viewMode==='grid'?{backgroundColor: brandColor}:{}}>
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode==='list'?'text-white':'text-stone-400 hover:text-white'}`} style={viewMode==='list'?{backgroundColor: brandColor}:{}}>
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-stone-400">
            <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
            <p>Loading gallery…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 text-red-400">
            <AlertCircle className="h-10 w-10 mb-4" />
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-stone-500">
            <Image className="h-16 w-16 mb-4 opacity-30" />
            <h3 className="text-xl font-semibold text-stone-300 mb-1">No images found</h3>
            <p className="text-sm">This gallery is empty.</p>
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-stone-400 text-sm">{items.length} item{items.length!==1?'s':''}</p>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-sm text-stone-400 hover:text-white transition-colors">
                  Clear selection
                </button>
              )}
            </div>

            {/* Grid */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredItems.map((item, idx) => {
                  const isSelected = selected.has(item.id);
                  const isFavorite = favorites.has(item.id);
                  return (
                    <div key={item.id} className={`group relative bg-stone-800 rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-200 ${isSelected ? 'border-amber-500 shadow-lg shadow-amber-500/20' : 'border-transparent hover:border-white/20'}`}>
                      {/* Checkbox */}
                      <button onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
                        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-amber-500 border-amber-500' : 'bg-black/50 border-white/40 opacity-0 group-hover:opacity-100'}`}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                      </button>
                      {/* Heart (Favorite) button */}
                      <button onClick={e => { e.stopPropagation(); toggleFavorite(item.id); }}
                        className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-md flex items-center justify-center transition-all bg-black/50 border-0 ${isFavorite ? 'text-red-500' : 'text-white/60 opacity-0 group-hover:opacity-100 hover:text-white'}`}>
                        <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current text-red-500' : ''}`} />
                      </button>
                      {/* Thumbnail */}
                      <div className="aspect-square" onClick={() => setLightbox(idx)}>
                        {item.isVideo ? (
                          <div className="w-full h-full bg-stone-700 flex items-center justify-center">
                            <Play className="h-8 w-8 text-white/60" />
                          </div>
                        ) : (
                          <img src={item.imageUrl} alt={item.title} loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={e => { (e.target as HTMLImageElement).src = 'https://picsum.photos/400/400?grayscale'; }} />
                        )}
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <button className="p-2 bg-white/20 backdrop-blur rounded-full text-white hover:bg-white/30 transition-all" onClick={e => { e.stopPropagation(); setLightbox(idx); }}>
                            <ZoomIn className="h-4 w-4" />
                          </button>
                          <button className="p-2 bg-white/20 backdrop-blur rounded-full text-white hover:bg-white/30 transition-all" onClick={e => { e.stopPropagation(); downloadItem(item); }}>
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {/* Title */}
                      <div className="px-2 py-2">
                        <p className="text-xs text-stone-300 truncate">{item.title}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* List view */
              <div className="space-y-2">
                {filteredItems.map((item, idx) => {
                  const isSelected = selected.has(item.id);
                  return (
                    <div key={item.id} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${isSelected ? 'bg-amber-500/10 border-amber-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} className="accent-amber-500 w-4 h-4 flex-shrink-0" />
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-stone-700 cursor-pointer" onClick={() => setLightbox(idx)}>
                        {item.isVideo ? <div className="w-full h-full flex items-center justify-center"><Play className="h-5 w-5 text-white/60"/></div>
                          : <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src='https://picsum.photos/50/50?grayscale'; }} />}
                      </div>
                      <span className="flex-1 text-stone-200 text-sm truncate">{item.title}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={e => { e.stopPropagation(); toggleFavorite(item.id); }} className={`p-2 rounded-lg transition-all ${favorites.has(item.id) ? 'text-red-500' : 'text-stone-400 hover:text-white hover:bg-white/10'}`}>
                          <Heart className={`h-4 w-4 ${favorites.has(item.id) ? 'fill-current text-red-500' : ''}`} />
                        </button>
                        <button onClick={() => setLightbox(idx)} className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => downloadItem(item)} className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"><Download className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Lightbox */}
      {lightbox !== null && filteredItems[lightbox] && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button onClick={e => { e.stopPropagation(); setLightbox(null); }} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 rounded-full transition-all z-10">
            <X className="h-6 w-6" />
          </button>
          {lightbox > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(p => p! - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white bg-white/10 rounded-full transition-all z-10">
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {lightbox < filteredItems.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(p => p! + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white bg-white/10 rounded-full transition-all z-10">
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
          <div
            className="max-w-5xl max-h-[90vh] w-full mx-16"
            onClick={e => e.stopPropagation()}
            onPointerDown={handleLightboxPointerDown}
            onPointerUp={handleLightboxPointerUp}
            onPointerCancel={() => { lightboxGestureRef.current = null; }}
            onPointerLeave={() => { lightboxGestureRef.current = null; }}
            style={{ touchAction: 'none' }}
          >
            <div className="mb-4 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-stone-200 shadow-lg backdrop-blur-md">
                <GripHorizontal className="h-4 w-4 text-amber-300" />
                Swipe left or right to change photos
              </div>
            </div>
            {filteredItems[lightbox].isVideo ? (
              <video src={filteredItems[lightbox].imageUrl} controls className="max-h-[70vh] max-w-full mx-auto rounded-lg" />
            ) : (
              <img
                src={filteredItems[lightbox].imageUrl}
                alt={filteredItems[lightbox].title}
                className="max-h-[70vh] max-w-full mx-auto object-contain rounded-lg shadow-2xl"
                style={{ transform: `rotate(${lightboxRotation}deg)`, transition: 'transform 180ms ease-out' }}
              />
            )}
            <div className="text-center mt-3 flex items-center justify-center gap-4 flex-wrap">
              <p className="text-stone-400 text-sm">{filteredItems[lightbox].title}</p>
              <button onClick={() => toggleFavorite(filteredItems[lightbox].id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${favorites.has(filteredItems[lightbox].id) ? 'bg-red-600 text-white shadow-md' : 'bg-white/10 text-stone-300 hover:bg-white/20'}`}>
                <Heart className={`h-4 w-4 ${favorites.has(filteredItems[lightbox].id) ? 'fill-current' : ''}`} />
                {favorites.has(filteredItems[lightbox].id) ? 'Favorited' : 'Favorite'}
              </button>
              <button onClick={() => setShowComments(!showComments)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${showComments ? 'bg-amber-600 text-white' : 'bg-white/10 text-stone-300 hover:bg-white/20'}`}>
                <MessageSquare className="h-4 w-4" />{(filteredItems[lightbox].comments||[]).length} Comments
              </button>
              {!filteredItems[lightbox].isVideo && (
                <button onClick={handleRotateCurrentImage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all bg-white/10 text-stone-300 hover:bg-white/20">
                  <RotateCw className="h-4 w-4" />Rotate 90°
                </button>
              )}
              <button onClick={() => downloadItem(filteredItems[lightbox!])} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded-lg text-sm transition-all">
                <Download className="h-4 w-4" />Download
              </button>
            </div>
            
            {showComments && (
              <div className="mt-4 bg-stone-900 rounded-xl p-4 max-w-2xl mx-auto border border-white/10 max-h-64 flex flex-col">
                <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-2">
                  {(items[lightbox].comments||[]).length === 0 ? (
                    <p className="text-stone-500 text-center text-sm py-4">No comments yet. Be the first to comment!</p>
                  ) : (
                    (items[lightbox].comments||[]).map((c, i) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3 text-left">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-amber-400 text-xs font-semibold">{c.author}</span>
                          <span className="text-stone-500 text-[10px]">{new Date(c.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-stone-300 text-sm">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleAddComment} className="flex gap-2 shrink-0">
                  <input type="text" placeholder="Your Name (Optional)" value={authorName} onChange={e=>setAuthorName(e.target.value)} className="w-1/3 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
                  <input type="text" placeholder="Add a comment..." value={newComment} onChange={e=>setNewComment(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
                  <button type="submit" disabled={!newComment.trim()} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors">
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}
            
            <p className="text-center text-stone-600 text-xs mt-3">{lightbox + 1} / {items.length}</p>
          </div>
        </div>
      )}

      {/* Favorites Submitted Modal */}
      {showFavoritesSubmittedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Heart className="h-8 w-8 text-emerald-400 fill-current" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Favorites Submitted!</h3>
            <p className="text-stone-300 text-sm mb-6 leading-relaxed">
              Your selection of {favorites.size} photo{favorites.size !== 1 ? 's' : ''} has been successfully sent to the photographer.
            </p>
            <div className="flex flex-col gap-3">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `Hi! I have selected my ${favorites.size} favorites in the shared gallery: ${window.location.href}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 text-sm"
              >
                <MessageCircle className="h-4 w-4 fill-current" />
                Notify on WhatsApp
              </a>
              <button
                onClick={() => setShowFavoritesSubmittedModal(false)}
                className="w-full py-3 bg-stone-850 hover:bg-stone-800 text-stone-300 rounded-xl font-semibold transition-all text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
