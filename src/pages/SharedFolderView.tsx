import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  ArrowLeft, Grid3X3, List, Download, Eye, X, Loader2,
  AlertCircle, Lock, Check, ChevronLeft, ChevronRight,
  Image, Play, ZoomIn, Camera, MessageSquare, Send, RotateCw, GripHorizontal,
  Heart, MessageCircle
} from 'lucide-react';
import { rawStoriesApiUrl, getThumbnailUrl } from '../api/rawStoriesBackend';

// ── Photography Splash Loader ─────────────────────────────────────────────────
// Camera aperture / shutter animation shown for ~2.2s on first load.
const CameraShutterLoader: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Start exit animation after 1.7s, complete after 2.2s
    const t1 = setTimeout(() => setClosing(true), 1700);
    const t2 = setTimeout(onDone, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  // 6 aperture blades — each rotated 60deg apart
  const blades = Array.from({ length: 6 }, (_, i) => i);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '2rem',
        transition: 'opacity 0.5s ease',
        opacity: closing ? 0 : 1,
        pointerEvents: closing ? 'none' : 'all',
      }}
    >
      <style>{`
        @keyframes apertureOpen {
          0%   { transform: rotate(var(--r)) scale(1.2); opacity: 1; }
          60%  { transform: rotate(calc(var(--r) + 55deg)) scale(0.85); opacity: 0.8; }
          100% { transform: rotate(calc(var(--r) + 60deg)) scale(0); opacity: 0; }
        }
        @keyframes shutterBlink {
          0%,100% { opacity: 1; }
          45%     { opacity: 1; }
          50%     { opacity: 0.15; }
          55%     { opacity: 1; }
        }
        @keyframes logoReveal {
          0%   { opacity: 0; transform: translateY(12px) scale(0.95); filter: brightness(0); }
          40%  { opacity: 0; }
          70%  { opacity: 0.7; transform: translateY(0) scale(1); filter: brightness(0.7); }
          100% { opacity: 1; filter: brightness(1.1); }
        }
        @keyframes scanLine {
          0%   { top: 0; opacity: 0.6; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes pulseRing {
          0%   { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      {/* Outer glow ring */}
      <div style={{ position: 'relative', width: 200, height: 200 }}>
        {/* Pulse rings */}
        {[0, 0.4, 0.8].map((delay, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1px solid rgba(217,119,6,0.4)',
            animation: `pulseRing 1.8s ${delay}s ease-out infinite`,
          }} />
        ))}

        {/* Aperture SVG */}
        <svg viewBox="0 0 200 200" width="200" height="200"
          style={{ position: 'absolute', inset: 0, animation: 'shutterBlink 2.2s ease forwards' }}>
          {/* Outer ring */}
          <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(217,119,6,0.3)" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="72" fill="none" stroke="rgba(217,119,6,0.15)" strokeWidth="0.5" />

          {/* Aperture blades */}
          {blades.map((i) => {
            const angle = i * 60;
            return (
              <g key={i} style={{
                transformOrigin: '100px 100px',
                ['--r' as string]: `${angle}deg`,
                animation: `apertureOpen 2.2s 0.2s cubic-bezier(0.4,0,0.2,1) forwards`,
                transform: `rotate(${angle}deg)`,
              }}>
                <ellipse
                  cx="100" cy="62"
                  rx="28" ry="42"
                  fill={`rgba(217,${100 + i * 8},6,${0.7 + i * 0.03})`}
                  stroke="rgba(0,0,0,0.3)" strokeWidth="0.5"
                />
              </g>
            );
          })}

          {/* Center lens */}
          <circle cx="100" cy="100" r="18"
            fill="#0a0a0a"
            stroke="rgba(217,119,6,0.6)" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="8" fill="rgba(217,119,6,0.2)" />
          {/* Lens reflection */}
          <ellipse cx="94" cy="94" rx="4" ry="2.5"
            fill="rgba(255,255,255,0.15)" transform="rotate(-30 94 94)" />
        </svg>

        {/* Scan line effect */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(217,119,6,0.7), transparent)',
          animation: 'scanLine 1.4s 0.3s ease-in-out infinite',
          borderRadius: 1,
        }} />
      </div>

      {/* Logo */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
        animation: 'logoReveal 2.2s ease forwards',
      }}>
        <img
          src="/rawstories-logo.png"
          alt="Raw Stories by Rakesh"
          style={{ height: 48, objectFit: 'contain',
            filter: 'invert(1) brightness(1.05) drop-shadow(0 0 12px rgba(217,119,6,0.5))' }}
        />
        {/* Tagline */}
        <p style={{
          color: 'rgba(217,119,6,0.7)',
          fontSize: '0.65rem', letterSpacing: '0.35em',
          textTransform: 'uppercase', fontFamily: 'Inter, sans-serif',
          marginTop: 4,
        }}>Your Memories, Our Craft</p>
      </div>

      {/* Film grain overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '150px',
      }} />
    </div>
  );
};

const SHARE_API = rawStoriesApiUrl('/default/SharedLinkAccess');

interface Item { id: string; title: string; imageUrl: string; presigned_url?: string; isVideo?: boolean; allowDownload?: boolean; comments?: {text: string, author: string, createdAt: string}[]; }

function notify(setFn: React.Dispatch<React.SetStateAction<{id:string;msg:string;type:string}[]>>, msg: string, type = 'info') {
  const id = `${Date.now()}-${Math.random()}`;
  setFn(p => [...p, { id, msg, type }]);
  setTimeout(() => setFn(p => p.filter(n => n.id !== id)), 4500);
}

// ── LazyImage: IntersectionObserver-based image component ──────────────────
// Only starts loading when the element enters the viewport. This prevents
// flooding the browser with 12+ simultaneous full-resolution S3 requests.
interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean; // true = load immediately (first ~4 images)
  onLoaded?: () => void;
  style?: React.CSSProperties;
}

const LazyImage: React.FC<LazyImageProps> = ({ src, alt, className, priority = false, onLoaded, style }) => {
  const [loaded, setLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Attach / re-attach IntersectionObserver whenever src changes (page navigation)
  useEffect(() => {
    setLoaded(false);
    if (priority) {
      setShouldLoad(true);
      return;
    }
    setShouldLoad(false);

    const el = containerRef.current;
    if (!el) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldLoad(true);
          observerRef.current?.disconnect();
        }
      },
      { rootMargin: '300px 0px', threshold: 0 } // start loading 300px before entering viewport
    );
    observerRef.current.observe(el);

    return () => observerRef.current?.disconnect();
  }, [src, priority]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* Shimmer skeleton — visible until image is done loading */}
      {!loaded && <div className="absolute inset-0 shimmer-bg" />}
      {shouldLoad && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          // @ts-ignore – fetchpriority is valid HTML but TypeScript types lag behind
          fetchpriority={priority ? 'high' : 'low'}
          onLoad={() => { setLoaded(true); onLoaded?.(); }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; setLoaded(true); }}
          className={`absolute inset-0 ${className || ''} transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={style}
        />
      )}
    </div>
  );
};

export default function SharedFolderView() {
  const { folderPath } = useParams<{ folderPath: string }>();
  const [searchParams] = useSearchParams();
  const shareId = searchParams.get('sid');
  const navigate = useNavigate();

  // Splash loader — show photography animation on first open
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

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
  const [sharedItemsList, setSharedItemsList] = useState<string[]>([]);
  const [branding, setBranding] = useState<{ logoUrl?: string; brandColor?: string; client?: string } | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [lightboxRotation, setLightboxRotation] = useState(0);
  const lightboxGestureRef = useRef<{ startX: number; startY: number; active: boolean } | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12; // Decreased from 24 to 12 for faster image loading
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(new Set());
  const [lightboxImageLoaded, setLightboxImageLoaded] = useState(false);

  const handleImageLoad = (id: string) => {
    setLoadedImageIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

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

  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleDownloadFavoritesZip = async () => {
    if (favorites.size === 0) {
      notify(setNotifications, 'Please select at least one favorite photo to export', 'info');
      return;
    }
    setDownloadingZip(true);
    notify(setNotifications, `Preparing ZIP archive of ${favorites.size} favorite photo(s)...`, 'info');
    try {
      const zip = new JSZip();
      const favItems = items.filter(item => favorites.has(item.id));
      let count = 0;
      for (const item of favItems) {
        try {
          const downloadUrl = rawStoriesApiUrl(`/default/downloadimage?key=${encodeURIComponent(item.id)}&shareId=${shareId || ''}`);
          const response = await fetch(downloadUrl);
          if (response.ok) {
            const blob = await response.blob();
            const fileName = item.filename || item.id.split('/').pop() || `photo_${count + 1}.jpg`;
            zip.file(fileName, blob);
            count++;
          }
        } catch (err) {
          console.error('Error downloading item for zip:', item.id, err);
        }
      }
      if (count === 0) {
        throw new Error('Could not fetch image data for zip archive');
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipName = `favorites_${folderPath ? folderPath.replace(/\//g, '_') : 'gallery'}.zip`;
      saveAs(zipBlob, zipName);
      notify(setNotifications, `Successfully exported ${count} favorite photo(s)!`, 'success');
    } catch (err: any) {
      console.error('Zip download error:', err);
      notify(setNotifications, `Zip export failed: ${err.message}`, 'error');
    } finally {
      setDownloadingZip(false);
    }
  };

  const decoded = folderPath ? decodeURIComponent(folderPath) : '';

  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const filteredItems = items.filter(item => {
    if (showFavoritesOnly) return favorites.has(item.id);
    return true;
  });

  // Pagination Calculations
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredItems.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [showFavoritesOnly, items]);

  // NOTE: Removed aggressive preload-all effect. The LazyImage component handles
  // loading via IntersectionObserver which prevents flooding the browser with
  // simultaneous full-resolution S3 requests. Priority images (first 4) load eagerly.

  // Preload next and previous lightbox images in the background for instant transitions
  useEffect(() => {
    if (lightbox === null) return;
    const preloadUrls: string[] = [];
    if (lightbox < filteredItems.length - 1) {
      const nextItem = filteredItems[lightbox + 1];
      if (nextItem && !nextItem.isVideo && nextItem.id) {
        preloadUrls.push(getThumbnailUrl(nextItem.id, 800));
      }
    }
    if (lightbox > 0) {
      const prevItem = filteredItems[lightbox - 1];
      if (prevItem && !prevItem.isVideo && prevItem.id) {
        preloadUrls.push(getThumbnailUrl(prevItem.id, 800));
      }
    }
    
    const imgs: HTMLImageElement[] = [];
    preloadUrls.forEach((url) => {
      const img = new globalThis.Image();
      img.src = url;
      imgs.push(img);
    });
    
    return () => {
      imgs.forEach((im) => { im.onload = null; im.onerror = null; });
    };
  }, [lightbox, filteredItems]);

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
        
        if (link?.isPinProtected || data.isPinProtected) { setPhase('pin'); }
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
      const hasFolderShare = sharedItemsList.some(item => item.startsWith('/') || item.endsWith('/'));

      // File-only shares do not always have a usable folder prefix in the URL.
      // In that case, ask the share-access API for resolved items directly.
      if (shareId && sharedItemsList.length > 0 && !hasFolderShare) {
        const accessRes = await fetch(SHARE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sharedId: shareId,
            ...(pin ? { pin } : {}),
          }),
        });
        const accessData = await accessRes.json().catch(() => null);
        if (!accessRes.ok || !accessData?.success) {
          throw new Error(accessData?.message || 'Failed to load shared items');
        }

        const resolved: Item[] = (accessData.items || []).map((it: any) => ({
          id: it.id,
          title: (it.title || it.id?.split('/').pop() || '').replace(/\.[^.]+$/, ''),
          imageUrl: it.imageUrl || it.presigned_url || '',
          isVideo: !!it.isVideo,
          allowDownload: it.allowDownload !== false,
          comments: it.comments || [],
        }));
        setItems(resolved);
        setLoading(false);
        return;
      }

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
        if (!hasFolderShare) {
          mapped = mapped.filter(item => sharedItemsList.includes(item.id));
        }
      }
      
      setItems(mapped);
    } catch (e: any) {
      setError(e.message || 'Failed to load shared items');
    }
    finally { setLoading(false); }
  }, [decoded, sharedItemsList, shareId, pin]);

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
  // Uses the same-origin /default/download-proxy endpoint which serves the
  // file with Content-Disposition: attachment — the ONLY reliable way to
  // force a save on ALL browsers (desktop Chrome, iOS Safari, Android).
  //
  // ⚠️  Key encoding note: S3 keys from the backend may already contain %20
  //     (URL-encoded spaces). We must decode them first before re-encoding so
  //     the server receives a single-encoded key that decodes to the real path.
  const downloadItem = async (item: Item) => {
    notify(setNotifications, `Preparing download…`, 'info');
    try {
      // Use the raw key directly. Calling encodeURIComponent on the raw S3 key (item.id)
      // preserves any literal %20 or other characters, which the server will decode back
      // exactly to the stored S3 key.
      const proxyUrl = rawStoriesApiUrl(
        `/default/download-proxy?key=${encodeURIComponent(item.id)}&shareId=${encodeURIComponent(shareId || '')}`
      );

      // Decoded filename for the local file save
      let rawKey: string;
      try { rawKey = decodeURIComponent(item.id); }
      catch { rawKey = item.id; }

      const keyParts = rawKey.split('/');
      const safeFilename = (keyParts[keyParts.length - 1] || 'image.jpg')
        .replace(/[\\/:*?"<>|]/g, '_');

      // Same-origin anchor — download attribute is respected on ALL browsers
      const a = document.createElement('a');
      a.href = proxyUrl;
      a.download = safeFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 1000);

      notify(setNotifications, `Downloading ${safeFilename}…`, 'success');
    } catch (err) {
      console.error('Download failed:', err);
      notify(setNotifications, 'Download failed. Please try again.', 'error');
    }
  };

  const downloadSelected = () => {
    const toDown = items.filter(i => selected.has(i.id));
    if (!toDown.length) { notify(setNotifications, 'Select items first', 'info'); return; }
    toDown.forEach(downloadItem);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) =>
    setSelected(p => {
      const n = new Set(p);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });

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
    setLightboxImageLoaded(false);
    setLightboxRotation(0);
    lightboxGestureRef.current = null;
  }, [lightbox]);

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER: Photography splash loader (shown on every page open)
  // ─────────────────────────────────────────────────────────────────────────
  // Renders as a fixed overlay — the rest of the page loads underneath.
  // After 2.2s the splash fades out and splashDone becomes true.

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER: Checking
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'checking') return (
    <>
      {!splashDone && <CameraShutterLoader onDone={handleSplashDone} />}
      <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-amber-400" />
          <p className="text-stone-300">Verifying access…</p>
        </div>
      </div>
    </>
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
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 flex flex-col items-center justify-center p-4">
      {/* Brand Logo at top */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <img
          src="/rawstories-logo.png"
          alt="Raw Stories by Rakesh"
          className="h-16 object-contain drop-shadow-[0_0_24px_rgba(217,119,6,0.3)]"
          style={{ filter: 'invert(1) brightness(1.1)' }}
        />
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
            <Lock className="h-7 w-7 text-amber-400" />
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

        {/* Social links */}
        <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-center gap-4">
          <a href="https://wa.me/917997743743" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-emerald-400 transition-colors">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
          <span className="text-stone-700">|</span>
          <a href="https://www.instagram.com/rawstoriesbyrakesh?igsh=MXg4NTJjeDBybmxndQ==" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-pink-400 transition-colors">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            Instagram
          </a>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER: Gallery
  // ─────────────────────────────────────────────────────────────────────────
  const defaultTitle = safeDecode(decoded.split('/').filter(Boolean).pop() || 'Shared Gallery')
    .replace(/[_-]+/g, ' ')
    .trim();
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
            {/* Instagram */}
            <a
              href="https://www.instagram.com/rawstoriesbyrakesh?igsh=MXg4NTJjeDBybmxndQ=="
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:scale-105 shrink-0"
              style={{ background: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' }}
              title="Follow on Instagram"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              <span className="hidden sm:inline">Instagram</span>
            </a>
            {/* WhatsApp */}
            <a 
              href="https://wa.me/917997743743" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:scale-105 shrink-0"
              title="Contact on WhatsApp"
            >
              <MessageCircle className="h-4 w-4 fill-current" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
            {favorites.size > 0 && (
              <button 
                onClick={submitFavorites} 
                disabled={isSubmittingFavs}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-500/20 shrink-0"
              >
                {isSubmittingFavs ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Heart className="h-4 w-4 fill-current" />
                )}
                Submit Favorites ({favorites.size})
              </button>
            )}
            {favorites.size > 0 && allowDownload && (
              <button 
                onClick={handleDownloadFavoritesZip}
                disabled={downloadingZip}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-purple-500/20 shrink-0"
                title="Download Favorites as ZIP archive"
              >
                {downloadingZip ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>Export Favorites ({favorites.size})</span>
              </button>
            )}
            {allowDownload && selected.size > 0 && (
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
                {currentItems.map((item, idx) => {
                  const isSelected = selected.has(item.id);
                  const isFavorite = favorites.has(item.id);
                  return (
                    <div key={item.id} className={`group relative bg-stone-800 rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-200 ${isSelected ? 'border-amber-500 shadow-lg shadow-amber-500/20' : 'border-transparent hover:border-white/20'}`}>
                      {/* Checkbox */}
                      <button onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
                        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-amber-500 border-amber-500' : 'bg-black/50 border-white/40 opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                      </button>
                      {/* Heart (Favorite) button */}
                      <button onClick={e => { e.stopPropagation(); toggleFavorite(item.id); }}
                        className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-md flex items-center justify-center transition-all bg-black/50 border-0 ${isFavorite ? 'text-red-500' : 'text-white/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-white'}`}>
                        <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current text-red-500' : ''}`} />
                      </button>
                      {/* Thumbnail */}
                      <div className="aspect-square relative overflow-hidden" onClick={() => setLightbox(indexOfFirstItem + idx)}>
                        {item.isVideo ? (
                          <div className="absolute inset-0 bg-stone-700 flex items-center justify-center">
                            <Play className="h-8 w-8 text-white/60" />
                          </div>
                        ) : (
                          <LazyImage
                            src={getThumbnailUrl(item.id, 400)}
                            alt={item.title}
                            priority={idx < 4} // first 4 items load immediately
                            onLoaded={() => handleImageLoad(item.id)}
                            className="w-full h-full object-cover group-hover:scale-105"
                          />
                        )}
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 z-10">
                          <button className="p-2 bg-white/20 backdrop-blur rounded-full text-white hover:bg-white/30 transition-all" onClick={e => { e.stopPropagation(); setLightbox(indexOfFirstItem + idx); }}>
                            <ZoomIn className="h-4 w-4" />
                          </button>
                          {allowDownload && (
                            <button className="p-2 bg-white/20 backdrop-blur rounded-full text-white hover:bg-white/30 transition-all" onClick={e => { e.stopPropagation(); downloadItem(item); }}>
                              <Download className="h-4 w-4" />
                            </button>
                          )}
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
                {currentItems.map((item, idx) => {
                  const isSelected = selected.has(item.id);
                  return (
                    <div key={item.id} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${isSelected ? 'bg-amber-500/10 border-amber-500/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} className="accent-amber-500 w-4 h-4 flex-shrink-0" />
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-stone-700 cursor-pointer relative" onClick={() => setLightbox(indexOfFirstItem + idx)}>
                        {item.isVideo ? <div className="w-full h-full flex items-center justify-center"><Play className="h-5 w-5 text-white/60"/></div>
                          : <LazyImage
                              src={getThumbnailUrl(item.id, 200)}
                              alt={item.title}
                              priority={idx < 8} // list view: first 8 load eagerly
                              onLoaded={() => handleImageLoad(item.id)}
                              className="w-full h-full object-cover"
                            />}
                      </div>
                      <span className="flex-1 text-stone-200 text-sm truncate">{item.title}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={e => { e.stopPropagation(); toggleFavorite(item.id); }} className={`p-2 rounded-lg transition-all ${favorites.has(item.id) ? 'text-red-500' : 'text-stone-400 hover:text-white hover:bg-white/10'}`}>
                          <Heart className={`h-4 w-4 ${favorites.has(item.id) ? 'fill-current text-red-500' : ''}`} />
                        </button>
                        <button onClick={() => setLightbox(indexOfFirstItem + idx)} className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"><Eye className="h-4 w-4" /></button>
                        {allowDownload && (
                          <button onClick={() => downloadItem(item)} className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"><Download className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-between gap-3 text-sm py-4 border-t border-white/5">
                <button
                  onClick={() => currentPage > 1 && paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs sm:text-sm transition-all ${
                    currentPage === 1
                      ? 'border-white/5 text-stone-600 bg-white/5 cursor-not-allowed'
                      : 'border-white/10 text-white bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>

                <div className="flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">Page</span>
                  <span className="text-sm font-semibold text-white">
                    {currentPage} / {totalPages}
                  </span>
                </div>

                <button
                  onClick={() => currentPage < totalPages && paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs sm:text-sm transition-all ${
                    currentPage === totalPages
                      ? 'border-white/5 text-stone-600 bg-white/5 cursor-not-allowed'
                      : 'border-white/10 text-white bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
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
            className="max-w-5xl max-h-[95vh] w-full mx-4 sm:mx-10 md:mx-16 flex flex-col justify-center"
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
              <video src={filteredItems[lightbox].imageUrl} controls className="max-h-[50vh] md:max-h-[70vh] max-w-full mx-auto rounded-lg" />
            ) : (
              <img
                src={getThumbnailUrl(filteredItems[lightbox].id, 800)}
                alt={filteredItems[lightbox].title}
                decoding="async"
                onLoad={() => setLightboxImageLoaded(true)}
                className={`max-h-[50vh] md:max-h-[70vh] max-w-full mx-auto object-contain rounded-lg shadow-2xl transition-all duration-300 ${
                  lightboxImageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                style={{ transform: `rotate(${lightboxRotation}deg)`, transition: 'transform 180ms ease-out, opacity 300ms, transform 300ms' }}
              />
            )}
            <div className="text-center mt-3 flex items-center justify-center gap-2 md:gap-4 flex-wrap">
              <p className="text-stone-400 text-sm w-full md:w-auto truncate mb-1 md:mb-0">{filteredItems[lightbox].title}</p>
              <button onClick={() => toggleFavorite(filteredItems[lightbox].id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${favorites.has(filteredItems[lightbox].id) ? 'bg-red-600 text-white shadow-md' : 'bg-white/10 text-stone-300 hover:bg-white/20'}`}>
                <Heart className={`h-4 w-4 ${favorites.has(filteredItems[lightbox].id) ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">{favorites.has(filteredItems[lightbox].id) ? 'Favorited' : 'Favorite'}</span>
              </button>
              <button onClick={() => setShowComments(!showComments)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${showComments ? 'bg-amber-600 text-white' : 'bg-white/10 text-stone-300 hover:bg-white/20'}`}>
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Comments </span>
                <span className="text-xs">({(filteredItems[lightbox].comments||[]).length})</span>
              </button>
              {!filteredItems[lightbox].isVideo && (
                <button onClick={handleRotateCurrentImage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all bg-white/10 text-stone-300 hover:bg-white/20">
                  <RotateCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Rotate 90°</span>
                </button>
              )}
              {allowDownload && (
                <button onClick={() => downloadItem(filteredItems[lightbox!])} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded-lg text-sm transition-all">
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              )}
            </div>
            
            {showComments && (
              <div className="mt-4 bg-stone-900 rounded-xl p-4 max-w-2xl mx-auto border border-white/10 max-h-64 flex flex-col">
                <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-2">
                  {(filteredItems[lightbox].comments||[]).length === 0 ? (
                    <p className="text-stone-500 text-center text-sm py-4">No comments yet. Be the first to comment!</p>
                  ) : (
                    (filteredItems[lightbox].comments||[]).map((c, i) => (
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

            <p className="text-center text-stone-600 text-xs mt-3">{lightbox + 1} / {filteredItems.length}</p>
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
