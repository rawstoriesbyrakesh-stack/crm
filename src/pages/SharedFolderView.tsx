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

// â”€â”€ Photography Splash Loader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Camera aperture / shutter animation shown for ~2.2s on first load.
const CameraShutterLoader: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Start exit animation after 1.7s, complete after 2.2s
    const t1 = setTimeout(() => setClosing(true), 1700);
    const t2 = setTimeout(onDone, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  // 6 aperture blades â€” each rotated 60deg apart
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

// â”€â”€ LazyImage: IntersectionObserver-based image component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      {/* Shimmer skeleton â€” visible until image is done loading */}
      {!loaded && <div className="absolute inset-0 shimmer-bg" />}
      {shouldLoad && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          // @ts-ignore â€“ fetchpriority is valid HTML but TypeScript types lag behind
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

  // Splash loader â€” show photography animation on first open
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

  // â”€â”€ Check access on mount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Fetch images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Verify PIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Download â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Uses the same-origin /default/download-proxy endpoint which serves the
  // file with Content-Disposition: attachment â€” the ONLY reliable way to
  // force a save on ALL browsers (desktop Chrome, iOS Safari, Android).
  //
  // âš ï¸  Key encoding note: S3 keys from the backend may already contain %20
  //     (URL-encoded spaces). We must decode them first before re-encoding so
  //     the server receives a single-encoded key that decodes to the real path.
  const downloadItem = async (item: Item) => {
    notify(setNotifications, `Preparing downloadâ€¦`, 'info');
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

      // Same-origin anchor â€” download attribute is respected on ALL browsers
      const a = document.createElement('a');
      a.href = proxyUrl;
      a.download = safeFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 1000);

      notify(setNotifications, `Downloading ${safeFilename}â€¦`, 'success');
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

  // â”€â”€ Add Comment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  
    // ─────────────────────────────────────────────────────────────────────────
    //  RENDER: Checking
    // ─────────────────────────────────────────────────────────────────────────
    if (phase === 'checking') return (
      <>
        {!splashDone && <CameraShutterLoader onDone={handleSplashDone} />}
        <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
          <div className="text-center text-white flex flex-col items-center gap-4">
            <div className="w-14 h-14 border-3 border-slate-700 border-t-amber-400 rounded-full animate-spin shadow-lg shadow-amber-500/20" />
            <p className="text-amber-400 text-sm font-semibold tracking-widest uppercase">Verifying access…</p>
          </div>
        </div>
      </>
    );
  
    // ─────────────────────────────────────────────────────────────────────────
    //  RENDER: Denied
    // ─────────────────────────────────────────────────────────────────────────
    if (phase === 'denied') return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-red-500/30 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl shadow-red-950/50">
          <div className="w-20 h-20 bg-red-500/20 border border-red-500/40 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/20">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Access Denied</h2>
          <p className="text-slate-300 mb-8 leading-relaxed text-sm">{denyReason}</p>
          <p className="text-xs text-slate-400 font-medium">Contact the photographer if you believe this is an error.</p>
        </div>
      </div>
    );
  
    // ─────────────────────────────────────────────────────────────────────────
    //  RENDER: PIN Entry
    // ─────────────────────────────────────────────────────────────────────────
    if (phase === 'pin') return (
      <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Dynamic ambient glow background */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
  
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img
            src="/rawstories-logo.png"
            alt="Raw Stories by Rakesh"
            className="h-14 object-contain"
            style={{ filter: 'invert(1) brightness(1.2) drop-shadow(0 0 20px rgba(245,158,11,0.5))' }}
          />
          <p className="text-amber-400/90 text-xs font-semibold tracking-[0.35em] uppercase">Your Memories, Our Craft</p>
        </div>
  
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-slate-700/80 rounded-3xl p-8 max-w-sm w-full shadow-2xl shadow-black/80 relative overflow-hidden">
          {/* Top shine */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-amber-400 to-rose-500" />
  
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-500/20 border border-amber-400/40 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
              <Lock className="h-8 w-8 text-amber-300" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Protected Gallery</h2>
            <p className="text-slate-300 text-sm">Enter the PIN provided by your photographer</p>
          </div>
  
          <div className="mb-5">
            <input
              type="text" value={pin} maxLength={8} autoFocus
              onChange={e => { setPin(e.target.value); setPinError(''); }}
              onKeyDown={e => e.key === 'Enter' && verifyPin()}
              placeholder="• • • •"
              className="w-full bg-slate-950/80 border border-slate-700 text-amber-300 placeholder-slate-500 rounded-2xl px-5 py-4 text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 transition-all shadow-inner"
            />
            {pinError && (
              <div className="mt-3 text-red-300 font-medium text-sm text-center flex items-center justify-center gap-2 bg-red-500/15 rounded-xl py-2.5 px-3 border border-red-500/30">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />{pinError}
              </div>
            )}
          </div>
  
          <button
            onClick={verifyPin} disabled={pinLoading || !pin.trim()}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 text-sm tracking-wide"
          >
            {pinLoading ? <><div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" />Verifying…</> : <>
              <Check className="h-5 w-5 stroke-[3]" />Access Gallery
            </>}
          </button>
  
          <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-center gap-4">
            <a href="https://wa.me/917997743743" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-emerald-400 font-medium transition-colors">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <span className="text-slate-700">|</span>
            <a href="https://www.instagram.com/rawstoriesbyrakesh?igsh=MXg4NTJjeDBybmxndQ==" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-pink-400 font-medium transition-colors">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
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
  
    const IG_ICON = (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    );
  
    const favCount = favorites.size;
    const currentLbItem = lightbox !== null ? filteredItems[lightbox] : null;
  
    return (
      <div className="min-h-screen text-slate-100 relative overflow-hidden" style={{ background: '#0b0f19', fontFamily: "'Inter', sans-serif" }}>
        {/* Glowing background highlights */}
        <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[150px] pointer-events-none z-0" />
        <div className="fixed top-1/2 right-10 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none z-0" />
        <div className="fixed bottom-0 left-1/3 w-[650px] h-[650px] bg-purple-500/10 rounded-full blur-[160px] pointer-events-none z-0" />
  
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          .photo-card { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease, border-color 0.3s ease; }
          .photo-card:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 25px rgba(245,158,11,0.25); }
          .photo-card:hover .card-overlay { opacity: 1; }
          .photo-card:hover .card-actions { opacity: 1; transform: translateY(0); }
          .card-overlay { opacity: 0; transition: opacity 0.25s ease; }
          .card-actions { opacity: 1; transition: opacity 0.25s ease, transform 0.25s ease; }
          .fav-active { animation: heartPop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }
          @keyframes heartPop { 0%{transform:scale(1)} 50%{transform:scale(1.4)} 100%{transform:scale(1.15)} }
          .lb-img-enter { animation: lbEnter 0.3s ease forwards; }
          @keyframes lbEnter { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
          .toast-in { animation: toastSlide 0.35s ease forwards; }
          @keyframes toastSlide { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
          .shimmer-vibrant { background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%); background-size: 200% 100%; animation: shimmerVibrant 1.5s infinite; }
          @keyframes shimmerVibrant { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
          ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0b0f19; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        `}</style>
  
        {/* ── Toast notifications ── */}
        <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
          {notifications.map(n => (
            <div key={n.id} className={`toast-in pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold shadow-2xl backdrop-blur-xl border max-w-[320px] ${
              n.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/50'
              : n.type === 'error' ? 'bg-red-950/90 border-red-500/40 text-red-200 shadow-red-950/50'
              : 'bg-slate-900/90 border-slate-700 text-white'}`}>
              <span className="flex-1 leading-snug">{n.msg}</span>
              <button onClick={() => setNotifications(p => p.filter(x => x.id !== n.id))} className="text-slate-400 hover:text-white transition-colors shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
  
        {/* ── High-Contrast Header ── */}
        <header className="fixed top-0 left-0 right-0 z-40" style={{ backdropFilter: 'blur(24px) saturate(180%)', background: 'rgba(15,23,42,0.85)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3 min-w-0">
              <img src="/rawstories-logo.png" alt="Raw Stories by Rakesh" className="h-8 object-contain shrink-0 drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                style={{ filter: 'invert(1) brightness(1.2)' }} />
              <div className="h-6 w-px bg-slate-700" />
              <div className="min-w-0">
                <p className="text-slate-100 font-bold text-sm sm:text-base capitalize truncate leading-tight">{galleryTitle}</p>
                <p className="text-amber-400 text-[11px] font-medium hidden sm:block">{items.length} Photos in Gallery</p>
              </div>
            </div>
  
            {/* Actions */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Favorites filter toggle */}
              {favCount > 0 && (
                <button onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-md ${
                    showFavoritesOnly ? 'bg-rose-500 text-white border-rose-400 shadow-rose-500/30' : 'bg-slate-800/90 border-slate-700 text-rose-300 hover:bg-slate-700'}`}>
                  <Heart className={`h-4 w-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                  <span>{showFavoritesOnly ? 'All Photos' : `Favorites (${favCount})`}</span>
                </button>
              )}
  
              {/* View toggle */}
              <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700 rounded-xl p-1 shadow-inner">
                <button onClick={() => setViewMode('grid')} title="Grid view"
                  className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-amber-500 text-slate-950 font-bold shadow-md' : 'text-slate-300 hover:text-white'}`}>
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode('list')} title="List view"
                  className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-amber-500 text-slate-950 font-bold shadow-md' : 'text-slate-300 hover:text-white'}`}>
                  <List className="h-4 w-4" />
                </button>
              </div>
  
              {/* Social buttons */}
              <a href="https://www.instagram.com/rawstoriesbyrakesh?igsh=MXg4NTJjeDBybmxndQ==" target="_blank" rel="noopener noreferrer"
                className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>
                {IG_ICON}<span>Instagram</span>
              </a>
              <a href="https://wa.me/917997743743" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md hover:scale-105">
                <MessageCircle className="h-4 w-4 fill-current" /><span className="hidden sm:inline">WhatsApp</span>
              </a>
            </div>
          </div>
        </header>
  
        {/* ── High Contrast Hero Header ── */}
        <div className="pt-16 relative z-10">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pt-6 pb-2">
            <div className="relative rounded-3xl overflow-hidden border border-slate-700/80 p-6 sm:p-8 bg-slate-900/80 backdrop-blur-xl shadow-2xl shadow-slate-950/60">
              {/* Blurred photo backdrop */}
              {items[0] && !items[0].isVideo && (
                <img src={getThumbnailUrl(items[0].id, 400)} alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-20 scale-110 blur-xl pointer-events-none" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/80 to-slate-950/90 pointer-events-none" />
  
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold tracking-wider uppercase mb-3 shadow-md">
                    <Camera className="h-3.5 w-3.5" /> High Quality Shared Gallery
                  </div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white capitalize leading-tight tracking-tight drop-shadow-md">
                    {galleryTitle}
                  </h1>
                  <p className="text-slate-300 text-sm sm:text-base mt-2 font-medium">
                    Select your favorites, preview photos in high resolution, or download directly.
                  </p>
                </div>
  
                {/* Stats badges */}
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <div className="bg-slate-800/90 border border-slate-700 px-4 py-3 rounded-2xl flex flex-col items-center min-w-[100px] shadow-lg">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Total Photos</span>
                    <span className="text-2xl font-black text-amber-400">{filteredItems.length}</span>
                  </div>
                  <div className="bg-slate-800/90 border border-slate-700 px-4 py-3 rounded-2xl flex flex-col items-center min-w-[100px] shadow-lg">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Favorites</span>
                    <span className="text-2xl font-black text-rose-400">{favCount}</span>
                  </div>
                  {selected.size > 0 && (
                    <div className="bg-slate-800/90 border border-slate-700 px-4 py-3 rounded-2xl flex flex-col items-center min-w-[100px] shadow-lg">
                      <span className="text-xs text-slate-400 font-semibold uppercase">Selected</span>
                      <span className="text-2xl font-black text-cyan-400">{selected.size}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
  
        {/* ── Main Gallery Grid ── */}
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 pb-40 relative z-10">
          {loading ? (
            /* Vibrant skeleton grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl shimmer-vibrant border border-slate-700/50" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 bg-slate-900/60 border border-red-500/30 rounded-3xl">
              <div className="w-16 h-16 bg-red-500/20 border border-red-500/40 rounded-2xl flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <p className="text-red-300 text-base font-semibold">{error}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 bg-slate-900/60 border border-slate-800 rounded-3xl">
              <div className="w-20 h-20 bg-slate-800 border border-slate-700 rounded-3xl flex items-center justify-center shadow-lg">
                <Image className="h-10 w-10 text-amber-400" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-1">No Photos Found</h3>
                <p className="text-sm text-slate-300">{showFavoritesOnly ? 'You have not favorited any photos yet.' : 'This folder currently has no photos.'}</p>
              </div>
              {showFavoritesOnly && (
                <button onClick={() => setShowFavoritesOnly(false)} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl text-sm transition-all shadow-lg shadow-amber-500/20">
                  Show All Photos
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* ── Photo Grid ── */
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                {currentItems.map((item, idx) => {
                  const isSelected = selected.has(item.id);
                  const isFav = favorites.has(item.id);
                  const globalIdx = indexOfFirstItem + idx;
                  return (
                    <div key={item.id} className={`photo-card group relative rounded-2xl overflow-hidden border transition-all ${
                      isSelected ? 'ring-4 ring-amber-400 border-amber-400 shadow-xl shadow-amber-500/30'
                      : isFav ? 'ring-2 ring-rose-500 border-rose-400 shadow-lg shadow-rose-500/20'
                      : 'bg-slate-900/90 border-slate-700/80 hover:border-slate-500'
                    }`}>
  
                      {/* Aspect ratio box */}
                      <div className="aspect-square relative bg-slate-950">
                        {item.isVideo ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                            <div className="w-14 h-14 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/40">
                              <Play className="h-6 w-6 fill-current ml-1" />
                            </div>
                          </div>
                        ) : (
                          <LazyImage src={getThumbnailUrl(item.id, 400)} alt={item.title} priority={idx < 6}
                            onLoaded={() => handleImageLoad(item.id)} className="w-full h-full object-cover" />
                        )}
  
                        {/* Top controls row (always visible badges with dark backdrop for high readability) */}
                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between z-20">
                          <button onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
                            className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shadow-md ${
                              isSelected ? 'bg-amber-400 border-amber-400 text-slate-950' : 'bg-slate-950/80 backdrop-blur border-slate-500 text-white hover:border-amber-400'}`}>
                            {isSelected && <Check className="h-4 w-4 stroke-[3]" />}
                          </button>
  
                          <button onClick={e => { e.stopPropagation(); toggleFavorite(item.id); }}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-md ${
                              isFav ? 'bg-rose-500 text-white shadow-rose-500/40' : 'bg-slate-950/80 backdrop-blur border border-slate-500 text-slate-300 hover:text-rose-400 hover:border-rose-400'}`}>
                            <Heart className={`h-4 w-4 ${isFav ? 'fill-current fav-active' : ''}`} />
                          </button>
                        </div>
  
                        {/* Bottom action row (appears on hover or click) */}
                        <div className="card-actions absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-center gap-2 z-20">
                          <button onClick={e => { e.stopPropagation(); setLightbox(globalIdx); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-600 text-white text-xs font-bold hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 transition-all shadow-lg">
                            <ZoomIn className="h-4 w-4" /> View
                          </button>
                          {allowDownload && (
                            <button onClick={e => { e.stopPropagation(); downloadItem(item); }}
                              className="w-9 h-9 flex items-center justify-center bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-600 text-white hover:bg-emerald-500 hover:text-white hover:border-emerald-400 transition-all shadow-lg">
                              <Download className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
  
                      {/* Card Title Bar below photo */}
                      <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-200 truncate">{item.title}</p>
                        {isFav && <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded">FAV</span>}
                      </div>
  
                      {/* Click photo to open lightbox */}
                      <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => setLightbox(globalIdx)} />
                    </div>
                  );
                })}
              </div>
  
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-2.5">
                  <button onClick={() => currentPage > 1 && paginate(currentPage - 1)} disabled={currentPage === 1}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold disabled:opacity-40 text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition-all shadow-md">
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages).map((page, i, arr) => (
                      <React.Fragment key={page}>
                        {i > 0 && arr[i-1] !== page - 1 && <span className="text-slate-500 font-bold px-1">…</span>}
                        <button onClick={() => paginate(page)}
                          className={`w-10 h-10 rounded-2xl text-sm font-extrabold transition-all border shadow-md ${
                            page === currentPage ? 'text-slate-950 border-amber-400 bg-amber-400 shadow-amber-500/20' : 'text-slate-200 border-slate-700 bg-slate-900 hover:bg-slate-800 hover:border-slate-500'}`}>
                          {page}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                  <button onClick={() => currentPage < totalPages && paginate(currentPage + 1)} disabled={currentPage === totalPages}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold disabled:opacity-40 text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition-all shadow-md">
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            /* ── List View ── */
            <div className="space-y-2">
              {currentItems.map((item, idx) => {
                const isSel = selected.has(item.id);
                const isFav = favorites.has(item.id);
                return (
                  <div key={item.id} onClick={() => setLightbox(indexOfFirstItem + idx)}
                    className={`group flex items-center gap-4 p-3.5 rounded-2xl border cursor-pointer transition-all shadow-md ${
                      isSel ? 'bg-amber-500/15 border-amber-400' : 'bg-slate-900/90 border-slate-800 hover:bg-slate-800 hover:border-slate-700'}`}>
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-700 shrink-0 bg-slate-950">
                      {item.isVideo ? <div className="w-full h-full bg-slate-900 flex items-center justify-center"><Play className="h-5 w-5 text-amber-400 fill-current" /></div>
                        : <LazyImage src={getThumbnailUrl(item.id, 100)} alt={item.title} priority={idx < 10} onLoaded={() => handleImageLoad(item.id)} className="w-full h-full object-cover" />}
                    </div>
                    <span className="flex-1 text-sm font-bold text-slate-100 truncate group-hover:text-amber-300 transition-colors">{item.title}</span>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleFavorite(item.id)}
                        className={`p-2.5 rounded-xl transition-all border ${isFav ? 'text-white bg-rose-500 border-rose-400' : 'text-slate-300 bg-slate-800 border-slate-700 hover:text-rose-400'}`}>
                        <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setLightbox(indexOfFirstItem + idx); }}
                        className="p-2.5 rounded-xl text-slate-300 bg-slate-800 border border-slate-700 hover:text-white hover:bg-slate-700 transition-all">
                        <Eye className="h-4 w-4" />
                      </button>
                      {allowDownload && (
                        <button onClick={e => { e.stopPropagation(); downloadItem(item); }}
                          className="p-2.5 rounded-xl text-slate-300 bg-slate-800 border border-slate-700 hover:text-white hover:bg-slate-700 transition-all">
                          <Download className="h-4 w-4" />
                        </button>
                      )}
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(item.id)} className="w-5 h-5 accent-amber-400 rounded cursor-pointer ml-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
  
        {/* ── High-Visibility Floating Action Bar (when favorites selected) ── */}
        {favCount > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border-2 border-amber-400/80 shadow-2xl"
              style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(24px)', boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(245,158,11,0.3)' }}>
              <div className="flex items-center gap-2.5 pr-4 border-r border-slate-700">
                <div className="w-8 h-8 rounded-xl bg-rose-500 flex items-center justify-center shadow-md shadow-rose-500/30">
                  <Heart className="h-4 w-4 text-white fill-current" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-base font-black text-white">{favCount} Photos</span>
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Favorited</span>
                </div>
              </div>
  
              <button onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                  showFavoritesOnly ? 'bg-amber-400 text-slate-950 border-amber-400' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'}`}>
                {showFavoritesOnly ? 'Show All' : 'Filter Favs'}
              </button>

              {allowDownload && (
                <button onClick={handleDownloadFavoritesZip} disabled={downloadingZip}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition-all disabled:opacity-40 shadow-md">
                  {downloadingZip ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Download className="h-4 w-4 text-cyan-400" />}
                  <span className="hidden sm:inline">Export ZIP</span>
                </button>
              )}

              <button onClick={submitFavorites} disabled={isSubmittingFavs}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-50 shadow-lg bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30">
                {isSubmittingFavs ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="h-4 w-4 stroke-[3]" />}
                <span>Submit to Photographer</span>
              </button>
            </div>
          </div>
        )}

      {/* ── High-Contrast Lightbox ── */}
      {lightbox !== null && currentLbItem && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-2xl">

          {/* Top Bar */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 shrink-0 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <button onClick={() => setLightbox(null)}
                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-white font-bold transition-all shadow-md">
                <X className="h-5 w-5" />
              </button>
              <span className="text-slate-200 font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
                {lightbox + 1} / {filteredItems.length}
              </span>
            </div>
            <p className="text-white font-bold text-base truncate max-w-[280px] hidden sm:block">{currentLbItem.title}</p>
            <div className="flex items-center gap-2.5">
              <button onClick={() => toggleFavorite(currentLbItem.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all shadow-md ${
                  favorites.has(currentLbItem.id)
                    ? 'bg-rose-500 border-rose-400 text-white shadow-rose-500/30'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white'}`}>
                <Heart className={`h-4 w-4 ${favorites.has(currentLbItem.id) ? 'fill-current' : ''}`} />
                <span>{favorites.has(currentLbItem.id) ? 'Favorited' : 'Favorite'}</span>
              </button>

              {!currentLbItem.isVideo && (
                <button onClick={handleRotateCurrentImage}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 hover:text-white transition-all shadow-md">
                  <RotateCw className="h-4 w-4" />
                </button>
              )}

              <button onClick={() => setShowComments(!showComments)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all shadow-md ${
                  showComments ? 'bg-amber-400 text-slate-950 border-amber-400' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'}`}>
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Comments</span>
                <span>({(currentLbItem.comments||[]).length})</span>
              </button>

              {allowDownload && (
                <button onClick={() => downloadItem(currentLbItem)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 transition-all shadow-md">
                  <Download className="h-4 w-4" /> Download
                </button>
              )}
            </div>
          </div>

          {/* Image Display Area */}
          <div className="flex-1 flex items-center justify-center relative px-14 sm:px-20 overflow-hidden"
            onPointerDown={handleLightboxPointerDown}
            onPointerUp={handleLightboxPointerUp}
            onPointerCancel={() => { lightboxGestureRef.current = null; }}
            onPointerLeave={() => { lightboxGestureRef.current = null; }}
            style={{ touchAction: 'none' }}>

            {/* Prev */}
            {lightbox > 0 && (
              <button onClick={e => { e.stopPropagation(); setLightbox(p => p! - 1); }}
                className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-white transition-all z-20 shadow-2xl">
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {/* Next */}
            {lightbox < filteredItems.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setLightbox(p => p! + 1); }}
                className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-white transition-all z-20 shadow-2xl">
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

            {currentLbItem.isVideo ? (
              <video src={currentLbItem.imageUrl} controls className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl border border-slate-800" />
            ) : (
              <img src={getThumbnailUrl(currentLbItem.id, 1200)} alt={currentLbItem.title}
                decoding="async"
                onLoad={() => setLightboxImageLoaded(true)}
                className="lb-img-enter max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl"
                style={{ transform: `rotate(${lightboxRotation}deg)`, transition: 'transform 200ms ease' }} />
            )}
          </div>

          {/* Progress bar */}
          <div className="h-1 mx-6 rounded-full shrink-0 bg-slate-800">
            <div className="h-full rounded-full transition-all bg-amber-400 shadow-sm" style={{ width: `${((lightbox + 1) / filteredItems.length) * 100}%` }} />
          </div>

          {/* Comment Panel */}
          {showComments && (
            <div className="shrink-0 border-t border-slate-800 px-4 sm:px-8 py-4 max-h-56 flex flex-col bg-slate-900">
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
                {(currentLbItem.comments||[]).length === 0 ? (
                  <p className="text-slate-400 text-xs font-semibold text-center py-3">No comments yet — be the first to leave feedback!</p>
                ) : (
                  (currentLbItem.comments||[]).map((c, i) => (
                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-bold text-amber-400">{c.author}</span>
                        <span className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-slate-200 font-medium">{c.text}</p>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input type="text" placeholder="Your name" value={authorName} onChange={e => setAuthorName(e.target.value)}
                  className="w-32 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 font-medium" />
                <input type="text" placeholder="Write a comment…" value={newComment} onChange={e => setNewComment(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 font-medium" />
                <button type="submit" disabled={!newComment.trim()}
                  className="px-4 py-2 rounded-xl text-slate-950 bg-amber-400 hover:bg-amber-300 font-extrabold text-xs disabled:opacity-40 transition-all shadow-md">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}

          {/* Thumbnail Strip */}
          <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto shrink-0 bg-slate-950 border-t border-slate-900">
            {filteredItems.slice(Math.max(0, lightbox - 4), lightbox + 8).map((item, i) => {
              const gi = Math.max(0, lightbox - 4) + i;
              return (
                <button key={item.id} onClick={() => setLightbox(gi)}
                  className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    gi === lightbox ? 'border-amber-400 scale-110 shadow-lg shadow-amber-400/30' : 'border-slate-800 opacity-60 hover:opacity-100'}`}>
                  {item.isVideo
                    ? <div className="w-full h-full bg-slate-900 flex items-center justify-center"><Play className="h-4 w-4 text-amber-400 fill-current" /></div>
                    : <img src={getThumbnailUrl(item.id, 100)} alt="" className="w-full h-full object-cover" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* â”€â”€ Favorites Submitted Modal â”€â”€ */}
      {showFavoritesSubmittedModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}>
          <div className="relative rounded-3xl p-8 w-full max-w-sm text-center border border-white/8 shadow-2xl"
            style={{ background: 'rgba(12,12,14,0.98)' }}>
            <div className="absolute top-0 left-0 right-0 h-px rounded-t-3xl"
              style={{ background: 'linear-gradient(to right, transparent, rgba(16,185,129,0.6), transparent)' }} />
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', boxShadow: '0 0 30px rgba(16,185,129,0.15)' }}>
              <Heart className="h-8 w-8 text-emerald-400 fill-current" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Favorites Sent! ðŸŽ‰</h3>
            <p className="text-white/40 text-sm mb-7 leading-relaxed">
              Your {favorites.size} selected photo{favorites.size !== 1 ? 's' : ''} have been sent to the photographer.
            </p>
            <div className="flex flex-col gap-3">
              <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Hi! I've selected my ${favorites.size} favorites in the shared gallery: ${window.location.href}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="w-full py-3 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all"
                style={{ background: '#25D366', boxShadow: '0 8px 25px rgba(37,211,102,0.25)' }}>
                <MessageCircle className="h-4 w-4 fill-current" /> Notify via WhatsApp
              </a>
              <button onClick={() => setShowFavoritesSubmittedModal(false)}
                className="w-full py-3 bg-white/5 hover:bg-white/8 border border-white/8 text-white/50 hover:text-white rounded-2xl font-semibold text-sm transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
