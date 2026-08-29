import React, { useState, useEffect, Component, ErrorInfo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
// Sidebar and Header removed per request - gallery management UI is self-contained
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Plus,
  Search,
  Eye,
  Trash2,
  Image,
  Download,
  Share2,
  Loader2,
  AlertCircle,
  Folder,
  Grid3X3,
  List,
  Filter,
  SortAsc,
  SortDesc,
  Star,
  ChevronRight,
  ChevronLeft,
  X,
  Copy,
  Play,
  Upload,
  GripVertical,
  Edit2,
  Lock,
} from 'lucide-react';
import { rawStoriesApiUrl, getRawStoriesToken } from '../api/rawStoriesBackend';

// -------------------- Interfaces --------------------
interface GalleryItem {
  id: string;
  shootType: string;
  eventDate: string;
  imageUrl: string;
  title: string;
  filename: string; // Added for accurate download filename
  uploadDate: string;
  isWatermarked: boolean;
  isPinProtected: boolean;
  isFavorite?: boolean;
  key?: string;
  isVideo?: boolean;
  order?: number; // for custom manual ordering
}

interface FolderItem {
  name: string;
  path: string;
}

type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';

interface WatermarkPreset {
  id: string;
  imageUrl: string; // Base64 or URL of watermark image
  imageName: string; // Name of the watermark image
  position: WatermarkPosition;
  lastUsed: number;
}

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  startTime?: number; // For speed calculation
  lastLoaded?: number; // For speed calculation
  lastTime?: number; // For speed calculation
  speed?: number; // Current upload speed in KB/s
  watermarkPosition?: WatermarkPosition; // Watermark position for this file
  processedFile?: File; // File after watermark is applied
  relativePath?: string; // Relative path for folder uploads
}

interface DeleteError {
  Key: string;
  Code?: string;
  Message?: string;
}

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface PresignedUpload {
  url: string;
  key: string;
}

// -------------------- Error Boundary --------------------
class GalleryErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(_: Error): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error in Gallery component:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-12">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[#2D2D2D] mb-2">Something went wrong</h3>
          <p className="text-gray-500">Please try refreshing the page or contact support.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// -------------------- Configuration --------------------
// main POST share endpoint (your API Gateway endpoint - POST only)
const SHARE_API = rawStoriesApiUrl('/default/sharelink');
// backend endpoint to register/access shared folder links
const SHARE_API_ACCESS = rawStoriesApiUrl('/default/SharedLinkAccess');

// If you want a default TTL for presigned links, set it here:
const DEFAULT_EXPIRY_SECONDS = 3600;

// Upload batch size for presigned URLs (to avoid request size limits)
const PRESIGNED_BATCH_SIZE = 200;

// Max concurrent uploads (to avoid overwhelming network/S3)
const MAX_CONCURRENT_UPLOADS = 20;

const PRE_SIGNED_URL_CACHE = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 120000; // 2 minutes

// -------------------- Main Component --------------------
function Gallery() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = decodeURIComponent(location.pathname.replace('/gallery', ''));
  // sidebar removed; gallery takes full width
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const processGalleryData = (data: any) => {
    const mappedItems: GalleryItem[] = data.files.map((item: any, idx: number) => {
      const keyParts = item.key.split('/');
      const rawFilename = keyParts.pop() || 'Untitled.jpg';
      const title = safeDecode(rawFilename.replace(/\.[^/.]+$/, ''));
      let eventDate = item.last_modified ? item.last_modified.split('T')[0] : '';
      const dateMatch = title.match(/(\d{4})(\d{2})(\d{2})/);
      if (dateMatch) {
        eventDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      }
      const isVideo = !!item.key.match(/\.(mp4|mov|avi|wmv|mkv)$/i);
      let shootType = 'Unknown';
      if (title.includes('IMG')) shootType = 'Portrait';
      else if (title.includes('Snapchat')) shootType = 'Casual';
      return {
        id: item.key,
        shootType,
        eventDate,
        imageUrl: item.presigned_url || item.url || 'https://picsum.photos/400/300',
        title,
        filename: rawFilename,
        uploadDate: item.last_modified ? item.last_modified.split('T')[0] : '',
        isWatermarked: false,
        isPinProtected: false,
        isFavorite: false,
        key: item.key,
        isVideo,
        order: idx,
      };
    });

    const mappedFolders: FolderItem[] = data.folders.map((f: any) => ({
      name: f.name || f.path.replace(/\/$/, '').split('/').pop() || 'Folder',
      path: f.path,
    }));

    setItems(mappedItems);
    setFolders(mappedFolders);
  };

  const fetchGalleryItems = async () => {
    let prefix = currentPath;
    if (prefix && !prefix.endsWith('/')) prefix += '/';
    if (prefix.startsWith('/')) prefix = prefix.slice(1);

    const cached = PRE_SIGNED_URL_CACHE.get(prefix);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      processGalleryData(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch(
        rawStoriesApiUrl(`/default/getallimages?prefix=${encodeURIComponent(prefix)}`),
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
          mode: 'cors',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch items: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.files) || !Array.isArray(data.folders)) {
        throw new Error('Unexpected API response format');
      }

      PRE_SIGNED_URL_CACHE.set(prefix, { data, timestamp: Date.now() });
      processGalleryData(data);
    } catch (err: any) {
      console.error('Error loading gallery items:', err);
      if (!cached) {
        setError(err.message || 'Failed to load gallery items');
      }
    } finally {
      setLoading(false);
    }
  };
  const [deleteLoading, setDeleteLoading] = useState<string[]>([]);
  const [isRotating, setIsRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteErrors, setDeleteErrors] = useState<DeleteError[]>([]);
  const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; currentImage: GalleryItem | null; }>({ isOpen: false, currentImage: null });
  const [shareModal, setShareModal] = useState<{ 
    isOpen: boolean; 
    links: string[]; 
    serverMessage?: string | null;
    sharePin?: string;
  }>({ isOpen: false, links: [], serverMessage: null, sharePin: '' });
  const [sharePin, setSharePin] = useState('');
  const [shareExpiryDays, setShareExpiryDays] = useState<number>(7);
  const [activeShareLinks, setActiveShareLinks] = useState<Array<{
    id: string;
    link: string;
    createdAt: number;
    hasPin: boolean;
    isActive: boolean;
    items: string[];
    sharedId?: string; // Backend sharedId for revoke/status APIs
  }>>([]);
  const [createFolderModal, setCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderPreset, setFolderPreset] = useState('none');
  const [imageListModal, setImageListModal] = useState<{ isOpen: boolean; folderName: string; images: string[] }>({ isOpen: false, folderName: '', images: [] });
  const [selectedImagesModal, setSelectedImagesModal] = useState<{ isOpen: boolean; images: string[] }>({ isOpen: false, images: [] });
  const [filters, setFilters] = useState({
    month: '',
    shootType: '',
    search: '',
    favorites: false,
    watermarked: false,
    pinProtected: false,
  });
  const [sortBy, setSortBy] = useState('uploadDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createFolderLoading, setCreateFolderLoading] = useState(false); // New: Loader for folder creation
  const [renameFolderModal, setRenameFolderModal] = useState({ isOpen: false, oldPath: '', newName: '' });
  const [renameFolderLoading, setRenameFolderLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false); // New: Loader for share
  const [bulkDownloadLoading, setBulkDownloadLoading] = useState(false); // New: Loader for bulk download
  const [imageListLoading, setImageListLoading] = useState(false); // New: Loader for image list
  const [dragActive, setDragActive] = useState(false); // For drag and drop
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set()); // Track loaded images
  const [dragId, setDragId] = useState<string | null>(null); // For image reordering drag
  const [dragOverId, setDragOverId] = useState<string | null>(null); // Track which item is being dragged over
  const dragJustEndedRef = useRef(false); // Track if drag just ended to prevent click
  const [watermarkEnabled, setWatermarkEnabled] = useState(false); // Enable watermark for uploads
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottom-right'); // Default watermark position
  const [watermarkImage, setWatermarkImage] = useState<string | null>(null); // Watermark image (base64)
  const [watermarkImageName, setWatermarkImageName] = useState<string>(''); // Watermark image name
  const [uploadModal, setUploadModal] = useState(false); // Upload modal state
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [lightboxImageLoaded, setLightboxImageLoaded] = useState(false);
  const itemsPerPage = 12; // Decreased from 24 to 12 for faster image loading
  const [savedWatermarks, setSavedWatermarks] = useState<WatermarkPreset[]>(() => {
    // Load saved watermarks from localStorage on init
    try {
      const saved = localStorage.getItem('watermarkPresets');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to load watermark presets:', error);
      return [];
    }
  });

  const shootTypes = [
    'Wedding',
    'Pre-Wedding',
    'Maternity',
    'Corporate',
    'Portrait',
    'Events',
    'Casual',
    'Unknown',
  ];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  // When inside a folder, show a compact, uniform thumbnail grid like Image 2
  const compactView = currentPath.split('/').some(Boolean);

  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  // -------------------- Notifications --------------------
  const addNotification = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substring(2, 11);
    setNotifications((prev) => [...prev, { id, message, type }]);
    // auto-dismiss
    const timeoutId = setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
    return () => clearTimeout(timeoutId);
  };

  // -------------------- Recursive Directory Reader --------------------
  const traverseFileTree = async (entry: any, path: string = ''): Promise<{ file: File; relativePath: string }[]> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          const relativePath = path ? `${path}/${file.name}` : file.name;
          resolve([{ file, relativePath }]);
        }, () => resolve([]));
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries: any[] = [];
        const readEntries = () => {
          dirReader.readEntries(async (result: any[]) => {
            if (!result.length) {
              const filesPromises = entries.map(e => traverseFileTree(e, path ? `${path}/${entry.name}` : entry.name));
              const nestedFiles = await Promise.all(filesPromises);
              resolve(nestedFiles.flat());
            } else {
              entries.push(...result);
              readEntries();
            }
          }, () => resolve([]));
        };
        readEntries();
      } else {
        resolve([]);
      }
    });
  };

  // -------------------- Drag and Drop Handlers --------------------
  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const traversePromises: Promise<{ file: File; relativePath: string }[] >[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        if (entry) {
          traversePromises.push(traverseFileTree(entry));
        } else {
          const file = items[i].getAsFile();
          if (file) {
            traversePromises.push(Promise.resolve([{ file, relativePath: file.name }]));
          }
        }
      }
      const results = await Promise.all(traversePromises);
      const allExtracted = results.flat();
      if (allExtracted.length > 0) {
        handleFileSelectWithPaths(allExtracted);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const simpleFiles = Array.from(e.dataTransfer.files).map(file => ({
        file,
        relativePath: (file as any).webkitRelativePath || file.name
      }));
      handleFileSelectWithPaths(simpleFiles);
    }
  }, []);

  // -------------------- Fetch gallery items --------------------
  useEffect(() => {
    fetchGalleryItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  // -------------------- Download helpers --------------------
  // Try to fetch blob and save — if CORS blocks fetch, fallback to <a> download link.
  const fetchBlobOrOpen = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
      const blob = await res.blob();
      saveAs(blob, filename);
      return true;
    } catch (err: any) {
      console.warn('Direct fetch failed (possibly CORS). Falling back to <a> download link.', err);
      // Fallback: create temporary <a> tag to trigger download
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = '_blank'; // Optional: open in new tab if download doesn't trigger
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
        addNotification(`Download started for ${filename}`, 'info');
        return true;
      } catch (e) {
        console.error('Fallback download failed', e);
        addNotification(`Download failed: ${err.message}`, 'error');
        return false;
      }
    }
  };

  // Create zip from array of {url, filename}
  const createZipAndDownload = async (files: { url: string; filename: string }[], zipName: string) => {
    const zip = new JSZip();
    let added = 0;
    for (const f of files) {
      try {
        const res = await fetch(f.url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Failed to fetch ${f.filename}: ${res.status}`);
        const blob = await res.blob();
        zip.file(f.filename, blob);
        added += 1;
      } catch (err) {
        console.error(`Failed to add ${f.filename} to zip:`, err);
        // continue — we will generate zip with available files
      }
    }
    if (added === 0) {
      addNotification('No files available to zip (all failed to fetch).', 'error');
      return;
    }
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, zipName);
      addNotification(`Downloaded ${added} file(s) as ${zipName}`, 'success');
    } catch (err: any) {
      console.error('Zip generation failed:', err);
      addNotification(`Zip download failed: ${err.message}`, 'error');
    }
  };

  // -------------------- Public download and edit handlers --------------------
  
  const handleRotateImage = async (item: GalleryItem) => {
    if (!item || isRotating || item.isVideo) return;
    setIsRotating(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = item.imageUrl + (item.imageUrl.includes('?') ? '&' : '?') + 'cachebust=' + Date.now();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed');

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
      if (!blob) throw new Error('Blob creation failed');

      const res = await fetch(rawStoriesApiUrl('/default/imagesupload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        body: JSON.stringify({ key: item.id, contentType: 'image/webp' })
      });
      const { presigned_url } = await res.json();
      
      await fetch(presigned_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp' },
        body: blob
      });

      // Update state
      const newUrl = item.imageUrl.split('?')[0] + '?v=' + Date.now();
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, imageUrl: newUrl } : i));
      if (previewModal.currentImage?.id === item.id) {
        setPreviewModal(prev => ({ ...prev, currentImage: { ...prev.currentImage!, imageUrl: newUrl } }));
      }
    } catch (err) {
      console.error('Failed to rotate image', err);
      alert('Failed to rotate image. See console for details.');
    } finally {
      setIsRotating(false);
    }
  };

  const handleDownloadItem = async (item: GalleryItem) => {
    addNotification(`Starting download: ${item.filename}`, 'info');
    await fetchBlobOrOpen(item.imageUrl, item.filename);
  };

  // Bulk download selected items/folders
  const handleBulkDownload = async () => {
    setBulkDownloadLoading(true);
    addNotification('Preparing bulk download...', 'info');
    try {
      if (selectedItems.length === 0) {
        addNotification('No items or folders selected for download', 'error');
        return;
      }

      // separate item keys and folder paths
      const selectedFiles = items.filter((it) => selectedItems.includes(it.id));
      const selectedFolders = folders.filter((f) => selectedItems.includes(f.path));

      // if exactly one file and no folders => direct download single
      if (selectedFiles.length === 1 && selectedFolders.length === 0) {
        await handleDownloadItem(selectedFiles[0]);
        return;
      }

      // build file list to zip
      const fileList: { url: string; filename: string }[] = [];

      // add selected files
      for (const it of selectedFiles) {
        fileList.push({ url: it.imageUrl, filename: it.filename });
      }

      // for each selected folder, call your getallimages endpoint to list files inside and push into fileList
      for (const folder of selectedFolders) {
        try {
          // Use the same getallimages lambda to list files under a prefix
          let prefix = folder.path;
          if (prefix.startsWith('/')) prefix = prefix.slice(1);
          if (!prefix.endsWith('/')) prefix += '/';

          const resp = await fetch(
            rawStoriesApiUrl(`/default/getallimages?prefix=${encodeURIComponent(prefix)}&recursive=true`),
            { method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` }, mode: 'cors' }
          );

          if (!resp.ok) {
            console.warn('Folder listing failed for', folder.path, await resp.text());
            continue;
          }
          const body = await resp.json();
          if (body && Array.isArray(body.files)) {
            for (const file of body.files) {
              const url = file.presigned_url || file.url || file.presignedUrl;
              const rawFilename = file.key ? file.key.split('/').pop() : 'unnamed.jpg';
              if (url) {
                fileList.push({ url, filename: `${folder.name}/${rawFilename}` });
              }
            }
          }
        } catch (err) {
          console.error('Error listing folder', folder.path, err);
        }
      }

      if (fileList.length === 0) {
        addNotification('No downloadable files found for selection', 'error');
        return;
      }

      const zipName = `${(currentPath && currentPath !== '/' ? currentPath.replace(/^\//, '').replace(/\//g, '_') : 'gallery') || 'gallery'}_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
      addNotification(`Preparing ${fileList.length} file(s) into ${zipName}`, 'info');
      await createZipAndDownload(fileList, zipName);
    } catch (err: any) {
      addNotification(`Bulk download failed: ${err.message}`, 'error');
    } finally {
      setBulkDownloadLoading(false);
    }
  };

  // -------------------- Share helpers --------------------

  /**
   * requestShareLinksFromServer
   * - Always does POST to SHARE_API with body: { keys, metadata? }
   * - Expects server to return JSON. Accepts these shapes:
   *    { success: true, shares: [{ prefix, token, shareUrl, expiry }, ...] }
   *    { success: true, links: ["https://...","..."] }
   *    { success: true, link: "single url" }
   * - If server returns success:false -> throws with server message.
   * - If server returns HTTP error -> throws with status + body.
   */
  // Replace your requestShareLinksFromServer with this exact function
  const requestShareLinksFromServer = async (keys: string[], metadata: any = {}) => {
    try {
      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error('No keys provided to requestShareLinksFromServer');
      }

      const body = { keys, metadata }; // include metadata (type: folder) if provided
      console.debug('[share] POST payload', body);

      const res = await fetch(SHARE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        mode: 'cors',
        body: JSON.stringify(body),
      });

      // read text so we can show helpful error messages when server returns non-JSON or 4xx/5xx
      const txt = await res.text();
      let parsed = null;
      try {
        parsed = txt ? JSON.parse(txt) : null;
      } catch (parseErr) {
        // JSON parse failed - treat as plain text error message
        parsed = null;
      }

      if (!res.ok) {
        // Helpful path for debugging server responses
        console.warn('[share] server returned non-OK:', res.status, txt);
        // bubble up a helpful message
        let serverMsg = txt;
        if (parsed?.message) serverMsg = parsed.message;
        throw new Error(`Share server error: ${res.status} - ${serverMsg}`);
      }

      const data: any = parsed || (txt ? JSON.parse(txt) : null);

      if (!data) {
        throw new Error('Empty response from share server');
      }
      if (data.success === false) {
        // if server returned structured error, include it
        const serverErr = data.message || JSON.stringify(data);
        throw new Error(serverErr);
      }

      // Accept various shapes
      // 1) { success: true, shares: [{ prefix, token, shareUrl, expiry }, ...] }
      if (Array.isArray(data.shares) && data.shares.length > 0) {
        const urls = data.shares
          .map((s: any) => s.shareUrl || s.link || s.presigned_url || s.url)
          .filter(Boolean);
        if (urls.length > 0) return urls;
      }

      // 2) older shape: { links: [...] }
      if (Array.isArray(data.links) && data.links.length > 0) {
        const urls = data.links.map((l: any) => (typeof l === 'string' ? l : l.link || l.presigned_url || l.url)).filter(Boolean);
        if (urls.length) return urls;
      }

      // 3) single link
      if (data.link && typeof data.link === 'string') {
        return [data.link];
      }

      // 4) top-level array
      if (Array.isArray(data)) {
        const urls = data.map((l: any) => (typeof l === 'string' ? l : l.link || l.presigned_url || l.url)).filter(Boolean);
        if (urls.length) return urls;
      }

      throw new Error('Unexpected share server response format: ' + JSON.stringify(data));
    } catch (err: any) {
      console.error('requestShareLinksFromServer failed:', err);
      throw err;
    }
  };

  /**
   * requestFolderShareLinksFromServer
   * - POSTs to SHARE_API_ACCESS with body: { action: "generate_share_link", folderName, pin? }
   * - Returns array of shareUrl strings.
   */
  const requestFolderShareLinksFromServer = async (folders: string[], pin?: string) => {
    try {
      if (!Array.isArray(folders) || folders.length === 0) {
        throw new Error('No folders provided to requestFolderShareLinksFromServer');
      }
      // API contract: POST { action: "generate_share_link", folderName, pin? }
      const results: string[] = [];
      for (const folderPath of folders) {
        const payload: any = {
          action: 'generate_share_link',
          folderName: folderPath.replace(/^\//, ''), // send clean name
          items: [folderPath],
        };
        if (pin) payload.sharePin = pin;
        const res = await fetch(SHARE_API_ACCESS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
          mode: 'cors',
          body: JSON.stringify(payload),
        });
        const txt = await res.text();
        let parsed: any = null;
        try {
          parsed = txt ? JSON.parse(txt) : null;
        } catch {
          parsed = null;
        }
        if (!res.ok) {
          let serverMsg = txt;
          if (parsed?.message) serverMsg = parsed.message;
          throw new Error(`Folder share server error: ${res.status} - ${serverMsg}`);
        }
        const data: any = parsed || (txt ? JSON.parse(txt) : null);
        if (!data) throw new Error('Empty response from folder share server');
        if (data.success === false) {
          const serverErr = data.message || JSON.stringify(data);
          throw new Error(serverErr);
        }
        // Expected response shape includes shareLink or shareUrl
        const url = data.shareLink || data.shareUrl || data.link || data.url;
        if (typeof url === 'string' && url.length > 0) {
          results.push(url);
        } else {
          throw new Error('Unexpected folder share response: ' + JSON.stringify(data));
        }
      }
      return results;
    } catch (err: any) {
      console.error('requestFolderShareLinksFromServer failed:', err);
      throw err;
    }
  };

  /**
   * generateShareableLinks
   * Accepts selected IDs (either item.key or folder.path).
   * For files: tries to use item.imageUrl if present, otherwise asks server for presigned link.
   * For folders: calls backend to generate shared links.
   * Returns string[] of links.
   */
  const generateShareableLinks = async (forItemIds: string[]) => {
    const folderPaths = forItemIds.filter((id) => id.startsWith('/'));
    const itemIds = forItemIds.filter((id) => !id.startsWith('/'));
    const links: string[] = [];

    // Generate share links for folders via backend
    if (folderPaths.length > 0) {
      const folderLinks = await requestFolderShareLinksFromServer(folderPaths, sharePin || undefined);
      links.push(...folderLinks);
    }

    // Handle files
    if (itemIds.length > 0) {
      const itemsToShare = items.filter((it) => itemIds.includes(it.id));
      const directUrls = itemsToShare.map((it) => it.imageUrl).filter(Boolean);
      const missingKeys = itemsToShare.filter((it) => !it.imageUrl).map((it) => it.key || it.id);

      if (directUrls.length > 0) {
        links.push(...directUrls);
      }
      if (missingKeys.length > 0) {
        const created = await requestShareLinksFromServer(missingKeys);
        links.push(...created);
      }
    }

    return links;
  };

  // (Optional) Updated handleShareSingle if you want files to use /shared-images format
  const handleShareSingle = async (item: GalleryItem) => {
    // Select the item and open share modal
    setSelectedItems([item.id]);
    setShareModal({ isOpen: true, links: [], serverMessage: null });
  };


  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        addNotification('Link copied to clipboard', 'success');
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
        } catch (execErr) {
          // execCommand is deprecated but needed for fallback
        }
        ta.remove();
        addNotification('Link copied to clipboard', 'success');
      }
    } catch (err: any) {
      console.error('Copy failed:', err);
      addNotification('Failed to copy link', 'error');
    }
  };

  // Disable (mark inactive) a share link and notify backend (best-effort)
  const revokeShareLink = async (linkId: string) => {
    // Call backend if we have a sharedId
    const current = activeShareLinks.find((l) => l.id === linkId);
    if (current?.sharedId) {
      revokeShareLinkOnServer(current.sharedId);
    }

    // Update in React state
    setActiveShareLinks(prev =>
      prev.map(link =>
        link.id === linkId ? { ...link, isActive: false } : link
      )
    );

    // Persist inactive status in localStorage (if present)
    try {
      const raw = localStorage.getItem(`share_${linkId}`);
      if (raw) {
        const data = JSON.parse(raw);
        data.isActive = false;
        localStorage.setItem(`share_${linkId}`, JSON.stringify(data));
      }
    } catch (e) {
      console.error('Failed to update share link status in localStorage', e);
    }

    addNotification('Share link disabled successfully', 'success');
  };

  // Call backend to revoke a share link by its sharedId
  const revokeShareLinkOnServer = async (sharedId: string) => {
    try {
      const res = await fetch(SHARE_API_ACCESS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify({
          action: 'revoke_share_link',
          sharedId,
        }),
      });
      const txt = await res.text();
      let data: any = null;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch (parseErr) {
        data = null;
      }
      if (!res.ok || !data || data.success === false) {
        const msg =
          data?.message ||
          txt ||
          'Failed to revoke share link on server';
        console.error('revoke_share_link API error:', msg);
        addNotification(`Server revoke failed: ${msg}`, 'error');
      } else {
        try { window.dispatchEvent(new Event('rawstories_shares_changed')); } catch (e) {}
      }
    } catch (e: any) {
      console.error('revoke_share_link API call failed:', e);
      addNotification(
        `Server revoke failed: ${e.message || 'Unexpected error'}`,
        'error'
      );
    }
  };

  // Call backend to check current status of a share link
  const getShareLinkStatusFromServer = async (sharedId: string) => {
    try {
      const res = await fetch(SHARE_API_ACCESS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify({
          action: 'get_share_link_status',
          sharedId,
        }),
      });
      const txt = await res.text();
      let data: any = null;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch (parseErr) {
        data = null;
      }
      if (!res.ok || !data || data.success === false) {
        const msg =
          data?.message ||
          txt ||
          'Failed to get share link status from server';
        console.error('get_share_link_status API error:', msg);
        addNotification(`Server status check failed: ${msg}`, 'error');
        return null;
      }
      return data.shareLink || null;
    } catch (e: any) {
      console.error('get_share_link_status API call failed:', e);
      addNotification(
        `Server status check failed: ${e.message || 'Unexpected error'}`,
        'error'
      );
      return null;
    }
  };

  // Toggle active/inactive state for a share link
  const toggleShareLinkStatus = async (linkId: string, nextActive: boolean) => {
    const current = activeShareLinks.find((l) => l.id === linkId);

    if (!current?.sharedId) {
      console.debug('[share] toggleShareLinkStatus: no sharedId found, updating UI only');
    } else if (nextActive) {
      // Enabling: check status on server; if still revoked, do not enable locally
      console.debug(
        '[share] Enabling link, checking get_share_link_status for sharedId:',
        current.sharedId
      );
      const status = await getShareLinkStatusFromServer(current.sharedId);
      if (!status || status.isActive === false) {
        addNotification(
          'This link is revoked or inactive on the server and cannot be re-activated.',
          'error'
        );
        return;
      }
    } else {
      // Disabling: call revoke API
      console.debug(
        '[share] Disabling link, calling revoke_share_link for sharedId:',
        current.sharedId
      );
      await revokeShareLinkOnServer(current.sharedId);
    }

    setActiveShareLinks((prev) =>
      prev.map((link) =>
        link.id === linkId ? { ...link, isActive: nextActive } : link
      )
    );

    try {
      const raw = localStorage.getItem(`share_${linkId}`);
      if (raw) {
        const data = JSON.parse(raw);
        data.isActive = nextActive;
        localStorage.setItem(`share_${linkId}`, JSON.stringify(data));
      }
    } catch (e) {
      console.error('Failed to toggle share link status in localStorage', e);
    }
  };

  // Load active share links from localStorage on mount
  useEffect(() => {
    const loadActiveLinks = () => {
      const links: typeof activeShareLinks = [];
      
      // Scan localStorage for share links
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('share_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.id && data.link) {
              // Backfill sharedId for older entries that didn't store it
              let sharedId = data.sharedId;
              if (!sharedId) {
                try {
                  const urlObj = new URL(data.link);
                  const parts = urlObj.pathname.split('/').filter(Boolean);
                  sharedId = parts[parts.length - 1];
                  data.sharedId = sharedId;
                  localStorage.setItem(key, JSON.stringify(data));
                } catch {
                  sharedId = undefined;
                }
              }
              links.push({
                id: data.id,
                link: data.link,
                createdAt: data.createdAt,
                hasPin: data.hasPin || false,
                isActive: data.isActive !== false, // Default to true
                items: data.items || [],
                sharedId,
              });
            }
          } catch (error) {
            console.error('Failed to parse share link:', error);
          }
        }
      }
      
      setActiveShareLinks(links);
    };
    
    loadActiveLinks();
  }, []);

// Inside Gallery component

  const handleShare = async () => {
    if (selectedItems.length === 0) {
      addNotification('Select items or folders to share', 'error');
      return;
    }
    setShareLoading(true);
    addNotification('Generating share link…', 'info');
    try {
      // Determine folderPrefix from selected folders
      const selectedFolders = folders.filter(f => selectedItems.includes(f.path));
      const selectedFileItems = items.filter(it => selectedItems.includes(it.id));
      const primaryFileKey = selectedFileItems[0]?.key || selectedFileItems[0]?.id || '';
      const derivedFilePrefix = primaryFileKey.includes('/')
        ? primaryFileKey.slice(0, primaryFileKey.lastIndexOf('/') + 1)
        : '';
      const folderPrefix = selectedFolders.length > 0
        ? selectedFolders[0].path.replace(/^\//, '')
        : (currentPath ? currentPath.replace(/^\//, '') : derivedFilePrefix);

      const res = await fetch(rawStoriesApiUrl('/default/sharelink'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        mode: 'cors',
        body: JSON.stringify({
          items: selectedItems,
          folderPrefix,
          sharePin: sharePin || '',
          allowDownload: true,
          expiresInHours: Math.max(1, Number(shareExpiryDays || 7)) * 24,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Share failed');

      const shareUrl = data.shareUrl || data.shareLink || '';
      const linkId   = Math.random().toString(36).substring(2, 11);
      const newLink  = { id: linkId, link: shareUrl, createdAt: Date.now(), hasPin: !!sharePin, isActive: true, items: selectedItems, sharedId: data.shareId };
      localStorage.setItem(`share_${linkId}`, JSON.stringify(newLink));
      setActiveShareLinks(prev => [...prev, newLink]);
      try { window.dispatchEvent(new Event('rawstories_shares_changed')); } catch (e) {}
      setShareModal({ isOpen: true, links: [shareUrl], serverMessage: null, sharePin });
        // notify dashboard and other UI that shares changed
        try { window.dispatchEvent(new Event('rawstories_shares_changed')); } catch (e) {}

      addNotification('Share link created!', 'success');
    } catch (err: any) {
      addNotification(`Share failed: ${err.message}`, 'error');
      setShareModal({ isOpen: true, links: [], serverMessage: err.message });
    } finally {
      setShareLoading(false);
    }
  };

  // -------------------- Filters & sorting (unchanged logic from original) --------------------
  const filteredImages = items
    .filter((item) => {
      const eventDate = item.eventDate ? new Date(item.eventDate) : new Date(item.uploadDate || Date.now());
      const itemMonth = eventDate.toLocaleString('default', { month: 'long' });

      const matchesMonth = !filters.month || itemMonth === filters.month;
      const matchesShootType = !filters.shootType || item.shootType === filters.shootType;
      const matchesSearch = !filters.search || item.title.toLowerCase().includes(filters.search.toLowerCase());
      const matchesFavorites = !filters.favorites || item.isFavorite;
      const matchesWatermarked = !filters.watermarked || item.isWatermarked;
      const matchesPinProtected = !filters.pinProtected || item.isPinProtected;

      return matchesMonth && matchesShootType && matchesSearch && matchesFavorites && matchesWatermarked && matchesPinProtected;
    })
    .sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'custom':
          aValue = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
          bValue = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
          break;
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case 'eventDate':
          aValue = new Date(a.eventDate);
          bValue = new Date(b.eventDate);
          break;
        case 'shootType':
          aValue = a.shootType;
          bValue = b.shootType;
          break;
        default:
          aValue = new Date(a.uploadDate);
          bValue = new Date(b.uploadDate);
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentImages = filteredImages.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredImages.length / itemsPerPage);

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy, sortOrder, currentPath]);

  // Preload current page images for faster loading
  useEffect(() => {
    if (currentImages.length === 0) return;
    const imgs: HTMLImageElement[] = [];
    currentImages.forEach((item) => {
      if (!item.isVideo && item.imageUrl) {
        const img = new globalThis.Image();
        img.decoding = 'async';
        img.src = item.imageUrl;
        imgs.push(img);
      }
    });
    return () => {
      imgs.forEach((im) => { im.onload = null; im.onerror = null; });
    };
  }, [currentPage, items, filters, sortBy, sortOrder, currentPath]);

  // -------------------- Drag and Drop Reordering Handlers --------------------
  const handleDragStartItem = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDragId(id);
    dragJustEndedRef.current = false;
  }, []);

  const handleDragOverItem = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    if (dragId && dragId !== targetId) {
      setDragOverId(targetId);
    }
  }, [dragId]);

  const handleDragEnterItem = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragId && dragId !== targetId) {
      setDragOverId(targetId);
    }
  }, [dragId]);

  const handleDragLeaveItem = useCallback((e: React.DragEvent) => {
    // Only clear if we're actually leaving the element (not just moving to a child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverId(null);
    }
  }, []);

  const handleDropOnItem = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    
    setSortBy('custom');
    setItems((prev) => {
      const idsInView = new Set(filteredImages.map((i) => i.id));
      const currentOrder = filteredImages.map((i) => i.id);
      const from = currentOrder.indexOf(dragId);
      const to = currentOrder.indexOf(targetId);
      
      if (from === -1 || to === -1) {
        setDragId(null);
        setDragOverId(null);
        return prev;
      }
      
      const newOrder = [...currentOrder];
      const [moved] = newOrder.splice(from, 1);
      newOrder.splice(to, 0, moved);
      
      const orderMap = new Map<string, number>();
      newOrder.forEach((id, i) => orderMap.set(id, i));
      
      return prev.map((it) => (idsInView.has(it.id) ? { ...it, order: orderMap.get(it.id) } : it));
    });
    
    setDragId(null);
    setDragOverId(null);
    addNotification('Image order updated', 'success');
  }, [dragId, filteredImages, setSortBy, addNotification]);

  const handleDragEndItem = useCallback(() => {
    setDragId(null);
    setDragOverId(null);
    dragJustEndedRef.current = true;
    // Reset after a short delay to allow click events
    setTimeout(() => {
      dragJustEndedRef.current = false;
    }, 100);
  }, []);

  // -------------------- Breadcrumbs --------------------
  const getBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'Gallery', path: '' }];

    let currentBreadcrumbPath = '';
    parts.forEach((part) => {
      currentBreadcrumbPath += `/${part}`;
      breadcrumbs.push({ name: safeDecode(part).replace(/[_-]+/g, ' '), path: currentBreadcrumbPath });
    });

    return breadcrumbs;
  };

  // -------------------- UI Event handlers --------------------
  const handleFilterChange = (filterType: string, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [filterType]: value }));
  };

  const handleFolderClick = (path: string) => {
    const cleanPath = path.replace(/^\//, '');
    navigate(`/gallery/${cleanPath}`);
  };

  const handleBack = () => {
    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.pop();
    const parentPath = pathParts.length > 0 ? `/${pathParts.join('/')}` : '';
    navigate(`/gallery${parentPath}`);
  };

  const handleImageClick = (item: GalleryItem) => {
    setPreviewModal({ isOpen: true, currentImage: item });
  };

  const handleClosePreview = () => {
    // Pause video if it's playing
    const videoElement = document.querySelector('.preview-modal-video') as HTMLVideoElement;
    if (videoElement) {
      videoElement.pause();
    }
    setPreviewModal({ isOpen: false, currentImage: null });
  };

  // Navigate between images in preview modal
  const navigatePreview = (direction: 'prev' | 'next') => {
    if (!previewModal.currentImage) return;
    
    const currentIndex = filteredImages.findIndex(item => item.id === previewModal.currentImage!.id);
    let newIndex;
    
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : filteredImages.length - 1;
    } else {
      newIndex = currentIndex < filteredImages.length - 1 ? currentIndex + 1 : 0;
    }
    
    const newImage = filteredImages[newIndex];
    if (newImage) {
      setPreviewModal({ isOpen: true, currentImage: newImage });
    }
  };

  // Enhanced keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent shortcuts when typing in inputs
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key) {
        case 'Escape':
          if (previewModal.isOpen) {
            handleClosePreview();
          } else if (selectedItems.length > 0) {
            handleClearSelection();
          }
          break;
        
        case 'Delete':
        case 'Backspace':
          if (selectedItems.length > 0) {
            event.preventDefault();
            handleBulkDelete();
          }
          break;
        
        case ' ':
        case 'Spacebar':
          if (selectedItems.length === 1 && !previewModal.isOpen) {
            event.preventDefault();
            const selectedItem = items.find(item => item.id === selectedItems[0]);
            if (selectedItem) {
              handleImageClick(selectedItem);
            }
          }
          break;
        
        case 'ArrowLeft':
          if (previewModal.isOpen && previewModal.currentImage) {
            event.preventDefault();
            navigatePreview('prev');
          }
          break;
        
        case 'ArrowRight':
          if (previewModal.isOpen && previewModal.currentImage) {
            event.preventDefault();
            navigatePreview('next');
          }
          break;
        
        case 'a':
        case 'A':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            handleSelectAll();
          }
          break;
        
        case 'd':
        case 'D':
          if (selectedItems.length > 0 && !previewModal.isOpen) {
            event.preventDefault();
            handleBulkDownload();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewModal.isOpen, selectedItems, items, filteredImages]);

  useEffect(() => {
    setLightboxImageLoaded(false);
  }, [previewModal.currentImage]);

  // Preload next and previous preview modal images in the background for instant transitions
  useEffect(() => {
    if (!previewModal.isOpen || !previewModal.currentImage) return;
    const currentIndex = filteredImages.findIndex(item => item.id === previewModal.currentImage!.id);
    if (currentIndex === -1) return;

    const preloadUrls: string[] = [];
    if (currentIndex < filteredImages.length - 1) {
      const nextItem = filteredImages[currentIndex + 1];
      if (nextItem && !nextItem.isVideo && nextItem.imageUrl) {
        preloadUrls.push(nextItem.imageUrl);
      }
    }
    if (currentIndex > 0) {
      const prevItem = filteredImages[currentIndex - 1];
      if (prevItem && !prevItem.isVideo && prevItem.imageUrl) {
        preloadUrls.push(prevItem.imageUrl);
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
  }, [previewModal.isOpen, previewModal.currentImage, filteredImages]);

  const handleSelectAll = () => {
    const allIds = [
      ...filteredImages.map((item) => item.id),
      ...folders.map((folder) => folder.path),
    ];
    setSelectedItems(allIds);
  };

  const handleSelectAllImages = () => {
    const allImageIds = filteredImages.map((item) => item.id);
    setSelectedItems(allImageIds);
  };

  const handleCopyAllImageNames = () => {
    const allImageNames = filteredImages.map(item => item.title);
    if (allImageNames.length === 0) {
      addNotification('No images found to copy', 'info');
      return;
    }
    copyImageListToClipboard(allImageNames);
  };

  const handleClearSelection = () => {
    setSelectedItems([]);
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems((prev) => [...prev, id]);
    } else {
      setSelectedItems((prev) => prev.filter((itemId) => itemId !== id));
    }
  };

  // Compatibility wrapper used on per-item download button
  const handleDownload = (itemsToDownload: GalleryItem[]) => {
    itemsToDownload.forEach((item) => {
      handleDownloadItem(item);
    });
  };

  // -------------------- Delete logic (keeps your previous API usage) --------------------
  const handleBulkDelete = () => {
    handleDeleteItems(selectedItems);
  };

  const handleDeleteItems = async (itemIds: string[]) => {
    if (itemIds.length === 0) {
      setError('No items or folders selected for deletion');
      addNotification('No items or folders selected for deletion', 'error');
      return;
    }

    const itemsToDelete = items.filter((item) => itemIds.includes(item.id));
    const foldersToDelete = folders.filter((folder) => itemIds.includes(folder.path));
    const itemCount = itemsToDelete.length;
    const folderCount = foldersToDelete.length;

    let confirmMessage = '';
    if (itemCount > 0 && folderCount > 0) {
      confirmMessage = `Are you sure you want to delete ${itemCount} item(s) and ${folderCount} folder(s)?`;
    } else if (itemCount > 0) {
      confirmMessage =
        itemCount === 1
          ? `Are you sure you want to delete "${itemsToDelete[0]?.title}"?`
          : `Are you sure you want to delete ${itemCount} item(s)?`;
    } else if (folderCount > 0) {
      confirmMessage =
        folderCount === 1
          ? `Are you sure you want to delete the folder "${foldersToDelete[0]?.name}"?`
          : `Are you sure you want to delete ${folderCount} folder(s)?`;
    }

    if (!globalThis.confirm?.(confirmMessage)) return;

    try {
      setDeleteLoading(itemIds);
      setError(null);
      setDeleteErrors([]);

      const keys = [
        ...itemsToDelete
          .map((item) => item.key)
          .filter((key): key is string => typeof key === 'string' && key.trim() !== ''),
        ...foldersToDelete.map((folder) => {
          let prefix = folder.path;
          if (prefix.startsWith('/')) prefix = prefix.slice(1);
          if (!prefix.endsWith('/')) prefix += '/';
          return prefix;
        }),
      ];

      if (keys.length === 0) {
        throw new Error('No valid keys found for deletion');
      }

      console.log('Deleting keys:', keys);

      const response = await fetch(
        rawStoriesApiUrl('/default/deleteimage'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
          body: JSON.stringify({ keys }),
          mode: 'cors',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Delete request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Delete operation failed');
      }

      const rawDeletedKeys = result.deleted || [];
      const deletedKeys = rawDeletedKeys.map((k: string) => { try { return decodeURIComponent(k); } catch { return k; } });
      const errors: DeleteError[] = result.errors || [];
      const deletedItems = itemsToDelete.filter((item) => {
        const itemKey = item.key ? (function() { try { return decodeURIComponent(item.key); } catch { return item.key; } })() : '';
        return deletedKeys.includes(itemKey) || deletedKeys.includes(item.key);
      });
      const deletedFolders = foldersToDelete.filter((folder) => {
        let prefix = folder.path;
        if (prefix.startsWith('/')) prefix = prefix.slice(1);
        if (!prefix.endsWith('/')) prefix += '/';
        const normPrefix = (function() { try { return decodeURIComponent(prefix); } catch { return prefix; } })();
        return deletedKeys.includes(normPrefix) || deletedKeys.includes(prefix);
      });

      setItems((prev) => prev.filter((item) => !deletedItems.some((d) => d.id === item.id) && !itemIds.includes(item.id)));
      setFolders((prev) => prev.filter((folder) => !deletedFolders.some((d) => d.path === folder.path) && !itemIds.includes(folder.path)));
      setSelectedItems((prev) => prev.filter((id) => !deletedItems.some((d) => d.id === id) && !deletedFolders.some((d) => d.path === id) && !itemIds.includes(id)));

      if (errors.length > 0) {
        setDeleteErrors(errors);
        setError(`Partially completed: ${deletedKeys.length} deleted, ${errors.length} failed.`);
        addNotification(`Partially completed: ${deletedKeys.length} deleted, ${errors.length} failed.`, 'error');
      } else {
        addNotification(`Successfully deleted ${deletedKeys.length} item(s)/folder(s)`, 'success');
        try { window.dispatchEvent(new Event('rawstories_stats_changed')); } catch (e) {}
      }
    } catch (err: any) {
      console.error('Error deleting items/folders:', err);
      setError(`Failed to delete items/folders: ${err.message}`);
      addNotification(`Failed to delete items/folders: ${err.message}`, 'error');
    } finally {
      setDeleteLoading([]);
    }
  };

  const handleDelete = (id: string) => {
    handleDeleteItems([id]);
  };

  const handleToggleFavorite = async (item: GalleryItem) => {
    if (item.type === 'folder') return;
    const newStatus = !item.isFavorite;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isFavorite: newStatus } : i))
    );
    try {
      await fetch(rawStoriesApiUrl('/default/updatefilemeta'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        body: JSON.stringify({ key: item.id, isFavorite: newStatus }),
        mode: 'cors',
      });
      addNotification(`${newStatus ? 'Added to' : 'Removed from'} favorites`, 'success');
    } catch (err) {
      console.error('Failed to update favorite status', err);
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isFavorite: !newStatus } : i))
      );
      addNotification('Failed to update favorite', 'error');
    }
  };

  const handleAddTag = async (itemId: string, newTag: string) => {
    if (!newTag.trim()) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const tags = item.tags || [];
    if (tags.includes(newTag)) return;
    
    const newTags = [...tags, newTag.trim()];
    
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, tags: newTags } : i))
    );
    if (previewModal.currentImage && previewModal.currentImage.id === itemId) {
       setPreviewModal(prev => ({ ...prev, currentImage: { ...prev.currentImage!, tags: newTags } }));
    }

    try {
      await fetch(rawStoriesApiUrl('/default/updatefilemeta'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        body: JSON.stringify({ key: item.id, tags: newTags }),
        mode: 'cors',
      });
    } catch (err) {
      console.error('Failed to add tag', err);
    }
  };

  const handleRemoveTag = async (itemId: string, tagToRemove: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const newTags = (item.tags || []).filter(t => t !== tagToRemove);
    
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, tags: newTags } : i))
    );
    if (previewModal.currentImage && previewModal.currentImage.id === itemId) {
       setPreviewModal(prev => ({ ...prev, currentImage: { ...prev.currentImage!, tags: newTags } }));
    }

    try {
      await fetch(rawStoriesApiUrl('/default/updatefilemeta'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        body: JSON.stringify({ key: item.id, tags: newTags }),
        mode: 'cors',
      });
    } catch (err) {
      console.error('Failed to remove tag', err);
    }
  };

  // Handle showing image list for client selection folders
  const handleShowImageList = async (folderPath: string, folderName: string) => {
    setImageListLoading(true);
    addNotification('Loading image list...', 'info');
    try {
      // Check if this is a client selection folder
      if (!folderPath.includes('client') && !folderPath.includes('selection')) {
        addNotification('This feature is only available for client selection folders', 'info');
        return;
      }

      let prefix = folderPath;
      if (prefix.startsWith('/')) prefix = prefix.slice(1);
      if (!prefix.endsWith('/')) prefix += '/';

      const response = await fetch(
        rawStoriesApiUrl(`/default/getallimages?prefix=${encodeURIComponent(prefix)}&recursive=true`),
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
          mode: 'cors',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch folder contents: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.files)) {
        throw new Error('Unexpected API response format');
      }

      // Extract image names from the files
      const imageNames = data.files
        .filter((file: any) => file.key && typeof file.key === 'string')
        .map((file: any) => {
          const keyParts = file.key.split('/');
          return keyParts.pop() || 'Untitled';
        })
        .filter((name: string) => name !== 'Untitled');

      setImageListModal({
        isOpen: true,
        folderName: folderName,
        images: imageNames
      });
    } catch (err: any) {
      console.error('Error fetching image list:', err);
      addNotification(`Failed to load image list: ${err.message}`, 'error');
    } finally {
      setImageListLoading(false);
    }
  };

  // Copy image list to clipboard
  const copyImageListToClipboard = async (images: string[]) => {
    try {
      const imageList = images.join('\n');
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(imageList);
        addNotification('Image list copied to clipboard', 'success');
      } else {
        const ta = document.createElement('textarea');
        ta.value = imageList;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        addNotification('Image list copied to clipboard', 'success');
      }
    } catch (err: any) {
      console.error('Copy failed:', err);
      addNotification('Failed to copy image list', 'error');
    }
  };

  // Handle showing selected images list
  const handleShowSelectedImages = () => {
    // Filter selected items to get only image items (not folders)
    const selectedImageIds = selectedItems.filter(id => !id.startsWith('/'));
    const selectedImages = items.filter(item => selectedImageIds.includes(item.id));
    
    if (selectedImages.length === 0) {
      addNotification('No images selected', 'info');
      return;
    }

    const imageNames = selectedImages.map(item => item.title);
    setSelectedImagesModal({
      isOpen: true,
      images: imageNames
    });
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => {
    const tgt = e.currentTarget;
    if ('src' in tgt && typeof tgt.src === 'string' && !tgt.src.includes('picsum.photos')) {
      // Only change image src (not video) --- for video we leave it as-is
      if ((tgt as HTMLImageElement).tagName === 'IMG') {
        (tgt as HTMLImageElement).src = 'https://picsum.photos/400/300';
      }
    }
  };

  // Optimized image loading handler
  const handleImageLoad = (itemId: string) => {
    setLoadedImages(prev => new Set([...prev, itemId]));
  };


  // Create optimized image URL with compression hints
  const getOptimizedImageUrl = (originalUrl: string, isGrid: boolean = true) => {
    if (!originalUrl) return originalUrl;
    if (originalUrl.includes('X-Amz-Signature') || originalUrl.includes('Signature=')) {
      return originalUrl;
    }
    // If the URL already has query parameters, append to them, otherwise start fresh
    const separator = originalUrl.includes('?') ? '&' : '?';
    const width = isGrid ? 400 : 150; // Smaller for list view
    const quality = 80; // Good balance between quality and size
    
    // Add compression hints (works with many CDNs and image services)
    return `${originalUrl}${separator}w=${width}&q=${quality}&f=webp&fit=cover`;
  };


  // -------------------- Create folder --------------------
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setError('Folder name is required');
      addNotification('Folder name is required', 'error');
      return;
    }

    setCreateFolderLoading(true);
    addNotification('Creating folder...', 'info');
    try {
      let prefix = currentPath;
      if (prefix && !prefix.endsWith('/')) prefix += '/';
      if (prefix.startsWith('/')) prefix = prefix.slice(1);

      const folderKey = `${prefix}${newFolderName}/`;

      console.log(`Creating folder with key: ${folderKey}`);

      const response = await fetch(rawStoriesApiUrl('/default/createfolder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        body: JSON.stringify({ key: folderKey }),
        mode: 'cors',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create folder: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Folder creation failed');
      }

      if (folderPreset !== 'none' && !currentPath) {
        const subfolders = folderPreset === 'wedding' 
          ? ['Selects', 'Finals', 'Raw', 'Sneak Peeks']
          : folderPreset === 'portrait' ? ['Selects', 'Finals', 'Raw'] : [];
        for (const sub of subfolders) {
          await fetch(rawStoriesApiUrl('/default/createfolder'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
            body: JSON.stringify({ key: `${folderKey}${sub}/` }),
            mode: 'cors',
          });
        }
      }

      setCreateFolderModal(false);
      setNewFolderName('');
      setFolderPreset('none');
      fetchGalleryItems();
      addNotification(`Folder created: ${newFolderName}`, 'success');
    } catch (err: any) {
      console.error('Error creating folder:', err);
      setError(`Failed to create folder: ${err.message}`);
      addNotification(`Failed to create folder: ${err.message}`, 'error');
    } finally {
      setCreateFolderLoading(false);
    }
  };

  // -------------------- Rename folder --------------------
  const handleRenameFolder = async () => {
    const { oldPath, newName } = renameFolderModal;
    if (!newName.trim()) {
      addNotification('Folder name is required', 'error');
      return;
    }

    setRenameFolderLoading(true);
    addNotification('Renaming folder...', 'info');
    try {
      const pathParts = oldPath.split('/').filter(Boolean);
      pathParts.pop();
      const parentDir = pathParts.length > 0 ? pathParts.join('/') + '/' : '';
      const newPath = `${parentDir}${newName}/`;

      const response = await fetch(rawStoriesApiUrl('/default/renamefolder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        body: JSON.stringify({ oldKey: oldPath, newKey: newPath }),
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error('Failed to rename folder');
      }

      setRenameFolderModal({ isOpen: false, oldPath: '', newName: '' });
      fetchGalleryItems();
      addNotification('Folder renamed successfully', 'success');
    } catch (err: any) {
      console.error('Error renaming folder:', err);
      addNotification(`Failed to rename folder: ${err.message}`, 'error');
    } finally {
      setRenameFolderLoading(false);
    }
  };

  // -------------------- Move Image --------------------
  const handleMoveImage = async (itemId: string, targetFolderPath: string) => {
    addNotification('Moving item...', 'info');
    try {
      const itemFileName = itemId.split('/').pop();
      const newKey = `${targetFolderPath}${itemFileName}`;
      
      const response = await fetch(rawStoriesApiUrl('/default/moveimage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        body: JSON.stringify({ oldKey: itemId, newKey }),
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error('Failed to move item');
      }

      fetchGalleryItems();
      addNotification('Item moved successfully', 'success');
    } catch (err: any) {
      console.error('Error moving item:', err);
      addNotification(`Failed to move item: ${err.message}`, 'error');
    }
  };

  const handleDropOnFolder = (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedItemId = e.dataTransfer.getData('text/plain');
    if (draggedItemId && draggedItemId !== folderPath) {
      handleMoveImage(draggedItemId, folderPath);
    }
  };

  // -------------------- Upload handlers --------------------
  // Define allowed file types
  const ALLOWED_IMAGE_EXTENSIONS = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'ico'
  ];
  
  const ALLOWED_VIDEO_EXTENSIONS = [
    'mp4', 'mov', 'avi', 'wmv', 'mkv', 'webm', 'flv', '3gp', 'm4v'
  ];

  const RAW_FILE_EXTENSIONS = [
    'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2', 'pef', 'srw', 'x3f', 'raf', '3fr', 'fff', 'dcr', 'kdc', 'srf', 'mrw'
  ];

  // -------------------- Watermark Image Handler --------------------
  const handleWatermarkImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      addNotification('Please select a valid image file', 'error');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setWatermarkImage(base64);
      setWatermarkImageName(file.name);
      addNotification('Watermark image loaded', 'success');
    };
    reader.onerror = () => {
      addNotification('Failed to load watermark image', 'error');
    };
    reader.readAsDataURL(file);
  };

  // -------------------- Watermark Preset Management --------------------
  const saveWatermarkPreset = () => {
    if (!watermarkImage) {
      addNotification('Please select a watermark image', 'error');
      return;
    }

    const newPreset: WatermarkPreset = {
      id: Math.random().toString(36).substring(2, 11),
      imageUrl: watermarkImage,
      imageName: watermarkImageName,
      position: watermarkPosition,
      lastUsed: Date.now(),
    };

    // Check if this exact watermark already exists
    const exists = savedWatermarks.find(
      (preset) => preset.imageName === watermarkImageName && preset.position === watermarkPosition
    );

    if (exists) {
      // Update last used time
      const updated = savedWatermarks.map((preset) =>
        preset.id === exists.id ? { ...preset, lastUsed: Date.now() } : preset
      );
      setSavedWatermarks(updated);
      try {
        localStorage.setItem('watermarkPresets', JSON.stringify(updated));
        addNotification('Watermark preset updated', 'success');
      } catch (err) {
        console.error('LocalStorage quota exceeded:', err);
        addNotification('Watermark is too large to save as a preset. Using it for this session only.', 'warning');
      }
    } else {
      // Add new preset (keep max 10 presets)
      const updated = [newPreset, ...savedWatermarks].slice(0, 10);
      setSavedWatermarks(updated);
      try {
        localStorage.setItem('watermarkPresets', JSON.stringify(updated));
        addNotification('Watermark preset saved', 'success');
      } catch (err) {
        console.error('LocalStorage quota exceeded:', err);
        addNotification('Watermark is too large to save as a preset. Using it for this session only.', 'warning');
        // Revert preset list state since we couldn't persist it
        setSavedWatermarks(savedWatermarks);
      }
    }
  };

  const loadWatermarkPreset = (preset: WatermarkPreset) => {
    setWatermarkImage(preset.imageUrl);
    setWatermarkImageName(preset.imageName);
    setWatermarkPosition(preset.position);
    setWatermarkEnabled(true);

    // Update last used time
    const updated = savedWatermarks.map((p) =>
      p.id === preset.id ? { ...p, lastUsed: Date.now() } : p
    );
    setSavedWatermarks(updated);
    try {
      localStorage.setItem('watermarkPresets', JSON.stringify(updated));
      addNotification('Watermark preset loaded', 'success');
    } catch (err) {
      console.error('LocalStorage quota exceeded:', err);
    }
  };

  const deleteWatermarkPreset = (presetId: string) => {
    const updated = savedWatermarks.filter((preset) => preset.id !== presetId);
    setSavedWatermarks(updated);
    try {
      localStorage.setItem('watermarkPresets', JSON.stringify(updated));
      addNotification('Watermark preset deleted', 'success');
    } catch (err) {
      console.error('LocalStorage quota exceeded:', err);
    }
  };

  const getPositionLabel = (position: WatermarkPosition): string => {
    switch (position) {
      case 'top-left': return 'Top Left';
      case 'top-right': return 'Top Right';
      case 'bottom-left': return 'Bottom Left';
      case 'bottom-right': return 'Bottom Right';
      default: return 'None';
    }
  };

  const isValidFileType = (file: File): boolean => {
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop() || '';
    
    // Check if it's a raw file (explicitly reject)
    if (RAW_FILE_EXTENSIONS.includes(fileExtension)) {
      return false;
    }
    
    // Check MIME type first
    const isValidMimeType = file.type.startsWith('image/') || file.type.startsWith('video/');
    
    // Check file extension as backup (some files might not have proper MIME types)
    const isValidExtension = 
      ALLOWED_IMAGE_EXTENSIONS.includes(fileExtension) || 
      ALLOWED_VIDEO_EXTENSIONS.includes(fileExtension);
    
    return isValidMimeType && isValidExtension;
  };

  // -------------------- Watermark Application --------------------
  const applyWatermark = async (file: File, position: WatermarkPosition, watermarkImageUrl: string): Promise<File> => {
    return new Promise((resolve, reject) => {
      // Skip watermark for videos
      if (file.type.startsWith('video/')) {
        resolve(file);
        return;
      }

      // Skip if position is 'none' or no watermark image
      if (position === 'none' || !watermarkImageUrl) {
        resolve(file);
        return;
      }

      const img = document.createElement('img');
      const watermarkImg = document.createElement('img');
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          // Load watermark image
          watermarkImg.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
              }

              // Set canvas dimensions to match image
              canvas.width = img.width;
              canvas.height = img.height;

              // Draw the original image
              ctx.drawImage(img, 0, 0);

              // Calculate watermark size (10% of image width, maintaining aspect ratio)
              const watermarkMaxWidth = img.width * 0.15;
              const watermarkScale = watermarkMaxWidth / watermarkImg.width;
              const watermarkWidth = watermarkImg.width * watermarkScale;
              const watermarkHeight = watermarkImg.height * watermarkScale;
              const padding = img.width * 0.02; // 2% padding

              // Calculate position based on selection
              let x = 0;
              let y = 0;

              switch (position) {
                case 'top-left':
                  x = padding;
                  y = padding;
                  break;
                case 'top-right':
                  x = canvas.width - watermarkWidth - padding;
                  y = padding;
                  break;
                case 'bottom-left':
                  x = padding;
                  y = canvas.height - watermarkHeight - padding;
                  break;
                case 'bottom-right':
                  x = canvas.width - watermarkWidth - padding;
                  y = canvas.height - watermarkHeight - padding;
                  break;
              }

              // Draw watermark image with some transparency
              ctx.globalAlpha = 0.7;
              ctx.drawImage(watermarkImg, x, y, watermarkWidth, watermarkHeight);
              ctx.globalAlpha = 1;

              // Convert canvas to blob
              canvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error('Failed to create watermarked image'));
                  return;
                }

                // Create new file with watermark
                const watermarkedFile = new File([blob], file.name, {
                  type: file.type,
                  lastModified: Date.now(),
                });

                resolve(watermarkedFile);
              }, file.type, 0.95); // High quality
            } catch (error) {
              reject(error);
            }
          };

          watermarkImg.onerror = () => {
            reject(new Error('Failed to load watermark image'));
          };

          // Load watermark image
          watermarkImg.src = watermarkImageUrl;
        };

        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };

        img.src = e.target?.result as string;
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsDataURL(file);
    });
  };

  async function handleFileSelect(selectedFiles: FileList | null) {
    if (!selectedFiles) return;
    const itemsWithPaths = Array.from(selectedFiles).map((file) => ({
      file,
      relativePath: (file as any).webkitRelativePath || file.name
    }));
    handleFileSelectWithPaths(itemsWithPaths);
  }

  async function handleFileSelectWithPaths(itemsWithPaths: { file: File; relativePath: string }[]) {
    const validItems: { file: File; relativePath: string }[] = [];
    const rejectedFiles: string[] = [];

    itemsWithPaths.forEach((item) => {
      if (isValidFileType(item.file)) {
        validItems.push(item);
      } else {
        rejectedFiles.push(item.file.name);
      }
    });

    if (rejectedFiles.length > 0) {
      const rejectedMessage = rejectedFiles.length === 1 
        ? `File "${rejectedFiles[0]}" was rejected (unsupported format or raw file)`
        : `${rejectedFiles.length} files were rejected (unsupported formats or raw files)`;
      addNotification(rejectedMessage, 'error');
    }

    if (validItems.length === 0) {
      setError('No valid image or video files selected. Raw files and unsupported formats are not allowed.');
      addNotification('No valid image or video files selected. Raw files and unsupported formats are not allowed.', 'error');
      return;
    }

    const processedItems: { file: File; relativePath: string }[] = [];
    if (watermarkEnabled && watermarkPosition !== 'none' && watermarkImage) {
      addNotification(`Applying watermarks to ${validItems.length} file(s) in parallel queue...`, 'info');
      // Parallel watermarking queue with concurrency 6
      const mapConcurrently = async <T, R>(arr: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
        const results = new Array<R>(arr.length);
        let index = 0;
        const worker = async () => {
          while (index < arr.length) {
            const i = index++;
            results[i] = await fn(arr[i]);
          }
        };
        const workers = Array.from({ length: Math.min(concurrency, arr.length || 1) }, () => worker());
        await Promise.all(workers);
        return results;
      };

      const results = await mapConcurrently(validItems, 6, async (item) => {
        try {
          const processedFile = await applyWatermark(item.file, watermarkPosition, watermarkImage);
          return { file: processedFile, relativePath: item.relativePath };
        } catch (error: any) {
          console.error('Watermark failed for', item.file.name, error);
          return { file: item.file, relativePath: item.relativePath };
        }
      });
      processedItems.push(...results);
    } else {
      processedItems.push(...validItems);
    }

    const newFiles: UploadFile[] = processedItems.map((item) => ({
      file: item.file,
      id: Math.random().toString(36).substring(2, 11),
      progress: 0,
      status: 'pending' as const,
      startTime: Date.now(),
      lastLoaded: 0,
      lastTime: Date.now(),
      speed: 0,
      watermarkPosition: watermarkEnabled ? watermarkPosition : 'none',
      processedFile: item.file,
      relativePath: item.relativePath
    }));

    const acceptedMessage = watermarkEnabled
      ? `${processedItems.length} file(s) ready for upload (with watermarks)`
      : `${processedItems.length} file(s) ready for upload`;
    addNotification(acceptedMessage, 'success');

    setUploadFiles(newFiles);
    setUploadModal(false);
    startUpload(newFiles);
  }

  // Helper to upload a single file using XMLHttpRequest for progress tracking
  const uploadFileWithXHR = (fileUpload: UploadFile, presignedUrl: PresignedUpload): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignedUrl.url, true);
      xhr.setRequestHeader('Content-Type', fileUpload.file.type);

      let speed = fileUpload.speed || 0;

      // Track progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const loaded = event.loaded;
          const percentComplete = Math.round((loaded / event.total) * 100);
          const now = Date.now();

          // Calculate speed (KB/s)
          if (fileUpload.lastTime && fileUpload.lastLoaded !== undefined) {
            const timeDiff = (now - fileUpload.lastTime) / 1000; // seconds
            const bytesDiff = loaded - fileUpload.lastLoaded;
            if (timeDiff > 0.1 && bytesDiff > 0) {
              speed = (bytesDiff / timeDiff) / 1024; // KB/s
            }
          } else if (fileUpload.startTime) {
            const totalTime = (now - fileUpload.startTime) / 1000;
            if (totalTime > 0.5) {
              speed = (loaded / totalTime) / 1024; // KB/s
            }
          }

          setUploadFiles((prev) =>
            prev.map((f) =>
              f.id === fileUpload.id
                ? {
                    ...f,
                    progress: percentComplete,
                    lastLoaded: loaded,
                    lastTime: now,
                    speed: Math.max(0, speed),
                  }
                : f
            )
          );
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadFiles((prev) =>
            prev.map((f) => (f.id === fileUpload.id ? { ...f, status: 'completed', progress: 100 } : f))
          );
          resolve();
        } else {
          const error = new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`);
          setUploadFiles((prev) =>
            prev.map((f) => (f.id === fileUpload.id ? { ...f, status: 'error', error: error.message } : f))
          );
          reject(error);
        }
      });

      xhr.addEventListener('error', () => {
        const error = new Error('Network error during upload');
        setUploadFiles((prev) =>
          prev.map((f) => (f.id === fileUpload.id ? { ...f, status: 'error', error: error.message } : f))
        );
        reject(error);
      });

      xhr.addEventListener('abort', () => {
        const error = new Error('Upload aborted');
        setUploadFiles((prev) =>
          prev.map((f) => (f.id === fileUpload.id ? { ...f, status: 'error', error: error.message } : f))
        );
        reject(error);
      });

      setUploadFiles((prev) =>
        prev.map((f) => (f.id === fileUpload.id ? { ...f, status: 'uploading', progress: 0, lastTime: Date.now(), lastLoaded: 0, speed: 0 } : f))
      );
      xhr.send(fileUpload.file);
    });
  };

  // Helper to process a batch of uploads with concurrency limit
  const processUploadBatch = async (batchFiles: UploadFile[], presignedUrls: PresignedUpload[]) => {
    const uploadPromises: Promise<void>[] = [];
    for (let i = 0; i < batchFiles.length; i++) {
      const fileUpload = batchFiles[i];
      const presigned = presignedUrls[i];
      if (!presigned) {
        console.warn(`No presigned URL for ${fileUpload.file.name}`);
        setUploadFiles((prev) =>
          prev.map((f) => (f.id === fileUpload.id ? { ...f, status: 'error', error: 'No presigned URL' } : f))
        );
        continue;
      }

      uploadPromises.push(uploadFileWithXHR(fileUpload, presigned));

      if (uploadPromises.length >= MAX_CONCURRENT_UPLOADS || i === batchFiles.length - 1) {
        try {
          await Promise.all(uploadPromises);
        } catch (err) {
          console.error('Some uploads in batch failed:', err);
        }
        uploadPromises.length = 0;
      }
    }
  };

  const startUpload = async (filesToUpload: UploadFile[]) => {
    if (filesToUpload.length === 0) return;

    try {
      let prefix = currentPath;
      if (prefix.startsWith('/')) prefix = prefix.slice(1);
      if (prefix && !prefix.endsWith('/')) prefix += '/';
      if (prefix === '/') prefix = '';

      const displayPath = prefix || 'root';
      console.log(`Uploading to path: ${displayPath} (${filesToUpload.length} files)`);

      addNotification(
        `Starting upload of ${filesToUpload.length} file(s) to ${displayPath}`,
        'info'
      );

      const batches: UploadFile[][] = [];
      for (let i = 0; i < filesToUpload.length; i += PRESIGNED_BATCH_SIZE) {
        batches.push(filesToUpload.slice(i, i + PRESIGNED_BATCH_SIZE));
      }

      const allPresignedUrls: PresignedUpload[] = [];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchFilesData = batch.map((f) => ({
          name: f.relativePath || (f.file as any).webkitRelativePath || f.file.name,
          type: f.file.type || 'application/octet-stream'
        }));

        addNotification(
          `Requesting presigned URLs for batch ${batchIndex + 1}/${batches.length} (${batch.length} files)...`,
          'info'
        );

        const response = await fetch(rawStoriesApiUrl('/default/bulkupload'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
          body: JSON.stringify({
            files: batchFilesData,
            folder: prefix,
          }),
          mode: 'cors',
        });

        console.log(`Batch ${batchIndex + 1} Lambda request body:`, JSON.stringify({
          files: batchFilesData,
          folder: prefix,
        }));

        if (!response.ok) {
          throw new Error(`Failed to get presigned URLs for batch ${batchIndex + 1}: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`Batch ${batchIndex + 1} Lambda response:`, JSON.stringify(data, null, 2));

        if (!data.success || !data.uploads || !Array.isArray(data.uploads)) {
          throw new Error(data.message || `Invalid Lambda response format for batch ${batchIndex + 1}`);
        }

        // Filter valid uploads
        const batchPresignedUrls = data.uploads.filter((upload: any): upload is PresignedUpload => {
          if (!upload.url || !upload.key) {
            console.warn('Skipping invalid upload entry:', JSON.stringify(upload, null, 2));
            addNotification(`Skipping invalid upload entry for file: ${upload.key || 'unknown'}`, 'error');
            return false;
          }
          if (Object.keys(upload).length > 2) {
            console.warn('Unexpected fields in upload entry:', Object.keys(upload));
          }
          return true;
        });

        if (batchPresignedUrls.length !== batch.length) {
          console.warn(`Batch ${batchIndex + 1}: Expected ${batch.length} presigned URLs, got ${batchPresignedUrls.length}`);
          addNotification(`Warning: Batch ${batchIndex + 1} received ${batchPresignedUrls.length} valid URLs out of ${batch.length} requested`, 'info');
        }

        allPresignedUrls.push(...batchPresignedUrls);
      }

      if (allPresignedUrls.length === 0) {
        throw new Error('No valid presigned URLs received across all batches');
      }

      // Now process uploads in batches with concurrency
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchFiles = batches[batchIndex];
        const batchPresignedUrls = allPresignedUrls.slice(
          batchIndex * PRESIGNED_BATCH_SIZE,
          (batchIndex + 1) * PRESIGNED_BATCH_SIZE
        );
        await processUploadBatch(batchFiles, batchPresignedUrls);
      }

      // Check for any remaining errors
      const failedUploads = filesToUpload.filter(f => f.status === 'error');
      if (failedUploads.length > 0) {
        throw new Error(`Failed to upload ${failedUploads.length} file(s): ${failedUploads.map(f => f.file.name).join(', ')}`);
      }

      fetchGalleryItems();
      setUploadFiles([]);
      addNotification(`Successfully uploaded ${allPresignedUrls.length} file(s) to ${displayPath}`, 'success');
      try { window.dispatchEvent(new Event('rawstories_stats_changed')); } catch (e) {}
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadFiles((prev) =>
        prev.map((f) =>
          filesToUpload.some((pf) => pf.id === f.id)
            ? { ...f, status: 'error', error: error.message }
            : f
        )
      );
      setError(`Upload failed: ${error.message}`);
      addNotification(`Upload failed: ${error.message}`, 'error');
    }
  };

  // -------------------- Render UI --------------------
  // Upload progress counters - Single consolidated progress bar
  const completedCount = uploadFiles.filter(f => f.status === 'completed').length;
  const totalCount = uploadFiles.length;
  const errorCount = uploadFiles.filter(f => f.status === 'error').length;
  const uploadingFiles = uploadFiles.filter(f => f.status === 'uploading');
  const pendingCount = uploadFiles.filter(f => f.status === 'pending').length;
  
  // Calculate overall progress including partial progress of uploading files
  const overallProgress = totalCount > 0 ? 
    (completedCount + uploadingFiles.reduce((sum, f) => sum + (f.progress || 0) / 100, 0)) / totalCount * 100 : 0;
  
  // Calculate combined upload speed and total throughput
  const uploadingSpeeds = uploadingFiles.map(f => f.speed || 0).filter(speed => speed > 0);
  const totalUploadSpeed = uploadingSpeeds.reduce((a, b) => a + b, 0);
  const avgSpeedNum = uploadingSpeeds.length > 0 ? totalUploadSpeed / uploadingSpeeds.length : 0;
  
  // Format speeds in appropriate units
  const formatSpeed = (speedKBps: number) => {
    if (speedKBps === 0) return '—';
    if (speedKBps >= 1024) {
      return `${(speedKBps / 1024).toFixed(1)} MB/s`;
    }
    if (speedKBps < 0.1) return '< 0.1 KB/s';
    return `${speedKBps.toFixed(1)} KB/s`;
  };
  
  const avgSpeed = formatSpeed(avgSpeedNum);
  const totalSpeed = formatSpeed(totalUploadSpeed);

  // Calculate file sizes and estimated time remaining
  const totalBytes = uploadFiles.reduce((sum, f) => sum + f.file.size, 0);
  const completedBytes = uploadFiles
    .filter(f => f.status === 'completed')
    .reduce((sum, f) => sum + f.file.size, 0);
  const uploadingBytes = uploadingFiles.reduce((sum, f) => sum + (f.file.size * (f.progress || 0) / 100), 0);
  const processedBytes = completedBytes + uploadingBytes;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const remainingFiles = totalCount - completedCount;
  const avgFileSize = uploadingFiles.length > 0 ? 
    uploadingFiles.reduce((sum, f) => sum + f.file.size, 0) / uploadingFiles.length : 0;
  const estimatedTimeSeconds = totalUploadSpeed > 0 ? 
    (remainingFiles * avgFileSize / 1024) / totalUploadSpeed : 0;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <GalleryErrorBoundary>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite linear;
        }
        @keyframes slide-up {
          0% { transform: translateY(100%) translateX(-50%); opacity: 0; }
          100% { transform: translateY(0) translateX(-50%); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
      <div className="min-h-screen bg-[#0f172a] text-white relative overflow-hidden">
        {/* Animated Background Orbs */}
        <div className="fixed top-0 left-1/4 w-96 h-96 bg-teal-500/20 rounded-full mix-blend-screen filter blur-[120px] animate-blob pointer-events-none" />
        <div className="fixed top-1/4 right-1/4 w-96 h-96 bg-fuchsia-500/20 rounded-full mix-blend-screen filter blur-[120px] animate-blob animation-delay-2000 pointer-events-none" />
        <div className="fixed bottom-0 left-1/2 w-96 h-96 bg-purple-500/20 rounded-full mix-blend-screen filter blur-[120px] animate-blob animation-delay-4000 pointer-events-none" />
        
        <main className="p-6 relative z-10">
            {/* Notifications */}
            {notifications.length > 0 && (
              <div className="fixed top-20 right-6 z-50 space-y-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 rounded-lg shadow-lg text-white ${
                      notification.type === 'success'
                        ? 'bg-green-500'
                        : notification.type === 'error'
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{notification.message}</span>
                      <button
                        onClick={() =>
                          setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
                        }
                        className="ml-4"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">
                  {currentPath ? (
                    <span className="flex items-center gap-2">
                      <button onClick={() => navigate(-1)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                        <ChevronLeft className="h-6 w-6 text-gray-400" />
                      </button>
                      {safeDecode(currentPath.split('/').filter(Boolean).pop() || 'Gallery').replace(/[_-]+/g, ' ')}
                    </span>
                  ) : 'Gallery'}
                </h1>
                <p className="text-gray-400 text-sm mt-1">Manage your media and share with clients</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCreateFolderModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all shadow-sm"
                >
                  <Folder className="w-5 h-5" />
                  New Folder
                </button>
                <button
                  onClick={() => setUploadModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#00BCEB] hover:bg-[#00A5CF] text-white rounded-xl font-medium transition-all shadow-lg shadow-[#00BCEB]/20"
                >
                  <Upload className="w-5 h-5" />
                  Upload Media
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="glass-dark rounded-2xl border border-white/10 p-5 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search media..."
                      value={filters.search}
                      onChange={(e) => handleFilterChange('search', e.target.value)}
                      className="pl-10 pr-4 py-2 border border-slate-600 bg-slate-800/50 text-white placeholder-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00BCEB] focus:border-transparent w-64"
                    />
                  </div>

                  {/* Filters Toggle */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center px-3 py-2 border rounded-lg transition-colors duration-200 ${
                      showFilters
                        ? 'border-[#00BCEB] text-[#00BCEB] bg-[#00BCEB]/5'
                        : 'border-slate-600 text-slate-300 hover:border-[#00BCEB] hover:text-[#00BCEB]'
                    }`}
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Filters
                  </button>

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 border border-slate-600 bg-slate-800/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00BCEB] focus:border-transparent"
                  >
                    <option value="uploadDate">Upload Date</option>
                    <option value="eventDate">Event Date</option>
                    <option value="title">Name</option>
                    <option value="shootType">Shoot Type</option>
                  </select>

                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="p-2 border border-slate-600 text-slate-300 rounded-lg hover:border-[#00BCEB] hover:text-[#00BCEB] transition-colors duration-200"
                  >
                    {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                  </button>

                  {/* Select All Button */}
                  {(filteredImages.length > 0 || folders.length > 0) && (
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.length === (filteredImages.length + folders.length)}
                        onChange={() => {}} // Controlled by button click
                        className="h-4 w-4 text-[#00BCEB] focus:ring-[#00BCEB] border-gray-200 rounded mr-2"
                      />
                      Select All
                    </button>
                  )}

                  {/* Bulk Actions for Selected Items */}
                  {selectedItems.length > 0 && (
                    <div className="flex items-center space-x-2 border-l border-gray-200 pl-4 ml-2">
                      <button
                        onClick={() => setSelectedImagesModal({ isOpen: true, images: selectedItems.filter(id => items.some(item => item.id === id)).map(id => items.find(item => item.id === id)?.title || id) })}
                        className="flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 text-sm font-medium shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                        title="View Selected"
                      >
                        <Eye className="w-4 h-4 mr-1.5" />
                        View ({selectedItems.length})
                      </button>
                      
                      <button
                        onClick={() => {
                          setShareModal({ isOpen: true, links: [], serverMessage: null });
                          setSharePin('');
                        }}
                        className="flex items-center px-3 py-2 bg-[#00BCEB] text-white rounded-lg hover:bg-[#00A5CF] transition-colors duration-200 text-sm font-medium shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                        title="Share Selected"
                      >
                        <Share2 className="w-4 h-4 mr-1.5" />
                        Share
                      </button>

                      <button
                        onClick={handleBulkDownload}
                        disabled={bulkDownloadLoading}
                        className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 text-sm font-medium shadow-sm hover:shadow-md transform hover:-translate-y-0.5 disabled:opacity-50"
                        title="Download Selected"
                      >
                        {bulkDownloadLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
                        Download
                      </button>

                      <button
                        onClick={handleBulkDelete}
                        className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 text-sm font-medium shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                        title="Delete Selected"
                      >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Delete
                      </button>
                    </div>
                  )}

                  {/* View Mode Toggle */}
                  <div className="flex border border-gray-200 rounded-lg">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 ${viewMode === 'grid' ? 'bg-[#00BCEB] text-white' : 'text-gray-600 hover:text-[#00BCEB]'} rounded-l-lg transition-colors duration-200`}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 ${viewMode === 'list' ? 'bg-[#00BCEB] text-white' : 'text-gray-600 hover:text-[#00BCEB]'} rounded-r-lg transition-colors duration-200`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Filters */}
              {showFilters && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Month</label>
                    <select
                      value={filters.month}
                      onChange={(e) => handleFilterChange('month', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-600 bg-slate-800/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00BCEB] focus:border-transparent"
                    >
                      <option value="">All Months</option>
                      {months.map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Shoot Type</label>
                    <select
                      value={filters.shootType}
                      onChange={(e) => handleFilterChange('shootType', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-600 bg-slate-800/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00BCEB] focus:border-transparent"
                    >
                      <option value="">All Types</option>
                      {shootTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.favorites}
                        onChange={(e) => handleFilterChange('favorites', e.target.checked)}
                        className="h-4 w-4 text-[#00BCEB] focus:ring-[#00BCEB] border-slate-600 bg-slate-800 rounded"
                      />
                      <span className="ml-2 text-sm text-slate-300">Favorites</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.watermarked}
                        onChange={(e) => handleFilterChange('watermarked', e.target.checked)}
                        className="h-4 w-4 text-[#00BCEB] focus:ring-[#00BCEB] border-slate-600 bg-slate-800 rounded"
                      />
                      <span className="ml-2 text-sm text-slate-300">Watermarked</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.pinProtected}
                        onChange={(e) => handleFilterChange('pinProtected', e.target.checked)}
                        className="h-4 w-4 text-[#00BCEB] focus:ring-[#00BCEB] border-slate-600 bg-slate-800 rounded"
                      />
                      <span className="ml-2 text-sm text-slate-300">Protected</span>
                    </label>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => setFilters({ month: '', shootType: '', search: '', favorites: false, watermarked: false, pinProtected: false })}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-all"
                    >
                      Clear All Filters
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <span className="text-red-700">{error}</span>
              </div>
            )}

            {/* Delete Errors */}
            {deleteErrors.length > 0 && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="text-sm font-medium text-red-700 mb-2">Deletion Errors:</h3>
                <ul className="list-disc list-inside text-red-600 text-sm">
                  {deleteErrors.map((err, index) => (
                    <li key={index}>
                      {err.Key}: {err.Message} {err.Code && `(${err.Code})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* SINGLE UPLOAD PROGRESS BAR WITH DETAILED SPEED INFO */}
            {uploadFiles.length > 0 && (
              <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-[480px] bg-white rounded-lg shadow-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                    <div>
                      <span className="text-sm font-semibold text-gray-800">
                        Uploading {totalCount} files ({formatBytes(totalBytes)})
                      </span>
                      <div className="text-xs text-gray-500">
                        {completedCount} completed • {uploadingFiles.length} active • {pendingCount} pending
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setUploadFiles([])}
                    className="text-xs text-red-600 hover:text-red-800 px-3 py-1 rounded hover:bg-red-50 border border-red-200"
                  >
                    Cancel All
                  </button>
                </div>
                
                {/* SINGLE CONSOLIDATED PROGRESS BAR */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-600 mb-2">
                    <span className="font-medium">{completedCount}/{totalCount} files</span>
                    <span className="font-medium">{Math.round(overallProgress)}% complete</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{formatBytes(processedBytes)} / {formatBytes(totalBytes)}</span>
                    <span>Data transferred</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ease-out relative ${
                        completedCount === totalCount && errorCount === 0 
                          ? 'bg-gradient-to-r from-green-500 to-green-600' 
                          : errorCount > 0 
                          ? 'bg-gradient-to-r from-red-500 to-red-600' 
                          : 'bg-gradient-to-r from-blue-500 to-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(3, overallProgress))}%` }}
                    >
                      <div className="absolute inset-0 bg-white bg-opacity-20 animate-pulse rounded-full"></div>
                    </div>
                  </div>
                </div>

                {/* DETAILED SPEED AND STATUS INFO */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Upload Speed:</span>
                      <span className="font-medium text-blue-600">
                        {totalSpeed}
                        {uploadingFiles.length > 0 && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({uploadingSpeeds.length} active)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Avg per File:</span>
                      <span className="font-medium text-gray-700">{avgSpeed}</span>
                    </div>
                    {estimatedTimeSeconds > 0 && remainingFiles > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Time Left:</span>
                        <span className="font-medium text-orange-600">{formatTime(estimatedTimeSeconds)}</span>
                      </div>
                    )}
                    {uploadingFiles.length > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Debug:</span>
                        <span className="text-gray-500">
                          {uploadingFiles.map(f => f.speed?.toFixed(1) || '0').join(', ')} KB/s
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Active:</span>
                      <span className="font-medium text-blue-600">
                        {uploadingFiles.length > 0 ? `⬆ ${uploadingFiles.length}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Errors:</span>
                      <span className={`font-medium ${errorCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {errorCount > 0 ? `❌ ${errorCount}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={`font-medium ${
                        completedCount === totalCount && errorCount === 0 
                          ? 'text-green-600' 
                          : uploadingFiles.length > 0 
                          ? 'text-blue-600' 
                          : 'text-gray-600'
                      }`}>
                        {completedCount === totalCount && errorCount === 0 
                          ? '✅ Complete' 
                          : uploadingFiles.length > 0 
                          ? '🔄 Uploading' 
                          : '⏸ Paused'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {completedCount === totalCount && errorCount === 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-center">
                    <span className="text-sm text-green-600 font-medium">
                      🎉 All {totalCount} files uploaded successfully!
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Content with Drag and Drop */}
            <div
              className={`relative ${
                loading ? 'h-64 flex items-center justify-center' : ''
              } ${dragActive ? 'bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {dragActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-lg z-10">
                  <div className="text-center">
                    <Upload className="h-12 w-12 text-[#00BCEB] mx-auto mb-2" />
                    <p className="text-[#00BCEB] font-medium">Drop files here to upload</p>
                  </div>
                </div>
              )}
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {/* Subtle Dark Glassmorphic Skeleton Cards */}
                  {Array.from({ length: 10 }).map((_, index) => (
                    <div key={index} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 overflow-hidden animate-pulse flex items-center space-x-3">
                      <div className="w-10 h-10 bg-slate-800/80 rounded-xl flex-shrink-0"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-800/80 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-800/50 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {folders.length === 0 && filteredImages.length === 0 ? (
                    <div className="text-center py-20">
                      <div className="relative">
                        <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                          <Image className="h-16 w-16 text-gray-400" />
                        </div>
                        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-32 bg-gradient-to-br from-blue-200 to-purple-200 rounded-full animate-ping opacity-20"></div>
                      </div>
                      <h3 className="text-xl font-semibold text-gray-300 mb-2">No media found</h3>
                      <p className="text-gray-400 mb-4">This directory is empty. Start by uploading some images or videos.</p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                        <button
                          onClick={() => setUploadModal(true)}
                          className="flex items-center px-6 py-3 bg-gradient-to-r from-[#00BCEB] to-blue-600 text-white rounded-xl font-medium hover:from-[#00A5CF] hover:to-blue-700 transition-all duration-200 shadow-lg shadow-[#00BCEB]/20"
                        >
                          <Upload className="h-5 w-5 mr-2" />
                          Upload Files
                        </button>
                        <p className="text-sm text-gray-400">or drag and drop files here</p>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`${
                        viewMode === 'grid'
                          ? compactView
                            ? 'columns-2 md:columns-3 gap-3'
                            : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4'
                          : 'space-y-4'
                      }`}
                    >
                      {folders.map((folder, index) => (
                        <motion.div
                          key={folder.path}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
                          whileHover={{ y: -5, scale: 1.02 }}
                          onClick={() => handleFolderClick(folder.path)}
                          className={`group relative p-6 glass-dark rounded-2xl border border-white/10 hover:border-teal-400/40 shadow-lg hover:shadow-[0_12px_30px_rgba(45,212,191,0.15)] transition-all duration-300 ease-out overflow-hidden cursor-pointer ${
                            selectedItems.includes(folder.path) 
                              ? 'ring-2 ring-teal-500 ring-offset-2 ring-offset-[#0f172a]' 
                              : ''
                          }`}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => handleDropOnFolder(e, folder.path)}
                        >
                          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full -translate-y-10 translate-x-10 opacity-30 pointer-events-none"></div>
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(folder.path)}
                            onChange={(e) => handleSelectItem(folder.path, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-3 right-3 h-5 w-5 text-[#00BCEB] focus:ring-[#00BCEB] border-2 border-white rounded bg-white shadow-lg z-10 cursor-pointer"
                          />
                          <div className="flex items-center space-x-4">
                            <div className="relative">
                              <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                                <Folder className="h-6 w-6 text-slate-900 fill-slate-900" />
                              </div>
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                                <span className="text-xs font-bold text-yellow-800">📁</span>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white group-hover:text-teal-300 transition-colors duration-200 text-lg truncate">
                                {folder.name}
                              </p>
                              <p className="text-sm text-gray-400 flex items-center mt-1">
                                <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                                Folder
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 mt-4 z-20 relative">
                            {deleteLoading.includes(folder.path) ? (
                              <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                            ) : (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const name = folder.path.replace(/\/$/, '').split('/').pop() || '';
                                    setRenameFolderModal({ isOpen: true, oldPath: folder.path, newName: name });
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors duration-200 z-20 relative bg-white/5 hover:bg-white/10 rounded-lg"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(folder.path); }}
                                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors duration-200 z-20 relative bg-white/5 hover:bg-white/10 rounded-lg"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </motion.div>
                      ))}

                      {/* Images/Videos */}
                      {currentImages.map((item) => (
                        <div
                          key={item.id}
                          className={`group relative ${
                            selectedItems.includes(item.id) ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                          } ${
                            dragId === item.id ? 'opacity-50 scale-95 cursor-grabbing z-50 shadow-2xl' : ''
                          } ${
                            dragOverId === item.id && dragId !== item.id ? 'ring-2 ring-blue-400 ring-offset-2 scale-105 bg-blue-50/50 z-40' : ''
                          } ${
                            compactView && viewMode === 'grid'
                              ? 'rounded-2xl overflow-hidden break-inside-avoid inline-block w-full mb-3 border border-white/10'
                              : (viewMode === 'grid'
                                  ? 'glass-dark rounded-2xl border border-white/10 hover:border-teal-400/40 hover:shadow-[0_0_30px_rgba(45,212,191,0.15)] hover:-translate-y-1 transition-all duration-300 ease-out overflow-hidden'
                                  : 'flex items-center space-x-4 p-4 glass-dark rounded-2xl border border-white/10 hover:border-teal-400/40 transition-all duration-200')
                          }`}
                          draggable={true}
                          onDragStart={(e) => handleDragStartItem(e, item.id)}
                          onDragEnter={(e) => handleDragEnterItem(e, item.id)}
                          onDragOver={(e) => handleDragOverItem(e, item.id)}
                          onDragLeave={handleDragLeaveItem}
                          onDrop={(e) => handleDropOnItem(e, item.id)}
                          onDragEnd={handleDragEndItem}
                          style={{ 
                            cursor: dragId === item.id ? 'grabbing' : 'grab',
                            transition: dragId === item.id ? 'none' : 'all 0.2s ease'
                          }}
                        >
                          {/* Drag Handle */}
                          <div className="absolute top-2 left-2 z-10 p-1.5 bg-white/90 backdrop-blur-sm rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing">
                            <GripVertical className="h-4 w-4 text-gray-500" />
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(item.id)}
                            onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                            className="absolute top-2 right-2 h-5 w-5 text-[#00BCEB] focus:ring-[#00BCEB] border-2 border-white rounded bg-white shadow-lg z-10 cursor-pointer"
                          />
                          <div
                            onClick={() => {
                              // Prevent click if we just finished dragging
                              if (!dragJustEndedRef.current) {
                                handleImageClick(item);
                              }
                            }}
                            className={viewMode === 'grid' ? 'cursor-pointer' : 'cursor-pointer flex-1'}
                          >
                            {item.isVideo ? (
                              <div className="relative">
                                <video
                                  src={item.imageUrl}
                                  draggable={false}
                                  className={compactView && viewMode === 'grid' ? 'block w-full h-auto object-contain rounded-lg' : (viewMode === 'grid' ? 'w-full h-48 object-cover rounded-t-lg' : 'w-24 h-24 object-cover rounded-lg')}
                                  preload="none"
                                  onError={handleImageError}
                                  muted
                                  poster={item.imageUrl + '#t=0.1'}
                                  style={{ backgroundColor: '#f3f4f6' }}
                                >
                                  <source src={item.imageUrl} type={`video/${item.filename.split('.').pop()?.toLowerCase()}`} />
                                  Your browser does not support the video tag.
                                </video>
                                <Play className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-black opacity-75" />
                                
                                {/* Video Badges */}
                                {viewMode === 'grid' && (
                                  <div className="absolute bottom-2 left-2 flex space-x-1">
                                    <span className="px-2 py-1 bg-red-600 text-white text-xs font-medium rounded-full shadow-lg">
                                      VIDEO
                                    </span>
                                    {item.isFavorite && (
                                      <span className="px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-full shadow-lg">
                                        ⭐
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="relative">
                                <img
                                  src={compactView && viewMode === 'grid' ? item.imageUrl : getOptimizedImageUrl(item.imageUrl, viewMode === 'grid')}
                                  alt={item.title}
                                  draggable={false}
                                  className={compactView && viewMode === 'grid' ? 'block w-full h-auto object-contain rounded-lg' : (viewMode === 'grid' ? 'w-full h-48 object-cover rounded-t-lg' : 'w-24 h-24 object-cover rounded-lg')}
                                  onError={handleImageError}
                                  onLoad={() => handleImageLoad(item.id)}
                                  loading="lazy"
                                  decoding="async"
                                  style={{ 
                                    backgroundColor: '#f3f4f6',
                                    minHeight: compactView && viewMode === 'grid' ? undefined : (viewMode === 'grid' ? '192px' : '96px'),
                                    transition: 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out',
                                    opacity: loadedImages.has(item.id) ? 1 : 0,
                                    transform: loadedImages.has(item.id) ? 'scale(1)' : 'scale(0.95)'
                                  }}
                                />
                                
                                {/* Image Badges */}
                                {viewMode === 'grid' && item.isFavorite && (
                                  <div className="absolute bottom-2 left-2 flex space-x-1">
                                    <span className="px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-full shadow-lg">
                                      ⭐
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {!(compactView && viewMode === 'grid') && (
                            <div
                              className={
                                viewMode === 'grid'
                                  ? 'p-4'
                                  : 'flex-1 flex items-center justify-between'
                              }
                            >
                              <div>
                                <p className="font-medium text-[#2D2D2D] group-hover:text-[#00BCEB] transition-colors duration-200">
                                  {item.title}
                                </p>
                                <p className="text-sm text-gray-500">{item.shootType}</p>
                                <p className="text-sm text-gray-500">{item.eventDate}</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleToggleFavorite(item)}
                                  className={`p-1.5 ${item.isFavorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'} transition-colors duration-200`}
                                >
                                  <Star className="w-4 h-4" fill={item.isFavorite ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                  onClick={() => handleImageClick(item)}
                                  className="p-1.5 text-gray-400 hover:text-[#00BCEB] transition-colors duration-200"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDownload([item])}
                                  className="p-1.5 text-gray-400 hover:text-[#00BCEB] transition-colors duration-200"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleShareSingle(item)}
                                  className="p-1.5 text-gray-400 hover:text-[#00BCEB] transition-colors duration-200"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                {deleteLoading.includes(item.id) ? (
                                  <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                                ) : (
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors duration-200"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pagination UI */}
                  {totalPages > 1 && (
                    <div className="mt-10 flex items-center justify-between gap-3 text-sm py-4 border-t border-white/5">
                      <button
                        onClick={() => currentPage > 1 && paginate(currentPage - 1)}
                        disabled={currentPage === 1}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs sm:text-sm transition-all ${
                          currentPage === 1
                            ? 'border-white/5 text-gray-500 bg-white/5 cursor-not-allowed'
                            : 'border-white/10 text-white bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Previous</span>
                      </button>

                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[10px] uppercase tracking-wider text-gray-400">Page</span>
                        <span className="text-sm font-semibold text-white">
                          {currentPage} / {totalPages}
                        </span>
                      </div>

                      <button
                        onClick={() => currentPage < totalPages && paginate(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs sm:text-sm transition-all ${
                          currentPage === totalPages
                            ? 'border-white/5 text-gray-500 bg-white/5 cursor-not-allowed'
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
            </div>

            {/* Floating Bulk Actions Toolbar */}
            {selectedItems.length > 0 && (
              <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
                <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 px-6 py-4 flex items-center space-x-4 animate-slide-up">
                  <div className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-xs">{selectedItems.length}</span>
                    </div>
                    <span>{selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected</span>
                  </div>
                  
                  <div className="w-px h-6 bg-gray-300"></div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleBulkDownload()}
                      disabled={bulkDownloadLoading}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 text-sm font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                      {bulkDownloadLoading && <Loader2 className="ml-2 w-4 h-4 animate-spin" />}
                    </button>
                    
                    <button
                      onClick={() => setShareModal({ isOpen: true, links: [], serverMessage: null })}
                      disabled={shareLoading}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 text-sm font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                      {shareLoading && <Loader2 className="ml-2 w-4 h-4 animate-spin" />}
                    </button>
                    
                    <button
                      onClick={() => handleBulkDelete()}
                      className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 text-sm font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </button>
                    
                    <button
                      onClick={handleClearSelection}
                      className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-sm font-medium"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}

          {/* Preview Modal */}
          {previewModal.isOpen && previewModal.currentImage && (
            <div 
              className="fixed inset-0 bg-black bg-opacity-75 flex items-start justify-center py-8 z-50"
              onClick={handleClosePreview}
            >
              <div 
                className="relative max-w-4xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Navigation Arrows */}
                {filteredImages.length > 1 && (
                  <>
                    <button
                      onClick={() => navigatePreview('prev')}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-3 transition-all duration-200 group"
                      title="Previous (←)"
                    >
                      <ChevronLeft className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                      onClick={() => navigatePreview('next')}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-3 transition-all duration-200 group"
                      title="Next (→)"
                    >
                      <ChevronRight className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
                  </>
                )}
                
                <button
                  onClick={handleClosePreview}
                  className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-2 transition-all duration-200"
                  title="Close (Esc)"
                >
                  <X className="w-6 h-6" />
                </button>
                {previewModal.currentImage.isVideo ? (
                  <video
                    src={previewModal.currentImage.imageUrl}
                    controls
                    autoPlay
                    muted
                    className="w-full max-h-[80vh] object-contain rounded-lg preview-modal-video"
                    onError={handleImageError}
                    preload="metadata"
                  >
                    <source src={previewModal.currentImage.imageUrl} type={previewModal.currentImage.filename.split('.').pop()?.toLowerCase()} />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <img
                    src={previewModal.currentImage.imageUrl}
                    alt={previewModal.currentImage.title}
                    decoding="async"
                    onLoad={() => setLightboxImageLoaded(true)}
                    className={`w-full max-h-[80vh] object-contain rounded-lg transition-all duration-300 ${
                      lightboxImageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                    }`}
                    onError={handleImageError}
                  />
                )}
                <div className="bg-white p-4 rounded-b-lg">
                  <p className="font-medium text-[#2D2D2D]">{previewModal.currentImage.title}</p>
                  <p className="text-sm text-gray-500">{previewModal.currentImage.shootType}</p>
                  <p className="text-sm text-gray-500">{previewModal.currentImage.eventDate}</p>
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => handleDownloadItem(previewModal.currentImage!)}
                      className="px-3 py-1.5 bg-[#00BCEB] text-white rounded-lg text-sm"
                    >
                      <Download className="w-4 h-4 inline mr-1" />
                      Download
                    </button>
                    {!previewModal.currentImage.isVideo && (
                      <button
                        onClick={() => handleRotateImage(previewModal.currentImage!)}
                        disabled={isRotating}
                        className={`px-3 py-1.5 text-white rounded-lg text-sm ${isRotating ? 'bg-gray-400' : 'bg-purple-500 hover:bg-purple-600'}`}
                      >
                        {isRotating ? '...' : 'Rotate 90°'}
                      </button>
                    )}
                    <button
                      onClick={() => handleShareSingle(previewModal.currentImage!)}
                      className="px-3 py-1.5 bg-[#FF6B00] text-white rounded-lg text-sm"
                    >
                      <Share2 className="w-4 h-4 inline mr-1" />
                      Share
                    </button>
                  </div>
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(previewModal.currentImage.tags || []).map(tag => (
                        <span key={tag} className="flex items-center gap-1 bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-md">
                          {tag}
                          <button onClick={() => handleRemoveTag(previewModal.currentImage!.id, tag)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.elements.namedItem('newTag') as HTMLInputElement;
                        if (input.value) {
                          handleAddTag(previewModal.currentImage!.id, input.value);
                          input.value = '';
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input name="newTag" type="text" placeholder="Add a tag..." className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[#00BCEB]" />
                      <button type="submit" className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-md text-sm transition-colors">Add</button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Share Modal */}
          {shareModal.isOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center py-8 z-50">
              <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-md sm:max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-[#2D2D2D]">Share Media</h3>
                  <button
                    onClick={() => {
                      setShareModal({ isOpen: false, links: [], serverMessage: null });
                      setSharePin('');
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  {/* Share Settings */}
                  {shareModal.links.length === 0 && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="text-sm font-semibold text-gray-800 mb-3">Share Settings</h4>
                      
                      {/* PIN Protection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          PIN Protection (Optional)
                        </label>
                        <input
                          type="text"
                          value={sharePin}
                          onChange={(e) => setSharePin(e.target.value)}
                          placeholder="Enter 4-6 digit PIN to protect link"
                          maxLength={6}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave empty for no PIN protection. Recipients will need this PIN to access.</p>
                      </div>

                      {/* Expiry */}
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Expiry (days)</label>
                        <input
                          type="number"
                          min={1}
                          value={shareExpiryDays}
                          onChange={(e) => setShareExpiryDays(Number(e.target.value))}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">Set how long the share link remains active (default 7 days)</p>
                      </div>
                      
                      {/* Generate Link Button */}
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => handleShare()}
                          disabled={shareLoading || selectedItems.length === 0}
                          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {shareLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Share2 className="w-4 h-4 mr-2" />
                              Generate Share Link {selectedItems.length > 1 && `(${selectedItems.length} items)`}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {shareModal.serverMessage && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <strong className="text-sm text-yellow-700">Share server message:</strong>
                      <div className="text-sm text-yellow-800 mt-1">{shareModal.serverMessage}</div>
                    </div>
                  )}

                  {/* Generated Links */}
                  {shareModal.links.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">Generated Link(s)</h4>
                      {shareModal.links.map((link, idx) => (
                        <div key={idx} className="flex items-center space-x-2 mb-2">
                          <input
                            type="text"
                            value={link}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm"
                          />
                          <button
                            onClick={() => copyToClipboard(link)}
                            className="p-2 text-[#00BCEB] hover:text-[#00A5CF]"
                            title="Copy link"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {shareModal.sharePin && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                          <strong className="text-green-700">PIN:</strong> {shareModal.sharePin}
                          <p className="text-xs text-green-600 mt-1">Share this PIN with recipients</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Active Share Links */}
                  {activeShareLinks.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-800 mb-3">Active Share Links</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {activeShareLinks
                          .sort((a, b) => b.createdAt - a.createdAt)
                          .map((shareLink) => {
                            
                            return (
                              <div
                                key={shareLink.id}
                                className={`p-3 rounded-lg border ${
                                  !shareLink.isActive ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-2 mb-1">
                                      <p className="text-xs font-medium text-gray-900 truncate">
                                        {shareLink.items.length} item(s)
                                      </p>
                                      {shareLink.hasPin && (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                          🔒 PIN Protected
                                        </span>
                                      )}
                                      <span
                                        className={`px-2 py-0.5 text-xs rounded-full ${
                                          shareLink.isActive
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-gray-200 text-gray-700'
                                        }`}
                                      >
                                        {shareLink.isActive ? 'Active' : 'Inactive'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                      Created: {new Date(shareLink.createdAt).toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      Status: {shareLink.isActive ? 'Active' : 'Revoked'}
                                    </p>
                                  </div>
                                  <div className="flex items-center space-x-1 ml-2">
                                    <button
                                      onClick={() => toggleShareLinkStatus(shareLink.id, !shareLink.isActive)}
                                      className={`px-2 py-1 text-xs rounded border ${
                                        shareLink.isActive
                                          ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                          : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                      }`}
                                    >
                                      {shareLink.isActive ? 'Disable' : 'Enable'}
                                    </button>
                                    <button
                                      onClick={() => copyToClipboard(shareLink.link)}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="Copy link"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => revokeShareLink(shareLink.id)}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Revoke access"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-2 pt-4">
                    <button
                      onClick={() => {
                        setShareModal({ isOpen: false, links: [], serverMessage: null });
                        setSharePin('');
                      }}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                      {shareModal.links.length > 0 ? 'Close' : 'Cancel'}
                    </button>
                    {shareModal.links.length > 0 && (
                      <button
                        onClick={() => {
                          setShareModal({ isOpen: false, links: [], serverMessage: null });
                          setSharePin('');
                          addNotification('Link(s) ready for sharing', 'success');
                        }}
                        className="px-4 py-2 bg-[#00BCEB] text-white rounded-lg hover:bg-[#00A5CF]"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Folder Modal */}
          {createFolderModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center py-8 z-50">
              <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-sm sm:max-w-md md:max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-[#2D2D2D]">Create New Folder</h3>
                  <button
                    onClick={() => setCreateFolderModal(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Folder Name</label>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00BCEB]"
                    placeholder="Enter folder name"
                    disabled={createFolderLoading}
                  />
                </div>
                {!currentPath && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Folder Preset (Client Project)</label>
                    <select
                      value={folderPreset}
                      onChange={(e) => setFolderPreset(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00BCEB]"
                      disabled={createFolderLoading}
                    >
                      <option value="none">None (Empty Folder)</option>
                      <option value="wedding">Wedding (Selects, Finals, Raw, Sneak Peeks)</option>
                      <option value="portrait">Portrait (Selects, Finals, Raw)</option>
                    </select>
                  </div>
                )}
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => setCreateFolderModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    disabled={createFolderLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    className="px-4 py-2 bg-[#00BCEB] text-white rounded-lg hover:bg-[#00A5CF] flex items-center"
                    disabled={createFolderLoading}
                  >
                    Create
                    {createFolderLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upload Modal */}
          {uploadModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-0 sm:p-4 z-50">
              <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4 md:px-6">
                  <h3 className="text-xl font-bold text-[#2D2D2D]">Upload Files</h3>
                  <button
                    onClick={() => setUploadModal(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
                  {/* Watermark Settings in Modal */}
                  <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">Watermark Settings</h4>
                    
                    <div className="space-y-4">
                      {/* Enable Watermark Toggle */}
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={watermarkEnabled}
                          onChange={(e) => setWatermarkEnabled(e.target.checked)}
                          className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm font-medium text-gray-900">Enable Watermark on Images</span>
                      </label>

                      {watermarkEnabled && (
                        <>
                          {/* Watermark Image Upload */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Watermark Image</label>
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => watermarkInputRef.current?.click()}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center"
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                {watermarkImage ? 'Change Image' : 'Select Image'}
                              </button>
                              {watermarkImageName && (
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm text-gray-600 truncate max-w-xs">{watermarkImageName}</span>
                                  {watermarkImage && (
                                    <img 
                                      src={watermarkImage} 
                                      alt="Watermark preview" 
                                      className="h-10 w-10 object-contain border border-gray-300 rounded"
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                            <input
                              type="file"
                              ref={watermarkInputRef}
                              accept="image/*"
                              onChange={handleWatermarkImageSelect}
                              hidden
                            />
                          </div>

                          {/* Position Selector */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Watermark Position</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <button
                                onClick={() => setWatermarkPosition('top-left')}
                                className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                                  watermarkPosition === 'top-left'
                                    ? 'border-purple-600 bg-purple-50'
                                    : 'border-gray-300 bg-white hover:border-purple-300'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <div className="w-12 h-12 border-2 border-current rounded relative">
                                    <div className="absolute top-0 left-0 w-3 h-3 bg-purple-600 rounded-full"></div>
                                  </div>
                                  <span className="text-sm font-medium">Top Left</span>
                                </div>
                              </button>
                              <button
                                onClick={() => setWatermarkPosition('top-right')}
                                className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                                  watermarkPosition === 'top-right'
                                    ? 'border-purple-600 bg-purple-50'
                                    : 'border-gray-300 bg-white hover:border-purple-300'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <div className="w-12 h-12 border-2 border-current rounded relative">
                                    <div className="absolute top-0 right-0 w-3 h-3 bg-purple-600 rounded-full"></div>
                                  </div>
                                  <span className="text-sm font-medium">Top Right</span>
                                </div>
                              </button>
                              <button
                                onClick={() => setWatermarkPosition('bottom-left')}
                                className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                                  watermarkPosition === 'bottom-left'
                                    ? 'border-purple-600 bg-purple-50'
                                    : 'border-gray-300 bg-white hover:border-purple-300'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <div className="w-12 h-12 border-2 border-current rounded relative">
                                    <div className="absolute bottom-0 left-0 w-3 h-3 bg-purple-600 rounded-full"></div>
                                  </div>
                                  <span className="text-sm font-medium">Bottom Left</span>
                                </div>
                              </button>
                              <button
                                onClick={() => setWatermarkPosition('bottom-right')}
                                className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                                  watermarkPosition === 'bottom-right'
                                    ? 'border-purple-600 bg-purple-50'
                                    : 'border-gray-300 bg-white hover:border-purple-300'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <div className="w-12 h-12 border-2 border-current rounded relative">
                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-purple-600 rounded-full"></div>
                                  </div>
                                  <span className="text-sm font-medium">Bottom Right</span>
                                </div>
                              </button>
                            </div>
                          </div>

                          <div className="text-xs text-gray-600 bg-white px-3 py-2 rounded-lg border border-gray-200">
                            <span className="font-medium">Note:</span> Watermark will be applied to images only (not videos) during upload
                          </div>

                          {/* Save Watermark Button */}
                          <div className="flex justify-end">
                            <button
                              onClick={saveWatermarkPreset}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center"
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Save Watermark
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Saved Watermarks Section */}
                  {Array.isArray(savedWatermarks) && savedWatermarks.length > 0 && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-800 mb-3">Saved Watermarks</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {[...savedWatermarks]
                          .filter((preset) => preset && typeof preset === 'object')
                          .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
                          .map((preset) => (
                            <div
                              key={preset.id || Math.random().toString()}
                              className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-purple-300 transition-colors group"
                            >
                              <div className="flex items-center space-x-3 flex-1 min-w-0">
                                {preset.imageUrl ? (
                                  <img 
                                    src={preset.imageUrl} 
                                    alt={preset.imageName || 'Watermark'}
                                    className="h-10 w-10 object-contain border border-gray-300 rounded"
                                  />
                                ) : (
                                  <div className="h-10 w-10 bg-purple-100 text-purple-600 font-bold flex items-center justify-center rounded text-xs">
                                    WM
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{preset.imageName || 'Watermark Preset'}</p>
                                  <p className="text-xs text-gray-500">{preset.position ? getPositionLabel(preset.position) : 'Bottom Right'}</p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 ml-3">
                                <button
                                  onClick={() => loadWatermarkPreset(preset)}
                                  className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
                                  title="Load this watermark"
                                >
                                  Load
                                </button>
                                <button
                                  onClick={() => deleteWatermarkPreset(preset.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Delete this watermark"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* File Selection Area */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Files</label>
                    <div 
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 sm:p-8 text-center hover:border-[#FF6B00] transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-600 mb-1">
                        <span className="text-[#FF6B00] font-medium">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">
                        Images: JPG, PNG, GIF, WebP, etc. • Videos: MP4, MOV, AVI, etc.
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:space-x-3 sm:gap-0">
                    <button
                      onClick={() => setUploadModal(false)}
                      className="w-full sm:w-auto px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                    >
                      Cancel
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      multiple
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        handleFileSelect(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <input
                      type="file"
                      ref={folderInputRef}
                      multiple
                      {...({ webkitdirectory: '', directory: '' } as any)}
                      className="hidden"
                      onChange={(e) => {
                        handleFileSelect(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      className="w-full sm:w-auto px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center justify-center shadow transition-all text-sm"
                    >
                      <Folder className="w-4 h-4 mr-2" />
                      Choose Folder
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:w-auto px-6 py-2.5 bg-[#FF6B00] text-white rounded-lg hover:bg-[#FF9900] font-medium flex items-center justify-center shadow-lg hover:shadow-xl transition-all text-sm"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Choose Files
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Image List Modal */}
          {imageListModal.isOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center py-8 z-50">
              <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-md sm:max-w-lg md:max-w-2xl max-h-[80vh] flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-[#2D2D2D]">
                    Images in "{imageListModal.folderName}"
                  </h3>
                  <button
                    onClick={() => setImageListModal({ isOpen: false, folderName: '', images: [] })}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {imageListModal.images.length} image{imageListModal.images.length !== 1 ? 's' : ''} found
                  </p>
                  <button
                    onClick={() => copyImageListToClipboard(imageListModal.images)}
                    className="flex items-center px-3 py-1.5 bg-[#00BCEB] text-white rounded-lg hover:bg-[#00A5CF] transition-colors duration-200 text-sm"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy List
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
                  {imageListLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-8 w-8 text-[#00BCEB] animate-spin" />
                    </div>
                  ) : imageListModal.images.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-gray-500">
                      <div className="text-center">
                        <Image className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p>No images found in this folder</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="space-y-2">
                        {imageListModal.images.map((imageName, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded border hover:bg-gray-100 transition-colors duration-200"
                          >
                            <div className="flex items-center space-x-3">
                              <Image className="h-4 w-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-700">
                                {imageName}
                              </span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(imageName)}
                              className="p-1 text-gray-400 hover:text-[#00BCEB] transition-colors duration-200"
                              title="Copy image name"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-2 mt-4">
                  <button
                    onClick={() => setImageListModal({ isOpen: false, folderName: '', images: [] })}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => copyImageListToClipboard(imageListModal.images)}
                    className="px-4 py-2 bg-[#00BCEB] text-white rounded-lg hover:bg-[#00A5CF]"
                  >
                    Copy All Names
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Selected Images Modal */}
          {selectedImagesModal.isOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center py-8 z-50">
              <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-md sm:max-w-lg md:max-w-2xl max-h-[80vh] flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-[#2D2D2D]">
                    Selected Images
                  </h3>
                  <button
                    onClick={() => setSelectedImagesModal({ isOpen: false, images: [] })}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
                  </p>
                  <button
                    onClick={() => copyImageListToClipboard(selectedItems.map(id => items.find(item => item.id === id)?.title || id))}
                    className="flex items-center px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 text-sm"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy List
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
                  {selectedItems.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-gray-500">
                      <div className="text-center">
                        <Image className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p>No images selected</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {selectedItems.map((itemId) => {
                          const item = items.find(i => i.id === itemId);
                          if (!item) return null;
                          return (
                            <div
                              key={item.id}
                              className="group relative bg-white rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200 overflow-hidden"
                            >
                              <div
                                onClick={() => {
                                  setSelectedImagesModal({ isOpen: false, images: [] });
                                  handleImageClick(item);
                                }}
                                className="cursor-pointer"
                              >
                                {item.isVideo ? (
                                  <div className="relative">
                                    <video
                                      src={item.imageUrl}
                                      className="w-full h-32 object-cover"
                                      preload="none"
                                      muted
                                      poster={item.imageUrl + '#t=0.1'}
                                    />
                                    <Play className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-white opacity-75" />
                                    <span className="absolute top-2 left-2 px-2 py-1 bg-red-600 text-white text-xs font-medium rounded-full">
                                      VIDEO
                                    </span>
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <img
                                      src={getOptimizedImageUrl(item.imageUrl, true)}
                                      alt={item.title}
                                      className="w-full h-32 object-cover"
                                      loading="lazy"
                                    />
                                    {item.isFavorite && (
                                      <span className="absolute top-2 left-2 px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-full">
                                        ⭐
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="p-3">
                                <p className="font-medium text-gray-800 text-sm truncate">{item.title}</p>
                                <p className="text-xs text-gray-500">{item.shootType}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Share Modal ─────────────────────────────────────────── */}
          {shareModal.isOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center py-8 z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-[#00BCEB]" />
                    <h3 className="text-lg font-semibold text-gray-900">Share Gallery</h3>
                  </div>
                  <button onClick={() => { setShareModal({ isOpen: false, links: [], serverMessage: null }); setSharePin(''); }}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-all">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6 space-y-5">
                  {shareModal.serverMessage && shareModal.links.length === 0 && (
                    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-700 mb-1">Share failed</p>
                        <p className="text-sm text-red-600">{shareModal.serverMessage}</p>
                      </div>
                    </div>
                  )}
                  {shareModal.links.length === 0 && !shareModal.serverMessage && (
                    <>
                      <p className="text-sm text-gray-600">Sharing <strong>{selectedItems.length}</strong> item(s)</p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          PIN Protection <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <input type="text" maxLength={8} value={sharePin}
                          onChange={e => setSharePin(e.target.value)}
                          placeholder="Leave blank for no PIN"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00BCEB]/40 focus:border-[#00BCEB] transition-all text-sm" />
                        <p className="text-xs text-gray-400 mt-1">Client will need this PIN to view the gallery</p>
                      </div>
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Expiry (days)</label>
                        <input type="number" min={1} value={shareExpiryDays}
                          onChange={e => setShareExpiryDays(Number(e.target.value))}
                          className="w-28 px-3 py-2 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00BCEB]/40 focus:border-[#00BCEB] transition-all text-sm" />
                        <p className="text-xs text-gray-400 mt-1">Default is 7 days</p>
                      </div>
                      <button onClick={handleShare} disabled={shareLoading}
                        className="w-full py-3 bg-[#00BCEB] hover:bg-[#00A5CF] disabled:bg-gray-300 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2">
                        {shareLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Creating link…</> : <><Share2 className="h-4 w-4" />Generate Share Link</>}
                      </button>
                    </>
                  )}
                  {shareModal.links.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"/></svg>
                        </div>
                        <p className="text-sm text-green-700 font-medium">Share link created!</p>
                      </div>
                      {shareModal.sharePin && (
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                          <Lock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-amber-700 font-medium">PIN Protected — share this PIN with your client</p>
                            <p className="text-lg text-amber-900 font-mono tracking-[0.3em] font-bold">{shareModal.sharePin}</p>
                          </div>
                        </div>
                      )}
                      {shareModal.links.map((link, i) => (
                        <div key={i} className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Share Link</label>
                          <div className="flex items-center gap-2">
                            <input readOnly value={link}
                              className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 truncate focus:outline-none" />
                            <button onClick={() => copyToClipboard(link)}
                              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#00BCEB] hover:bg-[#00A5CF] text-white rounded-xl text-sm font-medium transition-all whitespace-nowrap">
                              <Copy className="h-4 w-4" />Copy
                            </button>
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-gray-400">Expires in {shareExpiryDays} day{shareExpiryDays!==1?'s':''} · {selectedItems.length} item(s) shared</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Create Folder Modal */}
          {createFolderModal && (

            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center py-8 z-50">
              <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-sm sm:max-w-md md:max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-[#2D2D2D]">Create New Folder</h3>
                  <button
                    onClick={() => {
                      setCreateFolderModal(false);
                      setNewFolderName('');
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Folder Name</label>
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Enter folder name"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00BCEB] focus:border-transparent"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateFolder();
                        }
                      }}
                    />
                  </div>
                  {!currentPath && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Folder Preset (Client Project)</label>
                      <select
                        value={folderPreset}
                        onChange={(e) => setFolderPreset(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00BCEB]"
                        disabled={createFolderLoading}
                      >
                        <option value="none">None (Empty Folder)</option>
                        <option value="wedding">Wedding (Selects, Finals, Raw, Sneak Peeks)</option>
                        <option value="portrait">Portrait (Selects, Finals, Raw)</option>
                      </select>
                    </div>
                  )}
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setCreateFolderModal(false);
                        setNewFolderName('');
                      }}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors duration-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateFolder}
                      disabled={createFolderLoading || !newFolderName.trim()}
                      className="flex items-center px-4 py-2 bg-[#00BCEB] text-white rounded-lg hover:bg-[#00A5CF] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {createFolderLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Folder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rename Folder Modal */}
          {renameFolderModal.isOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center py-8 z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-[#2D2D2D]">Rename Folder</h3>
                  <button
                    onClick={() => setRenameFolderModal({ isOpen: false, oldPath: '', newName: '' })}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Folder Name</label>
                    <input
                      type="text"
                      value={renameFolderModal.newName}
                      onChange={(e) => setRenameFolderModal({ ...renameFolderModal, newName: e.target.value })}
                      placeholder="Enter new folder name"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00BCEB] focus:border-transparent"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') handleRenameFolder();
                      }}
                    />
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setRenameFolderModal({ isOpen: false, oldPath: '', newName: '' })}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors duration-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRenameFolder}
                      disabled={renameFolderLoading || !renameFolderModal.newName.trim()}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {renameFolderLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Rename Folder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </GalleryErrorBoundary>
  );
}

export default Gallery;