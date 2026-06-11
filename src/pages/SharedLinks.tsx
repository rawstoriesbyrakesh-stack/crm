import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link as LinkIcon, 
  Copy, 
  Check, 
  Trash2, 
  ExternalLink,
  Search,
  Lock,
  Unlock,
  AlertCircle,
  BarChart2,
  DownloadCloud,
  Code,
  Heart,
  MessageSquare,
  X
} from 'lucide-react';
import { rawStoriesApiUrl, getRawStoriesToken } from '../api/rawStoriesBackend';

interface ShareLink {
  _id: string;
  shareId: string;
  folderPrefix: string;
  items: string[];
  sharePin: string;
  allowDownload: boolean;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
  viewCount?: number;
  ips?: string[];
  lastAccess?: string;
  downloadCount?: number;
  favorites?: string[];
}

export default function SharedLinks() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFavoritesLink, setSelectedFavoritesLink] = useState<ShareLink | null>(null);

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(rawStoriesApiUrl('/default/listshares'), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        mode: 'cors',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.shares) {
          setLinks(data.shares);
        }
      }
    } catch (error) {
      console.error('Failed to load shared links:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string, type: string = 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(`${id}-${type}`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const revokeLink = async (shareId: string) => {
    if (!window.confirm('Are you sure you want to revoke this link? Anyone with this link will lose access.')) return;

    try {
      await fetch(rawStoriesApiUrl('/default/revokeshare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        mode: 'cors',
        body: JSON.stringify({ shareId }),
      });
      loadLinks(); // Reload to reflect changes
      // Notify other UI (dashboard) that shares changed
      try { window.dispatchEvent(new Event('rawstories_shares_changed')); } catch (e) {}
    } catch (error) {
      console.error('Failed to revoke link:', error);
      alert('Failed to revoke link. Please try again.');
    }
  };

  const deleteLink = async (shareId: string) => {
    if (!window.confirm('Delete this share record from the server? This cannot be undone.')) return;
    try {
      await fetch(rawStoriesApiUrl('/default/deleteshare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        mode: 'cors',
        body: JSON.stringify({ shareId }),
      });
      loadLinks();
      try { window.dispatchEvent(new Event('rawstories_shares_changed')); } catch (e) {}
    } catch (error) {
      console.error('Failed to delete link:', error);
      alert('Failed to delete link. Please try again.');
    }
  };

  const getShareUrl = (link: ShareLink) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/shared-folder-view/${encodeURIComponent(link.folderPrefix || link.shareId)}?sid=${link.shareId}`;
  };

  const getEmbedCode = (link: ShareLink) => {
    return `<iframe src="${getShareUrl(link)}" width="100%" height="800" style="border:none; border-radius:12px; overflow:hidden;" allowfullscreen></iframe>`;
  };

  const filteredLinks = links.filter(link => 
    link.shareId.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (link.folderPrefix || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    link.items.some(item => item.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const activeLinks = links.filter(link => link.isActive).length;
  const protectedLinks = links.filter(link => Boolean(link.sharePin)).length;
  const totalViews = links.reduce((sum, link) => sum + (link.viewCount || 0), 0);
  const totalDownloads = links.reduce((sum, link) => sum + (link.downloadCount || 0), 0);

  const exportToCSV = () => {
    if (links.length === 0) return;
    const headers = ['Share ID', 'Folder Prefix', 'Status', 'Created At', 'Views', 'Unique IPs', 'Downloads', 'Last Accessed'];
    const rows = links.map(link => [
      link.shareId,
      link.folderPrefix || '',
      link.isActive ? 'Active' : 'Revoked',
      new Date(link.createdAt).toLocaleString(),
      link.viewCount || 0,
      link.ips?.length || 0,
      link.downloadCount || 0,
      link.lastAccess ? new Date(link.lastAccess).toLocaleString() : 'Never'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `share_analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight"
          >
            Shared Links
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-400 text-lg"
          >
            Manage active and expired links shared with clients
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="relative max-w-md w-full"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search links or folders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700/50 text-white rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all placeholder-slate-500"
          />
        </motion.div>
        
        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-3 bg-slate-800/80 text-white rounded-2xl hover:bg-slate-700 transition-colors border border-slate-700/50 whitespace-nowrap"
        >
          <DownloadCloud className="w-5 h-5 text-primary-400" />
          Export CSV
        </motion.button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-dark rounded-3xl p-5 border border-slate-700/40"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Links</span>
            <LinkIcon className="w-4 h-4 text-primary-400" />
          </div>
          <p className="text-3xl font-bold text-white">{links.length}</p>
          <p className="text-sm text-slate-400 mt-1">Share pages created so far</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-dark rounded-3xl p-5 border border-slate-700/40"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Active</span>
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-bold text-white">{activeLinks}</p>
          <p className="text-sm text-slate-400 mt-1">Currently available to clients</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-dark rounded-3xl p-5 border border-slate-700/40"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">PIN Protected</span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-3xl font-bold text-white">{protectedLinks}</p>
          <p className="text-sm text-slate-400 mt-1">Links that require a code</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-dark rounded-3xl p-5 border border-slate-700/40"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Views / Downloads</span>
            <BarChart2 className="w-4 h-4 text-primary-400" />
          </div>
          <p className="text-3xl font-bold text-white">{totalViews}</p>
          <p className="text-sm text-slate-400 mt-1">{totalDownloads} downloads recorded</p>
        </motion.div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
        </div>
      ) : filteredLinks.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-dark rounded-3xl p-12 text-center border border-slate-700/30"
        >
          <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <LinkIcon className="w-10 h-10 text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No shared links found</h3>
          <p className="text-slate-400">
            {searchTerm ? "No links match your search query." : "You haven't shared any folders or images yet."}
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredLinks.map((link, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              key={link.shareId}
              className={`glass-dark rounded-3xl p-6 border transition-all duration-300 ${
                link.isActive 
                  ? 'border-slate-700/50 hover:border-primary-500/30 hover:shadow-[0_0_30px_rgba(var(--color-primary-500),0.1)]' 
                  : 'border-red-500/20 opacity-80'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    link.isActive ? 'bg-primary-500/10' : 'bg-red-500/10'
                  }`}>
                    {link.isActive ? (
                      <LinkIcon className="w-5 h-5 text-primary-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        link.isActive 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {link.isActive ? 'Active' : 'Revoked'}
                      </span>
                      {link.sharePin && (
                        <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Lock className="w-3 h-3" /> PIN Protected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Created {new Date(link.createdAt).toLocaleDateString()} at {new Date(link.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Here is the link to your shared gallery: ${getShareUrl(link)}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition-colors flex items-center justify-center shrink-0"
                    title="Share via WhatsApp"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.528 2.016 14.062.99 11.458.99c-5.44 0-9.864 4.373-9.868 9.8-.001 1.636.452 3.238 1.311 4.64L1.875 22.03l6.772-1.745c-1.286-.768-2.004-1.832-2.004-1.832zm13.14-5.26c-.305-.153-1.808-.891-2.088-.992-.28-.102-.484-.153-.688.153-.204.305-.788.992-.966 1.196-.178.204-.356.23-.66.077-.305-.153-1.287-.475-2.451-1.513-.906-.807-1.517-1.802-1.695-2.107-.178-.305-.019-.47.133-.622.137-.137.305-.356.457-.534.153-.178.204-.305.305-.51.102-.204.05-.382-.025-.534-.076-.153-.688-1.657-.942-2.269-.248-.598-.5-.517-.688-.527-.178-.008-.382-.01-.585-.01-.204 0-.534.077-.814.382-.28.305-1.07 1.044-1.07 2.545 0 1.5 1.094 2.95 1.247 3.153.153.204 2.153 3.286 5.216 4.607.728.314 1.297.502 1.74.643.73.232 1.396.2 1.922.122.586-.087 1.808-.738 2.062-1.45.254-.713.254-1.323.178-1.45-.076-.127-.28-.204-.585-.356z" />
                    </svg>
                  </a>
                  <button
                    onClick={() => copyToClipboard(getEmbedCode(link), link.shareId, 'embed')}
                    className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title="Copy Embed Code"
                  >
                    {copiedId === `${link.shareId}-embed` ? <Check className="w-4 h-4 text-emerald-400" /> : <Code className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(getShareUrl(link), link.shareId, 'link')}
                    className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title="Copy Link"
                  >
                    {copiedId === `${link.shareId}-link` ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={getShareUrl(link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title="Open Link"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-2xl p-4 mb-4 font-mono text-sm text-slate-300 break-all border border-slate-800">
                {getShareUrl(link)}
              </div>

              <div className="mb-4">
                <p className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wider">Shared Items</p>
                <div className="flex flex-wrap gap-2">
                  {link.items.map((item, idx) => (
                    <span key={idx} className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded-lg border border-slate-700/50 truncate max-w-[200px]">
                      {item.replace(/^\//, '').replace(/\/$/, '')}
                    </span>
                  ))}
                </div>
              </div>

              {link.favorites && link.favorites.length > 0 && (
                <div className="mb-4 p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 fill-current" /> Client Favorites ({link.favorites.length})
                    </span>
                    <button 
                      onClick={() => setSelectedFavoritesLink(link)}
                      className="text-xs text-primary-400 hover:text-primary-300 font-semibold"
                    >
                      View List
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {link.favorites.map(f => f.replace(/^\//, '').split('/').pop()).join(', ')}
                  </p>
                </div>
              )}

              <div className="mb-4 p-3 bg-slate-900/30 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 className="w-4 h-4 text-primary-400" />
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Analytics</p>
                </div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-lg font-semibold text-slate-200">{link.viewCount || 0}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Views</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-200">{link.ips?.length || 0}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Unique IPs</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-200">{link.downloadCount || 0}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Downloads</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200 mt-1 truncate" title={link.lastAccess ? new Date(link.lastAccess).toLocaleString() : 'Never'}>
                      {link.lastAccess ? new Date(link.lastAccess).toLocaleDateString() : 'Never'}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase mt-0.5">Last Access</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
                {link.isActive ? (
                  <button
                    onClick={() => revokeLink(link.shareId)}
                    className="px-4 py-2 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Revoke Access
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="px-4 py-2 text-sm font-medium text-slate-500 flex items-center gap-2">
                      Access Revoked
                    </span>
                    <button
                      onClick={() => deleteLink(link.shareId)}
                      className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Favorites List Modal */}
      {selectedFavoritesLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-500 fill-current animate-pulse" />
                Client Favorites Selection
              </h3>
              <button
                onClick={() => setSelectedFavoritesLink(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {selectedFavoritesLink.favorites?.map((fav, idx) => (
                <div key={idx} className="bg-slate-850 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-300 text-sm font-mono truncate mr-4" title={fav}>{fav.replace(/^\//, '')}</span>
                  <a
                    href={rawStoriesApiUrl(`/default/downloadimage?key=${encodeURIComponent(fav)}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-400 hover:text-primary-300 font-semibold px-2 py-1 bg-primary-500/10 hover:bg-primary-500/20 rounded-lg transition-all"
                  >
                    View/Download
                  </a>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
              <span>Total selected: {selectedFavoritesLink.favorites?.length || 0} items</span>
              <button
                onClick={() => setSelectedFavoritesLink(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold transition-all text-xs"
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
