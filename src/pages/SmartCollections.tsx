import React, { useState, useEffect } from 'react';
import {
  Play,
  Star,
  Clock,
  Heart,
  Download,
  FolderPlus,
  Plus,
  Trash2,
  Folder,
  Search,
  Check,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';
import { rawStoriesApiUrl, getRawStoriesToken } from '../api/rawStoriesBackend';

interface CollectionItem {
  id: string;
  title: string;
  imageUrl: string;
  isVideo: boolean;
  uploadDate: string;
  isFavorite: boolean;
  tags: string[];
}

interface CustomCollection {
  id: string;
  name: string;
  itemKeys: string[];
  createdAt: string;
}

export default function SmartCollections() {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('favorites');
  const [searchTerm, setSearchTerm] = useState('');

  // Custom collections state
  const [customCollections, setCustomCollections] = useState<CustomCollection[]>(() => {
    try {
      const saved = localStorage.getItem('rawstories_custom_collections');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [manageItemModal, setManageItemModal] = useState<CollectionItem | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const saveCustomCollections = (collections: CustomCollection[]) => {
    setCustomCollections(collections);
    localStorage.setItem('rawstories_custom_collections', JSON.stringify(collections));
  };

  const fetchItems = async () => {
    try {
      const res = await fetch(rawStoriesApiUrl('/default/getallimages'), {
        headers: { Authorization: `Bearer ${getRawStoriesToken()}` },
      });
      const data = await res.json();
      if (data.success && data.files) {
        const mapped: CollectionItem[] = data.files.map((f: any) => ({
          id: f.key,
          title: (f.filename || f.key.split('/').pop() || '').replace(/\.[^.]+$/, ''),
          imageUrl: f.presigned_url || `${rawStoriesApiUrl('')}/uploads/${f.key}`,
          isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(f.key),
          uploadDate: f.lastModified || f.last_modified || '',
          isFavorite: f.isFavorite || false,
          tags: f.tags || [],
        }));
        setItems(mapped);
      }
    } catch (err) {
      console.error('Error fetching smart collections items:', err);
    } finally {
      setLoading(false);
    }
  };

  // Create new custom collection
  const handleCreateCollection = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    const newColl: CustomCollection = {
      id: `coll_${Date.now()}`,
      name: trimmed,
      itemKeys: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [...customCollections, newColl];
    saveCustomCollections(updated);
    setNewCollectionName('');
    setCreateModalOpen(false);
    setActiveTab(newColl.id);
  };

  // Delete custom collection
  const handleDeleteCollection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this collection? (Items will not be deleted)')) return;
    const updated = customCollections.filter((c) => c.id !== id);
    saveCustomCollections(updated);
    if (activeTab === id) setActiveTab('favorites');
  };

  // Toggle item in custom collection
  const toggleItemInCollection = (collectionId: string, itemKey: string) => {
    const updated = customCollections.map((c) => {
      if (c.id !== collectionId) return c;
      const exists = c.itemKeys.includes(itemKey);
      return {
        ...c,
        itemKeys: exists ? c.itemKeys.filter((k) => k !== itemKey) : [...c.itemKeys, itemKey],
      };
    });
    saveCustomCollections(updated);
  };

  // Filter items based on activeTab
  const getTabItems = (): CollectionItem[] => {
    if (activeTab === 'favorites') {
      return items.filter((item) => item.isFavorite);
    }
    if (activeTab === 'videos') {
      return items.filter((item) => item.isVideo);
    }
    if (activeTab === 'recent') {
      const now = new Date().getTime();
      return items.filter((item) => {
        if (!item.uploadDate) return false;
        const diffDays = Math.ceil((now - new Date(item.uploadDate).getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      });
    }
    if (activeTab === 'duplicates') {
      const titleCounts = items.reduce((acc, curr) => {
        acc[curr.title] = (acc[curr.title] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return items.filter((item) => titleCounts[item.title] > 1);
    }

    // Custom collection
    const currentCustom = customCollections.find((c) => c.id === activeTab);
    if (currentCustom) {
      return items.filter((item) => currentCustom.itemKeys.includes(item.id));
    }

    return items;
  };

  const displayedItems = getTabItems().filter((item) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.tags.some((t) => t.toLowerCase().includes(q));
  });

  const activeCustomCollection = customCollections.find((c) => c.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[#00BCEB]" />
              <h1 className="text-3xl font-extrabold tracking-tight">Smart & Custom Collections</h1>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              Organize your photos & videos with automated categories and custom event collections.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search collection..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00BCEB] w-48 sm:w-60"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Create Custom Collection Button */}
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#00BCEB] hover:bg-[#00a3cc] text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-[#00BCEB]/20 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New Collection</span>
            </button>
          </div>
        </div>

        {/* Collections Tab Bar */}
        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800/80">
          {/* Smart System Collections */}
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
              activeTab === 'favorites'
                ? 'bg-[#00BCEB] text-slate-950 border-[#00BCEB] shadow-[0_0_15px_rgba(0,188,235,0.3)]'
                : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Heart className="w-3.5 h-3.5" fill={activeTab === 'favorites' ? 'currentColor' : 'none'} />
            Favorites ({items.filter((i) => i.isFavorite).length})
          </button>

          <button
            onClick={() => setActiveTab('videos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
              activeTab === 'videos'
                ? 'bg-[#00BCEB] text-slate-950 border-[#00BCEB] shadow-[0_0_15px_rgba(0,188,235,0.3)]'
                : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            Videos ({items.filter((i) => i.isVideo).length})
          </button>

          <button
            onClick={() => setActiveTab('recent')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
              activeTab === 'recent'
                ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Recently Added
          </button>

          <button
            onClick={() => setActiveTab('duplicates')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
              activeTab === 'duplicates'
                ? 'bg-rose-500 text-slate-950 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Duplicates
          </button>

          {/* Divider between Smart and Custom */}
          {customCollections.length > 0 && <div className="h-6 w-px bg-slate-700 self-center mx-1" />}

          {/* User Custom Collections */}
          {customCollections.map((coll) => (
            <div key={coll.id} className="relative group shrink-0">
              <button
                onClick={() => setActiveTab(coll.id)}
                className={`flex items-center gap-2 pl-3.5 pr-2.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                  activeTab === coll.id
                    ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                    : 'bg-slate-800/40 text-slate-300 border-slate-700/50 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Folder className="w-3.5 h-3.5 text-purple-400" />
                <span>{coll.name}</span>
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-900/60 text-slate-300">
                  {coll.itemKeys.length}
                </span>
                <span
                  onClick={(e) => handleDeleteCollection(coll.id, e)}
                  title="Delete collection"
                  className="ml-1 p-0.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-900/80 transition-colors"
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* Content Header Info */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <p>
            Showing <span className="font-bold text-white">{displayedItems.length}</span> items
            {activeCustomCollection && (
              <span className="ml-1 text-purple-300">in custom collection &ldquo;{activeCustomCollection.name}&rdquo;</span>
            )}
          </p>
          <p className="text-slate-500">Hover any item to add/remove from Custom Collections</p>
        </div>

        {/* Items Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#00BCEB] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayedItems.map((item) => (
              <div
                key={item.id}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-800/60 border border-slate-700/50 hover:border-[#00BCEB]/50 transition-all shadow-md"
              >
                {item.isVideo ? (
                  <div className="w-full h-full relative bg-slate-950">
                    <video
                      src={item.imageUrl}
                      poster={`${item.imageUrl}#t=0.1`}
                      preload="metadata"
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-full backdrop-blur-sm">
                      <Play className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                ) : (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}

                {/* Favorite badge */}
                {item.isFavorite && (
                  <div className="absolute top-2 left-2 text-amber-400 drop-shadow-md">
                    <Star className="w-4 h-4" fill="currentColor" />
                  </div>
                )}

                {/* Hover overlay with action buttons */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                  <div className="flex justify-end gap-1.5">
                    {/* Add to Custom Collection Button */}
                    <button
                      onClick={() => setManageItemModal(item)}
                      title="Manage collections"
                      className="p-2 bg-slate-900/80 hover:bg-purple-600 text-white rounded-xl backdrop-blur-sm transition-all"
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                    {/* Download Link */}
                    <a
                      href={item.imageUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      title="Download"
                      className="p-2 bg-slate-900/80 hover:bg-[#00BCEB] hover:text-slate-950 text-white rounded-xl backdrop-blur-sm transition-all"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {item.isVideo ? 'Video' : 'Photo'} &bull; {item.uploadDate ? new Date(item.uploadDate).toLocaleDateString() : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {displayedItems.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-500 bg-slate-800/20 rounded-3xl border border-slate-700/40">
                <Folder className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-base font-medium text-slate-400">No items in this collection</p>
                <p className="text-xs text-slate-600 mt-1">
                  {activeCustomCollection
                    ? 'Hover any image in Favorites or Videos and click the folder icon to add it here.'
                    : 'Items will appear here automatically.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══ Create Custom Collection Modal ══ */}
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)}>
            <div
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-purple-400" />
                  <h3 className="text-base font-bold text-white">Create Custom Collection</h3>
                </div>
                <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreateCollection} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Collection Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g. Haldi Ceremony, Drone Highlights..."
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newCollectionName.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50"
                  >
                    Create Collection
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══ Add/Remove Item to Custom Collections Modal ══ */}
        {manageItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setManageItemModal(null)}>
            <div
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Folder className="w-5 h-5 text-purple-400" />
                  <h3 className="text-base font-bold text-white">Add to Collection</h3>
                </div>
                <button onClick={() => setManageItemModal(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl mb-4 border border-slate-700/50">
                <img src={manageItemModal.imageUrl} alt={manageItemModal.title} className="w-12 h-12 object-cover rounded-lg shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{manageItemModal.title}</p>
                  <p className="text-[10px] text-slate-400">{manageItemModal.isVideo ? 'Video' : 'Photo'}</p>
                </div>
              </div>

              {customCollections.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No custom collections yet.{' '}
                  <button
                    onClick={() => {
                      setManageItemModal(null);
                      setCreateModalOpen(true);
                    }}
                    className="text-purple-400 font-bold underline"
                  >
                    Create one first
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {customCollections.map((coll) => {
                    const inCollection = coll.itemKeys.includes(manageItemModal.id);
                    return (
                      <button
                        key={coll.id}
                        onClick={() => toggleItemInCollection(coll.id, manageItemModal.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          inCollection
                            ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                            : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-xs font-semibold">{coll.name}</span>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                            inCollection
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'border-slate-600 bg-slate-800'
                          }`}
                        >
                          {inCollection && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end mt-5">
                <button
                  onClick={() => setManageItemModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
