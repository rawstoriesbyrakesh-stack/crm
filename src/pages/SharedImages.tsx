// @ts-ignore - React is needed for JSX runtime despite react-jsx transform
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  ArrowLeft,
  Grid3X3,
  List,
  Heart,
  Download,
  Eye,
  X,
  FolderPlus,
  Loader2,
  AlertCircle,
  Play,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Lock,
  Check,
  Mail,
  Phone,
  Instagram,
  Facebook,
  Camera,
  Package,
} from 'lucide-react';
import { createFavoritesFolderAPI } from '../api/favoritesAPI';
import { rawStoriesApiUrl } from '../api/rawStoriesBackend';

// API endpoint for share link access
const SHARE_API_ACCESS = rawStoriesApiUrl('/default/SharedLinkAccess');

// -------------------- Interfaces --------------------
interface GalleryItem {
  id: string;
  shootType: string;
  eventDate: string;
  imageUrl: string;
  title: string;
  uploadDate: string;
  isWatermarked: boolean;
  isPinProtected: boolean;
  isFavorite?: boolean;
  key?: string;
  isVideo?: boolean;
}
interface FolderItem {
  name: string;
  path: string;
}
interface ApiResponse {
  files: any[];
  folders: FolderItem[];
}

// -------------------- Main Component --------------------
function SharedImages() {
  const { folderPath } = useParams<{ folderPath: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shareId = searchParams.get('sid');

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [favoritedItems, setFavoritedItems] = useState<string[]>([]);
  const [downloadSelectedItems, setDownloadSelectedItems] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [projectName, setProjectName] = useState<string>('default');
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  // Download flow modal
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadStep, setDownloadStep] = useState<1 | 3>(1);
  const [emailInput, setEmailInput] = useState('');
  const [downloadInlineMsg, setDownloadInlineMsg] = useState<string>('');
  const [isModalProcessing, setIsModalProcessing] = useState(false);
  const [modalProcessingAction, setModalProcessingAction] = useState<null | 'selected' | 'all'>(null);
  

  // User Permissions
  const [permissions] = useState({
    canDownload: true,
    canViewFullSize: true,
    canShare: false,
    watermarkEnabled: false,
  });

  // Hero Image
  const [heroImage, setHeroImage] = useState<string | null>(null);

  // PIN Protection & Access Control
  const [isPinRequired, setIsPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  // Decode the folder path from URL
  const decodedFolderPath = folderPath ? decodeURIComponent(folderPath) : '';

  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  // Check share link status and PIN requirement on mount
  useEffect(() => {
    const checkShareLinkAccess = async () => {
      if (!shareId) {
        setIsCheckingAccess(false);
        setHasAccess(true); // Allow access if no shareId (direct access)
        return;
      }

      setIsCheckingAccess(true);
      try {
        // Check share link status from server
        const res = await fetch(SHARE_API_ACCESS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors',
          body: JSON.stringify({
            action: 'get_share_link_status',
            sharedId: shareId,
          }),
        });

        const txt = await res.text();
        let data: any = null;
        try {
          data = txt ? JSON.parse(txt) : null;
        } catch {
          data = null;
        }

        if (!res.ok || !data || data.success === false) {
          // Access denied
          setIsAccessDenied(true);
          setIsCheckingAccess(false);
          setLoading(false);
          return;
        }

        const link = (data as any).shareLink;
        if (!link || link.isActive === false) {
          // Link is inactive/revoked
          setIsAccessDenied(true);
          setIsCheckingAccess(false);
          setLoading(false);
          return;
        }

        // Check if PIN is required
        if (link.pin || link.isPinProtected) {
          setIsPinRequired(true);
          setIsCheckingAccess(false);
          setLoading(false);
        } else {
          // No PIN required, grant access
          setHasAccess(true);
          setIsCheckingAccess(false);
        }
      } catch (err: any) {
        console.error('Failed to check share link access:', err);
        setIsAccessDenied(true);
        setIsCheckingAccess(false);
        setLoading(false);
      }
    };

  

    checkShareLinkAccess();
  }, [shareId]);

  // Verify PIN with server
  const handlePinSubmit = async () => {
    if (!shareId || !pinInput || isVerifyingPin) return;

    setPinError('');
    setIsVerifyingPin(true);
    try {
      const res = await fetch(SHARE_API_ACCESS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify({
          action: 'verify_pin',
          sharedId: shareId,
          pin: pinInput,
        }),
      });

      const txt = await res.text();
      let data: any = null;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data || data.success === false) {
        const msg = (data && data.message) ? data.message : 'Incorrect PIN. Please try again.';
        setPinError(msg);
        setPinInput('');
        setIsVerifyingPin(false);
        return;
      }

      // PIN verified successfully
      setIsPinRequired(false);
      setPinError('');
      setHasAccess(true);
      setIsVerifyingPin(false);
      addNotification('Access granted', 'success');
      
      // Trigger fetch after PIN verification
      if (decodedFolderPath) {
        fetchFolderItems();
      }
    } catch (err: any) {
      setPinError('Failed to verify PIN. Please try again.');
      setPinInput('');
      setIsVerifyingPin(false);
    }
  };

  useEffect(() => {
    const pathSegments = decodedFolderPath.replace(/^\/+/, '').split('/');
    const galleryIndex = pathSegments.indexOf('gallery');
    let name = '';

    if (galleryIndex !== -1 && galleryIndex + 1 < pathSegments.length) {
      name = pathSegments[galleryIndex + 1];
    } else {
      // Extract the last meaningful segment, removing leading slashes
      const cleanPath = decodedFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
      name = cleanPath.split('/').pop() || cleanPath || 'default';
    }

    // Clean up the name: decode URL-encoded text and normalize separators
    name = safeDecode(name).replace(/_/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

    setProjectName(name || 'Gallery');
  }, [decodedFolderPath]);

  const fetchFolderItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let prefix = decodedFolderPath;
      if (prefix && !prefix.endsWith('/')) {
        prefix += '/';
      }
      if (prefix.startsWith('/')) {
        prefix = prefix.slice(1);
      }
      const foldersResponse = await fetch(
        rawStoriesApiUrl(`/default/getallimages?prefix=${encodeURIComponent(prefix)}`),
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors',
        }
      );
      if (!foldersResponse.ok) {
        throw new Error(`Failed to fetch folders: ${foldersResponse.statusText}`);
      }
      const foldersData: ApiResponse = await foldersResponse.json();
      const mappedFolders: FolderItem[] = foldersData.folders ? foldersData.folders.map((folder: any) => ({
        name: folder.name,
        path: folder.path,
      })) : [];
      setFolders(mappedFolders);
      const imagesResponse = await fetch(
        rawStoriesApiUrl(`/default/getallimages?prefix=${encodeURIComponent(prefix)}&recursive=true`),
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors',
        }
      );
      if (!imagesResponse.ok) {
        throw new Error(`Failed to fetch images: ${imagesResponse.statusText}`);
      }
      const data: ApiResponse = await imagesResponse.json();
      if (!data || !Array.isArray(data.files)) {
        throw new Error('Unexpected API response format');
      }
      const mappedItems: GalleryItem[] = data.files
        .map((item: any) => {
          if (!item.key || typeof item.key !== 'string' || !item.key.includes('/') || item.key.trim() === '' || !item.key.match(/\.(jpg|jpeg|png|gif|mp4|mov|avi|wmv|mkv)$/i)) {
            return null;
          }
          const keyParts = item.key.split('/');
          const rawTitle = keyParts.pop() || 'Untitled';
          const title = rawTitle.replace(/\.[^/.]+$/, '');
          let eventDate = item.last_modified ? item.last_modified.split('T')[0] : '';
          const dateMatch = title.match(/(\d{4})(\d{2})(\d{2})/);
          if (dateMatch) {
            eventDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          }
          const isVideo = !!item.key.match(/\.(mp4|mov|avi|wmv|mkv)$/i);
          const folderPath = keyParts.join('/');
          const subfolderName = folderPath.replace(prefix, '').split('/')[0] || 'Main Folder';
          return {
            id: item.key,
            shootType: title.includes('IMG') ? 'Portrait' : title.includes('Snapchat') ? 'Casual' : 'Unknown',
            eventDate,
            imageUrl: item.presigned_url || item.url || 'https://picsum.photos/400/300',
            title: `${subfolderName}: ${title}`,
            uploadDate: item.last_modified ? item.last_modified.split('T')[0] : '',
            isWatermarked: false,
            isPinProtected: false,
            isFavorite: false,
            key: item.key,
            isVideo,
          } as GalleryItem;
        })
        .filter((item): item is GalleryItem => item !== null);
      setItems(mappedItems);

      // Set hero image as first image if available
      if (mappedItems.length > 0 && !mappedItems[0].isVideo) {
        setHeroImage(mappedItems[0].imageUrl);
      }
    } catch (err: any) {
      setError(`Failed to load folder items: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [decodedFolderPath]);

  useEffect(() => {
    // Only fetch folder items if we have access and are not checking access
    if (hasAccess && !isCheckingAccess && !isPinRequired && !isAccessDenied) {
      fetchFolderItems();
      setCurrentPage(1);
    }
  }, [hasAccess, isCheckingAccess, isPinRequired, isAccessDenied, fetchFolderItems]);

  // Preload initial images and warm Cache API for same-origin only (silent, no UI state)
  useEffect(() => {
    if (items.length === 0) return;
    const preloadCount = Math.min(12, items.length);
    const toPreload = items.slice(0, preloadCount).map(i => i.imageUrl);

    // Best-effort Cache API warm-up for same-origin URLs only (avoid CORS console noise)
    (async () => {
      try {
        if (!('caches' in window)) return;
        const cache = await caches.open('apfe-image-cache');
        const sameOrigin = toPreload.filter((u) => {
          try { return new URL(u, window.location.href).origin === window.location.origin; } catch { return false; }
        });
        await Promise.all(sameOrigin.map(async (url) => {
          try { await cache.add(url); } catch {}
        }));
      } catch {}
    })();

    const imgs: HTMLImageElement[] = [];
    toPreload.forEach((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      imgs.push(img);
    });

    return () => {
      imgs.forEach((im) => { im.onload = null; im.onerror = null; });
    };
  }, [items]);

  const handleItemFavorite = async (itemId: string) => {
    const isCurrentlyFavorited = favoritedItems.includes(itemId);
    const newFavoritedItems = isCurrentlyFavorited
      ? favoritedItems.filter(id => id !== itemId)
      : [...favoritedItems, itemId];
    setFavoritedItems(newFavoritedItems);
    if (!isCurrentlyFavorited) {
      const item = items.find(item => item.id === itemId);
      if (!item || !item.key) {
        addNotification('Image not found', 'error');
        setFavoritedItems(favoritedItems); // Revert selection
        return;
      }
      try {
        const folderName = 'client%20selection';
        const sourceFolder = decodedFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
        const result = await createFavoritesFolderAPI({
          folderName,
          imageKeys: [item.key],
          sourceFolder,
        });
        if (result.success) {
          addNotification(`Image added to "${projectName}" folder under client selection`, 'success');
        } else {
          throw new Error('Failed to add image to client selection folder');
        }
      } catch (err: any) {
        addNotification(`Failed to add image to client selection: ${err.message}`, 'error');
        setFavoritedItems(favoritedItems.filter(id => id !== itemId));
      }
    } else {
      addNotification('Image removed from selection', 'info');
    }
  };

  const handleFavoriteAll = async () => {
    if (favoritedItems.length === items.length) {
      setFavoritedItems([]);
      addNotification('All images unselected', 'info');
    } else {
      const newFavoritedItems = items.map(item => item.id);
      setFavoritedItems(newFavoritedItems);
      const imageKeys = items
        .map(item => item.key)
        .filter((key): key is string => !!key && typeof key === 'string' && key.includes('/') && key.trim() !== '');
      if (imageKeys.length === 0) {
        addNotification('No valid images to favorite', 'error');
        setFavoritedItems([]);
        return;
      }
      try {
        const folderName = 'client%20selection';
        const sourceFolder = decodedFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
        const result = await createFavoritesFolderAPI({
          folderName,
          imageKeys,
          sourceFolder,
        });
        if (result.success) {
          addNotification(`${imageKeys.length} images added to "${projectName}" folder under client selection`, 'success');
        } else {
          throw new Error('Failed to add images to client selection folder');
        }
      } catch (err: any) {
        addNotification(`Failed to add images to client selection: ${err.message}`, 'error');
        setFavoritedItems([]);
      }
    }
  };

  const handleFolderClick = (folderPath: string) => {
    const encodedPath = encodeURIComponent(folderPath);
    navigate(`/shared-images/${encodedPath}`);
  };

  // Download-only selection (separate from favorites)
  const handleToggleDownloadSelect = (itemId: string) => {
    setDownloadSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    // Ensure uniqueness even for multiple notifications in the same millisecond
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleBackToGallery = () => {
    window.history.back();
  };

  // fetchAllImages was previously used by a different download flow; removed as unused.

  // Download using backend presigned URLs for each key.
  const downloadWithLambda = async (fileKeys: string[], zipName: string) => {
    try {
      if (!Array.isArray(fileKeys) || fileKeys.length === 0) return false;

      let successCount = 0;
      for (let i = 0; i < fileKeys.length; i++) {
        const key = fileKeys[i];
        const query = new URLSearchParams({ key });
        if (shareId) query.set('shareId', shareId);

        const presignRes = await fetch(rawStoriesApiUrl(`/default/downloadimage?${query.toString()}`), {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const presignData = await presignRes.json().catch(() => null);
        if (!presignRes.ok || !presignData?.success || !presignData?.url) {
          continue;
        }

        const mediaRes = await fetch(presignData.url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-cache',
        });
        if (!mediaRes.ok) {
          continue;
        }

        const blob = await mediaRes.blob();
        const rawName = key.split('/').pop() || `download_${i + 1}`;
        const baseName = rawName.replace(/\.[^.]+$/, '') || `download_${i + 1}`;
        const ext = rawName.includes('.') ? rawName.split('.').pop() : '';
        const safeBase = baseName.replace(/[\\/:*?"<>|]/g, '_').trim();
        const fallbackBase = (zipName || 'download').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'download';
        const fileName = fileKeys.length === 1
          ? `${fallbackBase}${ext ? `.${ext}` : ''}`
          : `${safeBase}${ext ? `.${ext}` : ''}`;

        saveAs(blob, fileName);
        successCount += 1;
      }

      if (successCount === 0) {
        addNotification('Download failed for all selected files', 'error');
        return false;
      }

      return successCount === fileKeys.length;
    } catch (err: any) {
      console.error('Download error:', err);
      addNotification(`Download failed: ${err.message}`, 'error');
      return false;
    }
  };

  // Robust server fallback: try batches; on failure, split into smaller chunks down to single-file zips
  const downloadWithLambdaBatched = async (
    keys: string[],
    baseZipName: string,
    initialBatchSize: number = 25
  ): Promise<number> => {
    let success = 0;

    const tryRange = async (range: string[], nameBase: string, batchSize: number): Promise<void> => {
      if (range.length === 0) return;
      if (batchSize <= 1) {
        for (let i = 0; i < range.length; i++) {
          const ok = await downloadWithLambda([range[i]], `${nameBase}_single_${i + 1}.zip`);
          if (ok) success += 1;
        }
        return;
      }

      for (let start = 0, part = 1; start < range.length; start += batchSize, part++) {
        const end = Math.min(start + batchSize, range.length);
        const batch = range.slice(start, end);
        const name = range.length > batchSize ? `${nameBase}_part${part}.zip` : `${nameBase}.zip`;
        const ok = await downloadWithLambda(batch, name);
        if (ok) {
          success += batch.length;
        } else {
          const mid = Math.floor(batch.length / 2);
          await tryRange(batch.slice(0, mid), `${nameBase}_a${part}`, Math.max(1, Math.floor(batchSize / 2)));
          await tryRange(batch.slice(mid), `${nameBase}_b${part}`, Math.max(1, Math.floor(batchSize / 2)));
        }
      }
    };

    await tryRange(keys, baseZipName, Math.max(1, initialBatchSize));
    return success;
  };



const handleDownloadSelected = async (downloadAll: boolean = false): Promise<number> => {
  if (!permissions.canDownload) {
    addNotification('Downloads are not permitted in this gallery', 'error');
    return 0;
  }

  const itemsToDownload = downloadAll
    ? items
    : downloadSelectedItems.length > 0
      ? items.filter(item => downloadSelectedItems.includes(item.id))
      : [];

  if (itemsToDownload.length === 0) {
    addNotification('No items selected for download', 'error');
    return 0;
  }

  // CASE 1: ≤20 images → Direct download to user's Downloads folder (silent, perfect filename)
  if (itemsToDownload.length <= 20) {
    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: itemsToDownload.length });

    let successCount = 0;

    for (let i = 0; i < itemsToDownload.length; i++) {
      const item = itemsToDownload[i];
      const url = item.imageUrl;

      try {
        // This fetch works 100% with Wasabi pre-signed URLs
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',        // CRITICAL: fixes CORS wildcard issue
          cache: 'no-cache',
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();

        // Build perfect filename
        const urlPart = url.split('?')[0];
        const extension = urlPart.split('.').pop()?.toLowerCase() || (item.isVideo ? 'mp4' : 'jpg');
        const safeTitle = (item.title || `image_${i + 1}`)
          .replace(/[\\/:*?"<>|]/g, '_')
          .trim();
        const filename = `${safeTitle}.${extension}`;

        // Save directly without using an anchor tag
        saveAs(blob, filename);

        successCount++;
      } catch (err) {
        console.error('Download failed for:', url, err);
        addNotification(`Failed: ${item.title || 'one image'}`, 'warning');
      }

      setDownloadProgress({ current: i + 1, total: itemsToDownload.length });
      await new Promise(r => setTimeout(r, 300)); // Prevents popup blocking
    }

    setIsDownloading(false);
    addNotification(`Successfully saved ${successCount} image(s) to your Downloads folder!`, 'success');
    return successCount;
  }

  // CASE 2: >20 images → Your existing ZIP + Lambda fallback (keep your working code)
  setIsDownloading(true);
  setDownloadProgress({ current: 0, total: itemsToDownload.length });

  const zip = new JSZip();
  const folder = zip.folder('RawStoriesbyrakesh')!;
  let clientSuccess = 0;
  const failedKeys: string[] = [];
  let warned = false;

  const CONCURRENCY = 6;
  let index = 0;

  const worker = async (): Promise<void> => {
    const i = index++;
    if (i >= itemsToDownload.length) return;

    const item = itemsToDownload[i];
    try {
      const res = await fetch(item.imageUrl, { credentials: 'omit' });
      if (!res.ok) throw new Error('Failed');

      const buffer = await res.arrayBuffer();
      const urlPart = item.imageUrl.split('?')[0];
      const ext = (urlPart.split('.').pop() || (item.isVideo ? 'mp4' : 'jpg')).toLowerCase();
      const name = (item.title || `item_${i + 1}`).replace(/[\\/:*?"<>|]/g, '_');
      folder.file(`${name}.${ext}`, buffer, { binary: true });
      clientSuccess++;
    } catch (e) {
      if (!warned) {
        addNotification('Some files blocked. Using server backup...', 'info');
        warned = true;
      }
      if (item.key) failedKeys.push(item.key);
    } finally {
      setDownloadProgress(prev => ({
        current: Math.min(prev.current + 1, itemsToDownload.length),
        total: itemsToDownload.length
      }));
    }
    await worker();
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, itemsToDownload.length) }, worker));

  // Generate ZIP
  addNotification('Creating ZIP file...', 'info');
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  saveAs(zipBlob, `RawStoriesbyrakesh_${new Date().toISOString().slice(0,10)}.zip`);

  // Remaining via Lambda
  if (failedKeys.length > 0) {
    addNotification(`Downloading ${failedKeys.length} remaining files via server...`, 'info');
    await downloadWithLambdaBatched(failedKeys, `RawStoriesbyrakesh_remaining_${new Date().toISOString().slice(0,10)}`, 20);
  }

  setIsDownloading(false);
  addNotification(`Downloaded ${clientSuccess + failedKeys.length} items!`, 'success');
  return clientSuccess + failedKeys.length;
};

  const openDownloadFlow = () => {
    setIsDownloadModalOpen(true);
    setDownloadStep(1);
  };

  const sendDownloadEmail = async (email: string, total: number, successful: number) => {
    try {
      const res = await fetch(rawStoriesApiUrl('/default/mailsend'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: `Your ${galleryTitle} download ${successful === total ? 'completed' : 'finished'} (${successful}/${total})`,
          proposalId: `download-${Date.now()}`,
          html: `<p>Hi,</p><p>Your download for <strong>${galleryTitle}</strong> has ${successful === total ? 'completed successfully' : 'finished'}.</p><p>Items downloaded: <strong>${successful}</strong> of <strong>${total}</strong>.</p><p>Date: ${new Date().toLocaleString()}</p><p>Thank you,<br/>RawStoriesbyrakesh</p>`
        })
      });
      if (res.ok) {
        addNotification('We will notify you by email once your download is complete', 'success');
      } else {
        addNotification('Email service responded with an error.', 'error');
      }
    } catch (e:any) {
      addNotification(`Failed to send email notification: ${e.message}`, 'error');
    } 
  };

  const handleDownloadCurrentImage = async () => {
    if (selectedImageIndex !== null) {
      const item = items[selectedImageIndex];
      if (!item.key) {
        addNotification('Cannot download this item: missing file key', 'error');
        return;
      }

      const success = await downloadWithLambda([item.key], `RawStoriesbyrakesh_${item.title}.zip`);
      if (success) {
        addNotification('Item downloaded', 'success');
      }
    }
  };

  const handleViewImage = (index: number) => {
    setSelectedImageIndex(index);
    setIsImageModalOpen(true);
  };

  const handleCloseImageModal = () => {
    setIsImageModalOpen(false);
    setSelectedImageIndex(null);
  };

  const handleNextImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex < items.length - 1) {
      setSelectedImageIndex(selectedImageIndex + 1);
    }
  };

  const handlePrevImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex > 0) {
      setSelectedImageIndex(selectedImageIndex - 1);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isImageModalOpen || selectedImageIndex === null) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (selectedImageIndex > 0) {
            setSelectedImageIndex(selectedImageIndex - 1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (selectedImageIndex < items.length - 1) {
            setSelectedImageIndex(selectedImageIndex + 1);
          }
          break;
        case 'Escape':
          e.preventDefault();
          handleCloseImageModal();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isImageModalOpen, selectedImageIndex, items.length]);

  useEffect(() => {
    if (isImageModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isImageModalOpen]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = items.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(items.length / itemsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  useEffect(() => {
    setCurrentPage(1);
  }, [items.length]);

  // Access Denied Popup
  if (isAccessDenied) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md border border-amber-100">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-red-50 rounded-full mb-6">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="text-3xl font-light text-gray-900 mb-3 tracking-tight">Access Denied</h2>
            <p className="text-gray-600 text-base leading-relaxed">
              You don't have the access to this shared folder. The link may have been revoked or expired.
            </p>
          </div>
          {/* 'Go to Home' removed for shared pages */}
        </div>
      </div>
    );
  }

  // Loading state while checking access
  if (isCheckingAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-amber-600" />
          <p className="text-amber-700 font-light">Checking access permissions...</p>
        </div>
      </div>
    );
  }

  // PIN Protection Modal
  if (isPinRequired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md border border-amber-100">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-100 to-amber-200 rounded-full mb-6">
              <Lock className="h-10 w-10 text-amber-700" />
            </div>
            <h2 className="text-3xl font-light text-gray-900 mb-3 tracking-tight">PIN Required</h2>
            <p className="text-gray-600 text-base leading-relaxed">This shared folder is protected. Enter the PIN provided to you to continue.</p>
          </div>

          <div className="space-y-6">
            <div>
              <input
                type="text"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isVerifyingPin && handlePinSubmit()}
                placeholder="Enter PIN"
                maxLength={6}
                disabled={isVerifyingPin}
                className="w-full px-6 py-4 border-2 border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-center text-2xl tracking-[0.3em] font-light text-gray-900 placeholder-amber-400 transition-all disabled:opacity-50"
                autoFocus
              />
              {pinError && (
                <p className="mt-3 text-sm text-red-600 flex items-center justify-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {pinError}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate(-1)}
                disabled={isVerifyingPin}
                className="flex-1 py-3 px-6 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handlePinSubmit}
                disabled={!pinInput || isVerifyingPin}
                className="flex-1 py-3 px-6 bg-amber-900 text-white rounded-xl hover:bg-amber-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
              >
                {isVerifyingPin ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Verifying...
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-amber-600" />
          <p className="text-amber-700 font-light">Loading...</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto">
          <AlertCircle className="h-16 w-16 text-amber-400 mx-auto mb-6" />
          <h2 className="text-2xl font-light text-gray-900 mb-3">Error Loading Gallery</h2>
          <p className="text-amber-700 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-amber-900 text-white rounded-lg hover:bg-amber-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  // Extract gallery title from path
  const getGalleryTitle = () => {
    if (!decodedFolderPath) return projectName;

    // Remove leading/trailing slashes and split
    const cleanPath = decodedFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
    const segments = cleanPath.split('/').filter(Boolean);

    // Get the last segment
    let title = segments.length > 0 ? segments[segments.length - 1] : cleanPath;
    title = safeDecode(title);

    // Clean up: replace underscores and hyphens with spaces, handle multiple spaces
    title = title.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

    // Capitalize first letter of each word
    title = title.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');

    return title || projectName;
  };

  const galleryTitle = getGalleryTitle();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50">
      {/* Hero Header with Image */}
      <header className="relative w-full h-screen min-h-[600px] overflow-hidden flex flex-col">
        {/* Hero Image Background */}
        {heroImage ? (
          <div className="absolute inset-0">
            <img
              src={heroImage}
              alt={galleryTitle}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djJoLTJ2LTJoMnptMC00djJoLTJ2LTJoMnptMC00djJoLTJ2LTJoMnptLTQtNHYyaC0ydi0yaDJ6Ii8+PC9nPjwvZz48L3N2Zz4=")' }} />
          </div>
        )}
        {/* Navigation Bar */}
        <div className="absolute top-0 left-0 right-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-20">
              <div className="flex items-center space-x-4 sm:space-x-6 flex-1 min-w-0">
                <button
                  onClick={handleBackToGallery}
                  className="flex items-center space-x-2 text-white/90 hover:text-white transition-colors group"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-sm font-medium hidden sm:inline">Home</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 sm:p-2.5 rounded-lg transition-all backdrop-blur-md ${
                    viewMode === 'grid'
                      ? 'bg-white/20 text-white shadow-lg'
                      : 'bg-white/10 text-white/70 hover:text-white hover:bg-white/20'
                  }`}
                  aria-label="Grid view"
                >
                  <Grid3X3 className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 sm:p-2.5 rounded-lg transition-all backdrop-blur-md ${
                    viewMode === 'list'
                      ? 'bg-white/20 text-white shadow-lg'
                      : 'bg-white/10 text-white/70 hover:text-white hover:bg-white/20'
                  }`}
                  aria-label="List view"
                >
                  <List className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Hero Content - Positioned at bottom */}
        <div className="relative z-10 w-full px-4 mt-auto mb-16">
          <div className="w-full max-w-3xl mx-auto text-center">
            <div className="text-white/80 text-xs sm:text-sm tracking-[0.15em] sm:tracking-[0.25em] uppercase mb-2 sm:mb-4">
              RawStoriesbyrakesh
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight mb-3">
              {galleryTitle}
            </h1>
            <p className="text-white/80 text-sm sm:text-base font-light mb-8">
              A curated collection of beautiful photography
            </p>
          </div>
        </div>
        
        {/* Scroll Indicator - Centered at bottom */}
        <div className="relative z-10 w-full flex justify-center pb-8">
          <a 
            href="#gallery" 
            className="text-white/90 hover:text-white transition-colors" 
            aria-label="Scroll to gallery"
          >
            <ChevronDown className="h-8 w-8 animate-bounce" />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main id="gallery" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {items.length > 0 && (
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={openDownloadFlow}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all text-sm font-medium shadow-sm"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </button>
            </div>
            <span className="text-sm text-gray-500 font-light">
              {items.length} {items.length === 1 ? 'image' : 'images'}
            </span>
          </div>
        )}
        {folders.length > 0 && (
          <div className="mb-12">
            <h2 className="text-lg font-light text-gray-900 mb-6 tracking-wide">Folders</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {folders.map((folder) => (
                <div
                  key={folder.path}
                  onClick={() => handleFolderClick(folder.path)}
                  className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100"
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                    <FolderPlus className="h-10 w-10 text-gray-400 group-hover:text-gray-600 group-hover:scale-110 transition-all duration-300" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-gray-900 truncate">{folder.name}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {items.length === 0 && folders.length === 0 ? (
          <div className="text-center py-24">
            <FolderPlus className="h-16 w-16 text-gray-300 mx-auto mb-6" />
            <h3 className="text-xl font-light text-gray-900 mb-2">Empty Gallery</h3>
            <p className="text-gray-500">No images or folders here yet.</p>
          </div>
        ) : items.length > 0 ? (
          <div>
            {folders.length > 0 && (
              <h2 className="text-lg font-light text-gray-900 mb-6 tracking-wide">Images & Videos</h2>
            )}
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6'
              : 'space-y-2 sm:space-y-3'
            }>
              {currentItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-300 cursor-pointer border border-gray-100/50 ${
                    favoritedItems.includes(item.id) ? 'ring-2 ring-red-500 ring-offset-2' : ''
                  } ${downloadSelectedItems.includes(item.id) ? 'ring-2 ring-indigo-500 ring-offset-2' : ''} ${viewMode === 'list' ? 'flex items-center gap-3 p-3 sm:gap-4 sm:p-4' : 'mb-4 sm:mb-6 break-inside-avoid'}`}
                  style={{ contentVisibility: 'auto' }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemFavorite(item.id);
                    }}
                    className={`absolute top-3 right-3 z-10 p-2 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 ${
                      favoritedItems.includes(item.id)
                        ? 'bg-red-500/90 text-white shadow-lg'
                        : 'bg-white/90 text-gray-400 hover:text-red-500 hover:bg-white shadow-sm'
                    }`}
                    aria-label={favoritedItems.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className="h-4 w-4" fill={favoritedItems.includes(item.id) ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleDownloadSelect(item.id);
                    }}
                    className={`absolute top-3 left-3 z-10 p-2 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 ${
                      downloadSelectedItems.includes(item.id)
                        ? 'bg-indigo-600/90 text-white shadow-lg'
                        : 'bg-white/90 text-gray-500 hover:text-indigo-600 hover:bg-white shadow-sm'
                    }`}
                    aria-label={downloadSelectedItems.includes(item.id) ? 'Unselect for download' : 'Select for download'}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <div
                    className={`relative ${viewMode === 'list' ? 'w-28 h-20 sm:w-32 sm:h-24 flex-shrink-0 rounded-lg overflow-hidden' : 'aspect-[3/4] w-full rounded-lg overflow-hidden'}`}
                    onClick={() => handleViewImage(indexOfFirstItem + index)}
                  >
                    {item.isVideo ? (
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center relative">
                        <Play className="h-10 w-10 sm:h-12 sm:w-12 text-white/90 drop-shadow-lg" />
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 text-[10px] rounded-full flex items-center gap-1">
                          <Play className="h-3 w-3" />
                          <span>Video</span>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.src = 'https://via.placeholder.com/300x300?text=Image+Not+Available';
                          addNotification(`Failed to load ${item.title}`, 'error');
                        }}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Eye className="h-8 w-8 text-white drop-shadow-lg" />
                    </div>
                  </div>
                  {viewMode === 'list' && (
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">{item.title}</h3>
                      <p className="text-xs text-gray-500 mt-1">{item.eventDate}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-between gap-3 text-sm">
                <button
                  onClick={() => currentPage > 1 && paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`inline-flex items-center gap-1 px-3 py-2 rounded-full border text-xs sm:text-sm ${
                    currentPage === 1
                      ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>

                <div className="flex flex-col items-center justify-center">
                  <span className="text-[11px] uppercase tracking-wide text-gray-400">Page</span>
                  <span className="text-sm font-medium text-gray-800">
                    {currentPage} / {totalPages}
                  </span>
                </div>

                <button
                  onClick={() => currentPage < totalPages && paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`inline-flex items-center gap-1 px-3 py-2 rounded-full border text-xs sm:text-sm ${
                    currentPage === totalPages
                      ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                  }`}
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </main>
      {/* Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`px-5 py-3 rounded-xl shadow-2xl max-w-sm flex items-center gap-3 backdrop-blur-md animate-fade-in ${
              notification.type === 'success'
                ? 'bg-green-500/90 text-white'
                : notification.type === 'error'
                ? 'bg-red-500/90 text-white'
                : 'bg-gray-900/90 text-white'
            }`}
          >
            {notification.type === 'success' && <Check className="h-5 w-5 flex-shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="h-5 w-5 flex-shrink-0" />}
            <span className="text-sm font-medium flex-1">{notification.message}</span>
            <button
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {/* Download progress bar */}
      {isDownloading && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="h-1 bg-gray-200">
            <div
              className="h-1 bg-gray-900 transition-all"
              style={{ width: `${downloadProgress.total ? (downloadProgress.current / downloadProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      {/* Preloading runs silently without UI */}
      {/* Download Flow Modal */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-md mx-auto rounded-2xl bg-white shadow-2xl p-6">
            {/* Close Button */}
            <button
              onClick={() => setIsDownloadModalOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Download photos & videos</h2>
                <p className="text-xs text-gray-500">Files will be saved directly to your device.</p>
              </div>
            </div>

            {downloadStep === 1 && (
              <div className="space-y-4">
                {/* Email Input */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e)=>setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">If provided, we&apos;ll send a confirmation email.</p>
                </div>

                {/* Simple gallery info */}
                <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <span className="truncate max-w-[60%]">{galleryTitle}</span>
                  <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={() => setIsDownloadModalOpen(false)} 
                    className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={()=>setDownloadStep(3)}
                    // Email is optional: allow empty, but if provided it must be valid
                    disabled={!!emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)}
                    className="flex-1 px-3 py-2 rounded-md bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {downloadStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Download options</h3>

                {/* Status Message */}
                {downloadInlineMsg && (
                  <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    {downloadInlineMsg}
                  </div>
                )}

                {/* Progress Bar */}
                {isModalProcessing && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-600">
                      <span>Downloading...</span>
                      <span>{downloadProgress.current}/{downloadProgress.total || 0}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-2 bg-gray-900 transition-all duration-300"
                        style={{ width: `${downloadProgress.total ? Math.round((downloadProgress.current / downloadProgress.total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Download Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={async ()=>{
                      const total = downloadSelectedItems.length;
                      if (total === 0) return;
                      setIsModalProcessing(true);
                      setModalProcessingAction('selected');
                      setDownloadInlineMsg('Downloading your selected images...');
                      const success = await handleDownloadSelected(false);
                      if (emailInput) { setDownloadInlineMsg('Finalizing... sending email confirmation.'); await sendDownloadEmail(emailInput, total, success); }
                      setDownloadInlineMsg('Done. A confirmation email has been sent. You may close this dialog.');
                      setIsModalProcessing(false);
                      setModalProcessingAction(null);
                    }}
                    disabled={downloadSelectedItems.length === 0 || isModalProcessing}
                    className={`w-full px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      downloadSelectedItems.length === 0 || isModalProcessing
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {isModalProcessing && modalProcessingAction === 'selected' ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Downloading Selected ({downloadProgress.current}/{downloadProgress.total || downloadSelectedItems.length})
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Download className="h-5 w-5" />
                        Download Selected ({downloadSelectedItems.length})
                      </span>
                    )}
                  </button>

                  <button
                    onClick={async ()=>{
                      const total = items.length;
                      setIsModalProcessing(true);
                      setModalProcessingAction('all');
                      setDownloadInlineMsg('Downloading all images...');
                      const success = await handleDownloadSelected(true);
                      if (emailInput) { setDownloadInlineMsg('Finalizing... sending email confirmation.'); await sendDownloadEmail(emailInput, total, success); }
                      setDownloadInlineMsg('Done. A confirmation email has been sent. You may close this dialog.');
                      setIsModalProcessing(false);
                      setModalProcessingAction(null);
                    }}
                    disabled={isModalProcessing}
                    className={`w-full px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isModalProcessing
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {isModalProcessing && modalProcessingAction === 'all' ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Downloading All ({downloadProgress.current}/{downloadProgress.total || items.length})
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Package className="h-5 w-5" />
                        Download All ({items.length})
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => !isModalProcessing && setIsDownloadModalOpen(false)}
                    disabled={isModalProcessing}
                    className={`w-full px-4 py-2.5 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors ${
                      isModalProcessing ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Image Viewer Modal */}
      {isImageModalOpen && selectedImageIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={handleCloseImageModal}
        >
          <div
            className="relative w-full h-full max-w-7xl max-h-[100vh] p-4 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={handleCloseImageModal}
              className="absolute top-6 right-6 z-20 p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all hover:scale-110"
            >
              <X className="h-6 w-6" />
            </button>
            {/* Navigation Buttons */}
            {selectedImageIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 z-20 p-4 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all hover:scale-110"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
            )}
            {selectedImageIndex < items.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 z-20 p-4 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all hover:scale-110"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            )}
            {/* Image/Video */}
            <div className="flex items-center justify-center h-full w-full">
              {items[selectedImageIndex]?.isVideo ? (
                <video
                  src={items[selectedImageIndex]?.imageUrl}
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                  controls
                  autoPlay
                  loop
                  onClick={(e) => e.stopPropagation()}
                  onError={() => addNotification('Failed to load video', 'error')}
                />
              ) : (
                <img
                  src={items[selectedImageIndex]?.imageUrl}
                  alt={items[selectedImageIndex]?.title}
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                  onError={(e) => {
                    e.currentTarget.src = 'https://via.placeholder.com/300x300?text=Image+Not+Available';
                    addNotification('Failed to load image', 'error');
                  }}
                />
              )}
            </div>
            {/* Bottom Info Bar */}
            <div className="absolute bottom-6 left-0 right-0 z-20">
              <div className="mx-auto max-w-4xl bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white border border-white/20">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-light truncate mb-1">{items[selectedImageIndex]?.title}</h3>
                    <p className="text-sm opacity-80 font-light">
                      {items[selectedImageIndex]?.eventDate} • Image {selectedImageIndex + 1} of {items.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemFavorite(items[selectedImageIndex].id);
                      }}
                      className={`p-3 rounded-full backdrop-blur-md transition-all hover:scale-110 ${
                        favoritedItems.includes(items[selectedImageIndex].id)
                          ? 'bg-red-500/90 text-white'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      <Heart className="h-5 w-5" fill={favoritedItems.includes(items[selectedImageIndex].id) ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadCurrentImage();
                      }}
                      className="p-3 rounded-full bg-white/10 backdrop-blur-md text-white hover:bg-white/20 transition-all hover:scale-110"
                    >
                      <Download className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Enhanced Footer */}
      <footer className="bg-gradient-to-t from-stone-900 to-stone-800 text-white mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
            {/* Brand Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Camera className="h-6 w-6 text-white" />
                <h3 className="text-xl font-light tracking-wide">RawStoriesbyrakesh</h3>
              </div>
              <p className="text-sm text-gray-400 font-light leading-relaxed max-w-xs">
                Capturing life&apos;s most precious moments with professional photography services.
                Your memories, beautifully preserved.
              </p>
            </div>
            {/* Contact Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Contact</h4>
              <div className="space-y-3">
                <a
                  href="mailto:arifphotographyprimerpro@gmail.com"
                  className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors group"
                >
                  <Mail className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-light">arifphotographyprimerpro@gmail.com</span>
                </a>
                <a
                  href="tel:+1234567890"
                  className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors group"
                >
                  <Phone className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-light">+1 (234) 567-890</span>
                </a>
              </div>
            </div>
            {/* Social & Links Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Follow Us</h4>
              <div className="flex items-center gap-4">
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors group"
                  aria-label="Instagram"
                >
                  <Instagram className="h-5 w-5 text-gray-400 group-hover:text-white transition-colors" />
                </a>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors group"
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5 text-gray-400 group-hover:text-white transition-colors" />
                </a>
              </div>
              <div className="pt-4 border-t border-white/10">
                <p className="text-xs text-gray-500 font-light">
                  &copy; {new Date().getFullYear()} RawStoriesbyrakesh | All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default SharedImages;
