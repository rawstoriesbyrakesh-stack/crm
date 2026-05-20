import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Link as LinkIcon, 
  Copy, 
  Check, 
  Trash2, 
  ExternalLink,
  Search,
  Lock,
  Unlock,
  AlertCircle
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
}

export default function SharedLinks() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
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

  const filteredLinks = links.filter(link => 
    link.shareId.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (link.folderPrefix || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    link.items.some(item => item.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
                  <button
                    onClick={() => copyToClipboard(getShareUrl(link), link.shareId)}
                    className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    title="Copy Link"
                  >
                    {copiedId === link.shareId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
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
    </div>
  );
}
