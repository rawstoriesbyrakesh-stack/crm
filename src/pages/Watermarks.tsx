import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Droplet, Plus, Trash2, Image as ImageIcon, Check, Layers, Folder, Download, Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { rawStoriesApiUrl, getRawStoriesToken } from '../api/rawStoriesBackend';

type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top' | 'bottom' | 'left' | 'right' | 'none';

interface WatermarkPreset {
  id: string;
  imageUrl: string;
  imageName: string;
  position: WatermarkPosition;
  // optional UI placement/size saved from preview
  x?: number;
  y?: number;
  width?: number;
  xRatio?: number;
  yRatio?: number;
  sizeRatio?: number;
  useCustomCoordinates?: boolean;
  opacity?: number;
  rotation?: number;
  lastUsed: number;
  isText?: boolean;
  text?: string;
  fontFamily?: string;
  fontColor?: string;
}

export default function Watermarks() {
  const [presets, setPresets] = useState<WatermarkPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [wmWidth, setWmWidth] = useState<number>(120);
  const [wmX, setWmX] = useState<number>(20);
  const [wmY, setWmY] = useState<number>(20);
  const [wmAspect, setWmAspect] = useState<number>(1);
  const [wmOpacity, setWmOpacity] = useState<number>(70);
  const [wmRotation, setWmRotation] = useState<number>(0);
  const [keyboardEnabled, setKeyboardEnabled] = useState<boolean>(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [newImage, setNewImage] = useState<string | null>(null);
  const [newImageName, setNewImageName] = useState('');
  const [newPosition, setNewPosition] = useState<WatermarkPosition>('bottom-right');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Watermark State
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkFolders, setBulkFolders] = useState<{ name: string; path: string }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [bulkPresetId, setBulkPresetId] = useState<string>('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (bulkModalOpen) {
      fetchAvailableFolders();
      if (!bulkPresetId && presets.length > 0) {
        setBulkPresetId(presets[0].id);
      }
    }
  }, [bulkModalOpen]);

  const fetchAvailableFolders = async () => {
    try {
      const res = await fetch(rawStoriesApiUrl('/default/getallimages'), {
        headers: { Authorization: `Bearer ${getRawStoriesToken()}` },
      });
      const data = await res.json();
      if (data.folders) {
        setBulkFolders(data.folders);
        if (data.folders.length > 0 && !selectedFolder) {
          setSelectedFolder(data.folders[0].path);
        }
      }
    } catch (err) {
      console.error('Failed to fetch folders for bulk watermark:', err);
    }
  };

  const handleRunBulkWatermark = async () => {
    const preset = presets.find(p => p.id === bulkPresetId) || presets[0];
    if (!preset) {
      alert('Please select a watermark preset first');
      return;
    }
    if (!selectedFolder) {
      alert('Please select a folder to watermark');
      return;
    }

    setBulkLoading(true);
    setBulkSuccess(null);
    setBulkProgress({ current: 0, total: 0, status: 'Fetching images in folder...' });

    try {
      const folderPrefix = selectedFolder.replace(/^\//, '').replace(/\/?$/, '/');
      const res = await fetch(rawStoriesApiUrl(`/default/getallimages?prefix=${encodeURIComponent(folderPrefix)}`), {
        headers: { Authorization: `Bearer ${getRawStoriesToken()}` },
      });
      const data = await res.json();
      const files = (data.files || []).filter((f: any) => {
        const key = f.key || f.filename || '';
        return /\.(jpe?g|png|webp)$/i.test(key);
      });

      if (files.length === 0) {
        setBulkProgress(null);
        setBulkLoading(false);
        alert('No eligible images found in this folder.');
        return;
      }

      setBulkProgress({ current: 0, total: files.length, status: `Starting bulk watermarking (${files.length} images)...` });

      // Load watermark image
      const wmImg = new Image();
      wmImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        wmImg.onload = () => resolve();
        wmImg.onerror = () => reject(new Error('Failed to load watermark image'));
        wmImg.src = preset.imageUrl;
      });

      const zip = new JSZip();

      for (let i = 0; i < files.length; i++) {
        const fileItem = files[i];
        const filename = fileItem.filename || fileItem.key.split('/').pop() || `image_${i+1}.jpg`;
        const fileUrl = fileItem.presigned_url || `${rawStoriesApiUrl('')}/uploads/${fileItem.key}`;

        setBulkProgress({
          current: i + 1,
          total: files.length,
          status: `Processing ${filename} (${i + 1}/${files.length})...`,
        });

        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // continue on single image error
            img.src = fileUrl;
          });

          if (!img.width || !img.height) continue;

          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          // Draw base image
          ctx.drawImage(img, 0, 0);

          // Calculate watermark dimensions
          const sizeRatio = preset.sizeRatio ?? 0.22;
          const targetWmWidth = canvas.width * sizeRatio;
          const wmAspect = (wmImg.height && wmImg.width) ? wmImg.height / wmImg.width : 1;
          const targetWmHeight = targetWmWidth * wmAspect;

          // Compute coordinates
          let x = canvas.width - targetWmWidth - (canvas.width * 0.03);
          let y = canvas.height - targetWmHeight - (canvas.height * 0.03);

          if (preset.position === 'top-left') {
            x = canvas.width * 0.03;
            y = canvas.height * 0.03;
          } else if (preset.position === 'top-right') {
            x = canvas.width - targetWmWidth - (canvas.width * 0.03);
            y = canvas.height * 0.03;
          } else if (preset.position === 'bottom-left') {
            x = canvas.width * 0.03;
            y = canvas.height - targetWmHeight - (canvas.height * 0.03);
          } else if (preset.position === 'center') {
            x = (canvas.width - targetWmWidth) / 2;
            y = (canvas.height - targetWmHeight) / 2;
          }

          // Apply opacity and rotation
          ctx.save();
          ctx.globalAlpha = preset.opacity ?? 0.75;

          if (preset.rotation) {
            const cx = x + targetWmWidth / 2;
            const cy = y + targetWmHeight / 2;
            ctx.translate(cx, cy);
            ctx.rotate((preset.rotation * Math.PI) / 180);
            ctx.drawImage(wmImg, -targetWmWidth / 2, -targetWmHeight / 2, targetWmWidth, targetWmHeight);
          } else {
            ctx.drawImage(wmImg, x, y, targetWmWidth, targetWmHeight);
          }
          ctx.restore();

          // Get image blob
          const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.92));
          if (blob) {
            zip.file(filename, blob);
          }
        } catch (itemErr) {
          console.warn(`Failed watermarking item ${filename}`, itemErr);
        }
      }

      setBulkProgress({ current: files.length, total: files.length, status: 'Generating ZIP archive...' });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const folderName = selectedFolder.replace(/[^a-zA-Z0-9]/g, '_') || 'folder';
      saveAs(zipBlob, `watermarked_${folderName}_${Date.now()}.zip`);

      setBulkSuccess(`Successfully watermarked ${files.length} images! Archive downloaded.`);
    } catch (err: any) {
      alert(`Bulk watermarking failed: ${err.message}`);
    } finally {
      setBulkLoading(false);
      setBulkProgress(null);
    }
  };

  // Text watermark state
  const [wmType, setWmType] = useState<'image' | 'text'>('image');
  const [newText, setNewText] = useState('STUDIO LOGO');
  const [newFontFamily, setNewFontFamily] = useState('Outfit');
  const [newFontColor, setNewFontColor] = useState('#ffffff');
  const [newFontWeight, setNewFontWeight] = useState('bold');
  const [newFontStyle, setNewFontStyle] = useState('normal');

  useEffect(() => {
    if (wmType === 'text') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="150"><style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&amp;family=Playfair+Display:ital,wght@0,400;0,700;1,400&amp;family=Cinzel:wght@700&amp;family=Dancing+Script:wght@700&amp;display=swap');</style><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${newFontColor}" font-family="${newFontFamily}, sans-serif" font-size="28" font-weight="${newFontWeight}" font-style="${newFontStyle}">${newText}</text></svg>`;
      const base64Svg = btoa(unescape(encodeURIComponent(svg)));
      setNewImage(`data:image/svg+xml;base64,${base64Svg}`);
      setNewImageName(newText || 'Text Watermark');
    }
  }, [wmType, newText, newFontFamily, newFontColor, newFontWeight, newFontStyle]);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = () => {
    try {
      const saved = localStorage.getItem('watermarkPresets');
      if (saved) {
        setPresets(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load watermarks', e);
    }
  };

  const savePresets = (newPresets: WatermarkPreset[]) => {
    try {
      localStorage.setItem('watermarkPresets', JSON.stringify(newPresets));
      setPresets(newPresets);
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') {
        alert('Storage quota exceeded. Please delete some existing watermarks first. Note: Large images consume more storage.');
      } else {
        alert('Failed to save watermark: ' + e.message);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size to prevent quota issues
    if (file.size > 500 * 1024) {
      alert('Watermark image should be less than 500KB to save storage quota. Please compress it first.');
      return;
    }

    setNewImageName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setNewImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddPreset = () => {
    if (!newImage) return;

    const newPreset: WatermarkPreset = {
      id: Math.random().toString(36).substring(2, 11),
      imageUrl: newImage,
      imageName: newImageName || 'Untitled Watermark',
      position: newPosition,
      sizeRatio: 0.2,
      opacity: 0.7,
      rotation: 0,
      lastUsed: Date.now(),
      isText: wmType === 'text',
      text: wmType === 'text' ? newText : undefined,
      fontFamily: wmType === 'text' ? newFontFamily : undefined,
      fontColor: wmType === 'text' ? newFontColor : undefined,
    };

    const updated = [...presets, newPreset];
    savePresets(updated);
    setNewImage(null);
    setNewImageName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Reset text fields if text type
    if (wmType === 'text') {
      setNewText('STUDIO LOGO');
    }
  };

  const handleDeletePreset = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this watermark preset?')) return;
    const updated = presets.filter(p => p.id !== id);
    savePresets(updated);
  };

  const getPositionLabel = (pos: WatermarkPosition) => {
    return pos.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const loadImageDimensions = (url: string) => new Promise<{w:number,h:number}>((res) => {
    const img = new globalThis.Image();
    img.onload = () => res({w: img.naturalWidth, h: img.naturalHeight});
    img.src = url;
  });

  const selectPreset = async (preset: WatermarkPreset) => {
    setSelectedPresetId(preset.id);
    // init preview sizes/position
    const preview = previewRef.current;
    if (!preview) return;
    const rect = preview.getBoundingClientRect();
    const dims = await loadImageDimensions(preset.imageUrl);
    const initWidth = preset.width ?? Math.min(180, rect.width * (preset.sizeRatio ?? 0.2));
    const aspect = dims.h / dims.w || 1;
    const initHeight = initWidth * aspect;
    const initX = preset.x ?? (typeof preset.xRatio === 'number' ? preset.xRatio * rect.width : Math.max(8, (rect.width - initWidth) / 2));
    const initY = preset.y ?? (typeof preset.yRatio === 'number' ? preset.yRatio * rect.height : Math.max(8, (rect.height - initHeight) / 2));
    setWmWidth(initWidth);
    setWmX(initX);
    setWmY(initY);
    setWmAspect(aspect);
    setWmOpacity(Math.round((preset.opacity ?? 0.7) * 100));
    setWmRotation(preset.rotation ?? 0);
  };

  // Drag / resize handlers (document-level listeners)
  useEffect(() => {
    let dragStart: {x:number,y:number,wmX:number,wmY:number} | null = null;
    let resizeStart: {x:number,wmWidth:number} | null = null;

    const onPointerMove = (e: PointerEvent) => {
      if (dragStart) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        const preview = previewRef.current;
        if (!preview) return;
        const rect = preview.getBoundingClientRect();
        const imgH = wmWidth * wmAspect;
        const newX = Math.min(Math.max(0, dragStart.wmX + dx), Math.max(0, rect.width - wmWidth));
        const newY = Math.min(Math.max(0, dragStart.wmY + dy), Math.max(0, rect.height - imgH));
        setWmX(newX);
        setWmY(newY);
      }
      if (resizeStart) {
        const dx = e.clientX - resizeStart.x;
        const preview = previewRef.current;
        if (!preview) return;
        const rect = preview.getBoundingClientRect();
        const newW = Math.min(Math.max(24, resizeStart.wmWidth + dx), Math.max(24, rect.width - wmX - 8));
        setWmWidth(newW);
      }
    };

    const onPointerUp = () => { dragStart = null; resizeStart = null; };

    const onDocPointerDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null);
      if (!el) return;
      const dragTarget = el.closest('[data-action="wm-drag"]') as HTMLElement | null;
      const resizeTarget = el.closest('[data-action="wm-resize"]') as HTMLElement | null;
      if (dragTarget) {
        dragStart = { x: e.clientX, y: e.clientY, wmX, wmY };
        e.preventDefault();
      }
      if (resizeTarget) {
        resizeStart = { x: e.clientX, wmWidth };
        e.preventDefault();
      }
    };

    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [wmWidth, wmX, wmY]);

  const persistSelectedLayout = (id: string) => {
    const preview = previewRef.current;
    const rect = preview?.getBoundingClientRect();
    const updated = presets.map(p => p.id === id ? {
      ...p,
      x: wmX,
      y: wmY,
      width: wmWidth,
      xRatio: rect ? wmX / rect.width : p.xRatio,
      yRatio: rect ? wmY / rect.height : p.yRatio,
      sizeRatio: rect ? wmWidth / rect.width : p.sizeRatio,
      useCustomCoordinates: true,
      opacity: wmOpacity / 100,
      rotation: wmRotation,
    } : p);
    savePresets(updated);
  };

  // Keyboard controls: arrow keys to nudge, +/- to resize, Enter save, Esc close
  useEffect(() => {
    if (!selectedPresetId) {
      setKeyboardEnabled(false);
      return;
    }
    setKeyboardEnabled(true);
    const onKey = (e: KeyboardEvent) => {
      if (!selectedPresetId) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') {
        setWmX(x => Math.max(0, x - step));
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        setWmX(x => x + step);
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setWmY(y => Math.max(0, y - step));
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        setWmY(y => y + step);
        e.preventDefault();
      } else if (e.key === '+' || e.key === '=') {
        setWmWidth(w => w + step);
        e.preventDefault();
      } else if (e.key === '-') {
        setWmWidth(w => Math.max(8, w - step));
        e.preventDefault();
      } else if (e.key === 'Enter') {
        persistSelectedLayout(selectedPresetId);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setSelectedPresetId(null);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPresetId, persistSelectedLayout]);

  const renderPositionButton = (pos: WatermarkPosition, current: WatermarkPosition, onClick: (p: WatermarkPosition) => void) => (
    <button
      onClick={() => onClick(pos)}
      className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
        current === pos
          ? 'border-primary-500 bg-primary-500/10 text-primary-400'
          : 'border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-slate-600'
      }`}
    >
      <div className="w-10 h-10 border-2 border-current rounded relative">
        <div className={`absolute w-2 h-2 bg-current rounded-full ${
          pos === 'top-left' ? 'top-2 left-2' :
          pos === 'top-right' ? 'top-2 right-2' :
          pos === 'bottom-left' ? 'bottom-2 left-2' :
          pos === 'bottom-right' ? 'bottom-2 right-2' :
          pos === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' :
          pos === 'top' ? 'top-2 left-1/2 -translate-x-1/2' :
          pos === 'bottom' ? 'bottom-2 left-1/2 -translate-x-1/2' :
          pos === 'left' ? 'top-1/2 left-2 -translate-y-1/2' :
          pos === 'right' ? 'top-1/2 right-2 -translate-y-1/2' : 'hidden'
        }`} />
      </div>
      <span className="text-xs font-medium">{getPositionLabel(pos)}</span>
    </button>
  );

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full">
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight"
        >
          Watermarks
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-slate-400 text-lg"
        >
          Manage your watermark presets and batch watermark entire shoot folders
        </motion.p>
        </div>
        <div className="shrink-0">
          <button
            onClick={() => setBulkModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-[#00BCEB] hover:from-blue-500 hover:to-[#00a3cc] text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-0.5"
          >
            <Layers className="w-5 h-5" />
            <span>Bulk Watermark Folder</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add New Watermark */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-1"
        >
          <div className="glass-dark rounded-3xl p-6 border border-slate-700/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Droplet className="w-32 h-32 text-primary-500" />
            </div>
            
            <h2 className="text-xl font-bold text-white mb-6 relative z-10 flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary-400" /> Add New Preset
            </h2>

            <div className="flex bg-slate-800/80 p-1.5 rounded-2xl mb-6 border border-slate-700/50 relative z-10">
              <button
                type="button"
                onClick={() => { setWmType('image'); setNewImage(null); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                  wmType === 'image' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Image Logo
              </button>
              <button
                type="button"
                onClick={() => setWmType('text')}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                  wmType === 'text' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Text Logo
              </button>
            </div>

            <div className="space-y-6 relative z-10">
              {wmType === 'image' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Watermark Image</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {!newImage ? (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-8 border-2 border-dashed border-slate-600 rounded-2xl text-slate-400 hover:border-primary-500 hover:text-primary-400 hover:bg-primary-500/5 transition-all flex flex-col items-center gap-3"
                    >
                      <ImageIcon className="w-8 h-8" />
                      <span>Click to select image</span>
                      <span className="text-xs opacity-60">Max size: 500KB (PNG recommended)</span>
                    </button>
                  ) : (
                    <div className="relative group rounded-2xl overflow-hidden border border-slate-700 bg-slate-800/50 p-4 flex flex-col items-center">
                      <img src={newImage} alt="Preview" className="max-h-32 object-contain" />
                      <button
                        onClick={() => { setNewImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <p className="text-xs text-slate-400 mt-3 truncate w-full text-center">{newImageName}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {newImage && (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-800/50 p-4 flex flex-col items-center">
                      <img src={newImage} alt="Preview" className="max-h-24 object-contain" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }} />
                      <p className="text-xs text-slate-400 mt-3 truncate w-full text-center">{newImageName}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Watermark Text</label>
                    <input
                      type="text"
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      placeholder="e.g. STUDIO BY RAKESH"
                      className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-slate-600"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Font Family</label>
                      <select
                        value={newFontFamily}
                        onChange={(e) => setNewFontFamily(e.target.value)}
                        className="w-full bg-slate-800/55 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#00BCEB]"
                      >
                        <option value="Outfit">Outfit (Modern Luxury)</option>
                        <option value="Playfair Display">Playfair (High-End Serif)</option>
                        <option value="Cinzel">Cinzel (Cinematic)</option>
                        <option value="Dancing Script">Dancing Script (Signature)</option>
                        <option value="Inter">Inter (Clean Minimal)</option>
                        <option value="Montserrat">Montserrat (Studio Bold)</option>
                        <option value="Georgia">Georgia (Classic Editorial)</option>
                        <option value="Impact">Impact (Bold Headline)</option>
                        <option value="monospace">Monospace (Tech)</option>
                        <option value="cursive">Cursive (Handwritten)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Weight & Style</label>
                      <div className="flex gap-2">
                        <select
                          value={newFontWeight}
                          onChange={(e) => setNewFontWeight(e.target.value)}
                          className="w-1/2 bg-slate-800/55 border border-slate-700 text-white rounded-xl px-2 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#00BCEB]"
                        >
                          <option value="normal">Normal</option>
                          <option value="bold">Bold</option>
                          <option value="300">Light</option>
                          <option value="900">Black</option>
                        </select>
                        <select
                          value={newFontStyle}
                          onChange={(e) => setNewFontStyle(e.target.value)}
                          className="w-1/2 bg-slate-800/55 border border-slate-700 text-white rounded-xl px-2 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#00BCEB]"
                        >
                          <option value="normal">Regular</option>
                          <option value="italic">Italic</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Font Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={newFontColor}
                          onChange={(e) => setNewFontColor(e.target.value)}
                          className="w-10 h-10 bg-transparent border-0 cursor-pointer rounded-lg shrink-0"
                        />
                        <input
                          type="text"
                          value={newFontColor}
                          onChange={(e) => setNewFontColor(e.target.value)}
                          placeholder="#ffffff"
                          maxLength={7}
                          className="w-full bg-slate-800/55 border border-slate-700 text-white rounded-xl px-2 py-2.5 text-xs font-mono text-center focus:outline-none focus:ring-2 focus:ring-[#00BCEB]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {newImage && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <label className="block text-sm font-medium text-slate-300 mb-3">Default Position</label>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {renderPositionButton('top-left', newPosition, setNewPosition)}
                    {renderPositionButton('top', newPosition, setNewPosition)}
                    {renderPositionButton('top-right', newPosition, setNewPosition)}

                    {renderPositionButton('left', newPosition, setNewPosition)}
                    {renderPositionButton('center', newPosition, setNewPosition)}
                    {renderPositionButton('right', newPosition, setNewPosition)}

                    {renderPositionButton('bottom-left', newPosition, setNewPosition)}
                    {renderPositionButton('bottom', newPosition, setNewPosition)}
                    {renderPositionButton('bottom-right', newPosition, setNewPosition)}
                  </div>

                  <button
                    onClick={handleAddPreset}
                    className="w-full py-3.5 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white rounded-xl font-medium transition-all shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" /> Save Watermark
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Existing Watermarks */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2"
        >
          <div className="glass-dark rounded-3xl p-6 md:p-8 border border-slate-700/50 h-full">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Droplet className="w-5 h-5 text-primary-400" /> Saved Presets ({presets.length})
            </h2>

            {/* Preview area for selected preset */}
            <div className="mb-6">
              <div ref={previewRef} className="w-full h-64 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl relative overflow-hidden border border-slate-700/40">
                {/* Example background content */}
                <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm pointer-events-none">Preview area — drag the watermark to reposition and use corner to resize</div>

                {selectedPresetId && (() => {
                  const preset = presets.find(p => p.id === selectedPresetId);
                  if (!preset) return null;
                  return (
                    <div
                      data-action="wm-drag"
                      className="absolute cursor-move"
                      style={{ left: wmX, top: wmY, width: wmWidth, zIndex: 20, boxShadow: '0 6px 18px rgba(0,0,0,0.6)', borderRadius: 6, overflow: 'visible' }}
                    >
                      <img
                        src={preset.imageUrl}
                        alt={preset.imageName}
                        style={{
                          width: '100%',
                          height: 'auto',
                          display: 'block',
                          borderRadius: 6,
                          opacity: wmOpacity / 100,
                          transform: `rotate(${wmRotation}deg)`,
                        }}
                      />
                      <div
                        data-action="wm-resize"
                        className="absolute right-0 bottom-0 w-7 h-7 bg-white/20 border border-white/20 rounded-sm cursor-nwse-resize flex items-center justify-center"
                        style={{ transform: 'translate(50%, 50%)', zIndex: 30 }}
                      >
                        <div className="w-2 h-2 bg-white/60 rotate-45" />
                      </div>
                    </div>
                  );
                })()}
              </div>
              {selectedPresetId && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <label className="space-y-2">
                    <span className="flex justify-between text-xs text-slate-400">
                      <span>Size</span>
                      <span>{Math.round(wmWidth)}px</span>
                    </span>
                    <input
                      type="range"
                      min="40"
                      max="320"
                      value={wmWidth}
                      onChange={(e) => setWmWidth(Number(e.target.value))}
                      className="w-full accent-primary-500"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="flex justify-between text-xs text-slate-400">
                      <span>Opacity</span>
                      <span>{wmOpacity}%</span>
                    </span>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={wmOpacity}
                      onChange={(e) => setWmOpacity(Number(e.target.value))}
                      className="w-full accent-primary-500"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="flex justify-between text-xs text-slate-400">
                      <span>Rotation</span>
                      <span>{wmRotation} deg</span>
                    </span>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      value={wmRotation}
                      onChange={(e) => setWmRotation(Number(e.target.value))}
                      className="w-full accent-primary-500"
                    />
                  </label>
                </div>
              )}
              <div className="flex items-center gap-3 mt-3">
                {selectedPresetId ? (
                  <>
                    <div className="ml-auto mr-2 text-xs text-white flex items-center gap-2">
                      <span className="font-medium">Position (X / Y):</span>
                      <span>
                        {previewRef.current ? `${Math.round((wmX / previewRef.current.getBoundingClientRect().width) * 100)}% / ${Math.round((wmY / previewRef.current.getBoundingClientRect().height) * 100)}%` : '—'}
                      </span>
                    </div>
                    <button
                      onClick={() => selectedPresetId && persistSelectedLayout(selectedPresetId)}
                      className="py-2 px-3 bg-primary-600 text-white rounded-xl text-sm"
                    >
                      Save Layout
                    </button>
                    <button
                      onClick={() => setSelectedPresetId(null)}
                      className="py-2 px-3 bg-slate-800 text-slate-300 rounded-xl text-sm"
                    >
                      Close Preview
                    </button>
                    <div className="text-xs text-slate-400 ml-auto">Drag, resize, rotate, then save.</div>
                  </>
                ) : (
                  <div className="text-sm text-slate-400">Select a preset to preview and resize the watermark.</div>
                )}
              </div>
            </div>

            {presets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
                  <Droplet className="w-10 h-10 text-slate-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-300 mb-2">No presets yet</h3>
                <p className="text-slate-500">Add your first watermark preset from the left panel.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {presets.sort((a, b) => b.lastUsed - a.lastUsed).map((preset) => (
                  <div 
                    key={preset.id} 
                    className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 flex items-center gap-4 group hover:border-primary-500/30 transition-all"
                  >
                    <div className="w-20 h-20 rounded-xl bg-slate-900/50 border border-slate-700 flex items-center justify-center p-2 shrink-0">
                      <img src={preset.imageUrl} alt={preset.imageName} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate mb-1">{preset.imageName}</h4>
                      <p className="text-xs text-slate-400 flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                        {getPositionLabel(preset.position)} · {Math.round((preset.sizeRatio ?? 0.2) * 100)}% · {Math.round((preset.opacity ?? 0.7) * 100)}%
                      </p>
                      <button
                        onClick={() => handleDeletePreset(preset.id)}
                        className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => selectPreset(preset)}
                        className="ml-2 text-xs text-slate-200 bg-slate-700/30 hover:bg-slate-700/50 font-medium px-2 py-1 rounded transition-colors"
                      >
                        Preview & Resize
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
      {/* ══ Bulk Watermark Modal ══ */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => !bulkLoading && setBulkModalOpen(false)}>
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-[#00BCEB]" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Bulk Watermark Folder</h3>
                  <p className="text-xs text-slate-400">Batch apply logo or text to all photos in a folder</p>
                </div>
              </div>
              {!bulkLoading && (
                <button onClick={() => setBulkModalOpen(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {bulkSuccess && (
              <div className="mb-6 p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-emerald-300 text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{bulkSuccess}</span>
              </div>
            )}

            <div className="space-y-5">
              {/* Preset Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">1. Choose Watermark Preset</label>
                {presets.length === 0 ? (
                  <p className="text-xs text-amber-400">No presets saved. Please create a watermark preset first.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                    {presets.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setBulkPresetId(p.id)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                          bulkPresetId === p.id
                            ? 'border-[#00BCEB] bg-[#00BCEB]/10 text-white shadow-[0_0_12px_rgba(0,188,235,0.3)]'
                            : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center p-1 shrink-0">
                          <img src={p.imageUrl} alt={p.imageName} className="max-w-full max-h-full object-contain" />
                        </div>
                        <span className="text-xs font-semibold truncate flex-1">{p.imageName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Folder Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">2. Choose Target Folder</label>
                {bulkFolders.length === 0 ? (
                  <p className="text-xs text-slate-400">Loading folders or no folders created...</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {bulkFolders.map(f => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => setSelectedFolder(f.path)}
                        className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                          selectedFolder === f.path
                            ? 'border-blue-500 bg-blue-500/10 text-white'
                            : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Folder className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-xs font-medium truncate flex-1">{f.name}</span>
                        {selectedFolder === f.path && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {bulkProgress && (
                <div className="space-y-2 p-4 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">{bulkProgress.status}</span>
                    {bulkProgress.total > 0 && (
                      <span className="text-[#00BCEB] font-bold">
                        {Math.round((bulkProgress.current / bulkProgress.total) * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-[#00BCEB] transition-all duration-200"
                      style={{
                        width: bulkProgress.total > 0 ? `${(bulkProgress.current / bulkProgress.total) * 100}%` : '30%',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  disabled={bulkLoading}
                  className="px-5 py-2.5 text-xs text-slate-400 hover:text-white font-semibold rounded-xl"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleRunBulkWatermark}
                  disabled={bulkLoading || !selectedFolder || !bulkPresetId}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-[#00BCEB] hover:from-blue-500 hover:to-[#00a3cc] text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{bulkLoading ? 'Watermarking...' : 'Watermark & Download ZIP'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
