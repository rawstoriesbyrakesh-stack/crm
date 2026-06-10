import React, { useState, useEffect } from 'react';
import { Play, Star, Clock, Heart, Download } from 'lucide-react';
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

export default function SmartCollections() {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'favorites' | 'videos' | 'recent' | 'duplicates'>('favorites');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const res = await fetch(rawStoriesApiUrl('/default/getallimages'), {
        headers: { Authorization: `Bearer ${getRawStoriesToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        const mapped = data.files.map((f: any) => ({
          id: f.key,
          title: (f.filename || f.key.split('/').pop() || '').replace(/\.[^.]+$/, ''),
          imageUrl: f.presigned_url || `${rawStoriesApiUrl('')}/uploads/${f.key}`,
          isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(f.key),
          uploadDate: f.lastModified,
          isFavorite: f.isFavorite || false,
          tags: f.tags || []
        }));
        setItems(mapped);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    if (activeTab === 'favorites') return item.isFavorite;
    if (activeTab === 'videos') return item.isVideo;
    if (activeTab === 'recent') {
      const date = new Date(item.uploadDate);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      return diffDays <= 7;
    }
    if (activeTab === 'duplicates') {
      const titleCounts = items.reduce((acc, curr) => {
        acc[curr.title] = (acc[curr.title] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return titleCounts[item.title] > 1;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Smart Collections</h1>
        
        <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
          <button 
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'favorites' ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <Heart className="w-4 h-4" /> Favorites
          </button>
          <button 
            onClick={() => setActiveTab('videos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'videos' ? 'bg-primary-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <Play className="w-4 h-4" /> Videos
          </button>
          <button 
            onClick={() => setActiveTab('recent')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'recent' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <Clock className="w-4 h-4" /> Recently Added
          </button>
          <button 
            onClick={() => setActiveTab('duplicates')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'duplicates' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg> Duplicates
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredItems.map(item => (
              <div key={item.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-800">
                {item.isVideo ? (
                  <video src={item.imageUrl} className="w-full h-full object-cover" />
                ) : (
                  <img src={item.imageUrl} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <a href={item.imageUrl} target="_blank" rel="noreferrer" className="p-2 bg-white/20 hover:bg-white/40 rounded-full">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
                {item.isVideo && <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full"><Play className="w-3 h-3 text-white" /></div>}
                {item.isFavorite && <div className="absolute top-2 left-2 text-yellow-400 drop-shadow-md"><Star className="w-4 h-4" fill="currentColor" /></div>}
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                No items found in this collection.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
