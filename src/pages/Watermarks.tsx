import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Droplet, Plus, Trash2, Image as ImageIcon, Check } from 'lucide-react';

type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'none';

interface WatermarkPreset {
  id: string;
  imageUrl: string;
  imageName: string;
  position: WatermarkPosition;
  // optional UI placement/size saved from preview
  x?: number;
  y?: number;
  width?: number;
  lastUsed: number;
}

export default function Watermarks() {
  const [presets, setPresets] = useState<WatermarkPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [wmWidth, setWmWidth] = useState<number>(120);
  const [wmX, setWmX] = useState<number>(20);
  const [wmY, setWmY] = useState<number>(20);
  const [wmAspect, setWmAspect] = useState<number>(1);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [newImage, setNewImage] = useState<string | null>(null);
  const [newImageName, setNewImageName] = useState('');
  const [newPosition, setNewPosition] = useState<WatermarkPosition>('bottom-right');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      lastUsed: Date.now(),
    };

    const updated = [...presets, newPreset];
    savePresets(updated);
    setNewImage(null);
    setNewImageName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    const img = new Image();
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
    const initWidth = preset.width ?? Math.min(160, rect.width * 0.25);
    const aspect = dims.h / dims.w || 1;
    const initHeight = initWidth * aspect;
    const initX = preset.x ?? Math.max(8, (rect.width - initWidth) / 2);
    const initY = preset.y ?? Math.max(8, (rect.height - initHeight) / 2);
    setWmWidth(initWidth);
    setWmX(initX);
    setWmY(initY);
    setWmAspect(aspect);
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
    const updated = presets.map(p => p.id === id ? { ...p, x: wmX, y: wmY, width: wmWidth } : p);
    savePresets(updated);
  };

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
          pos === 'top-left' ? 'top-1 left-1' :
          pos === 'top-right' ? 'top-1 right-1' :
          pos === 'bottom-left' ? 'bottom-1 left-1' :
          pos === 'bottom-right' ? 'bottom-1 right-1' :
          pos === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : 'hidden'
        }`} />
      </div>
      <span className="text-xs font-medium">{getPositionLabel(pos)}</span>
    </button>
  );

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full">
      <div className="mb-10">
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
          Manage your watermark presets for easy application during uploads
        </motion.p>
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

            <div className="space-y-6 relative z-10">
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

              {newImage && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <label className="block text-sm font-medium text-slate-300 mb-3">Default Position</label>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    {renderPositionButton('top-left', newPosition, setNewPosition)}
                    {renderPositionButton('top-right', newPosition, setNewPosition)}
                    {renderPositionButton('bottom-left', newPosition, setNewPosition)}
                    {renderPositionButton('bottom-right', newPosition, setNewPosition)}
                    {renderPositionButton('center', newPosition, setNewPosition)}
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
                      style={{ left: wmX, top: wmY, width: wmWidth, zIndex: 20 }}
                    >
                      <img src={preset.imageUrl} alt={preset.imageName} style={{ width: '100%', height: 'auto', display: 'block' }} />
                      <div
                        data-action="wm-resize"
                        className="absolute right-0 bottom-0 w-5 h-5 bg-white/30 rounded-sm cursor-nwse-resize"
                        style={{ transform: 'translate(50%, 50%)', zIndex: 30 }}
                      />
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-3 mt-3">
                {selectedPresetId ? (
                  <>
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
                    <div className="text-xs text-slate-400 ml-auto">Width: {Math.round(wmWidth)}px</div>
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
                        {getPositionLabel(preset.position)}
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
    </div>
  );
}
