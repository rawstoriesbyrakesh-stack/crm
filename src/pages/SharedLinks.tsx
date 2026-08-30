import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Link as LinkIcon,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Search,
  Lock,
  AlertCircle,
  BarChart2,
  DownloadCloud,
  Code,
  Heart,
  X,
  QrCode,
  Eye,
  Download,
  Users,
  Calendar,
  RefreshCw,
  Filter,
  TrendingUp,
  Globe,
  Shield,
  Activity,
  ChevronDown,
  ChevronUp,
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

const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.528 2.016 14.062.99 11.458.99c-5.44 0-9.864 4.373-9.868 9.8-.001 1.636.452 3.238 1.311 4.64L1.875 22.03l6.772-1.745zM18.4 14.796c-.305-.153-1.808-.891-2.088-.992-.28-.102-.484-.153-.688.153-.204.305-.788.992-.966 1.196-.178.204-.356.23-.66.077-.305-.153-1.287-.475-2.451-1.513-.906-.807-1.517-1.802-1.695-2.107-.178-.305-.019-.47.133-.622.137-.137.305-.356.457-.534.153-.178.204-.305.305-.51.102-.204.05-.382-.025-.534-.076-.153-.688-1.657-.942-2.269-.248-.598-.5-.517-.688-.527-.178-.008-.382-.01-.585-.01-.204 0-.534.077-.814.382-.28.305-1.07 1.044-1.07 2.545 0 1.5 1.094 2.95 1.247 3.153.153.204 2.153 3.286 5.216 4.607.728.314 1.297.502 1.74.643.73.232 1.396.2 1.922.122.586-.087 1.808-.738 2.062-1.45.254-.713.254-1.323.178-1.45-.076-.127-.28-.204-.585-.356z" />
  </svg>
);

export default function SharedLinks() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pin' | 'revoked'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFavoritesLink, setSelectedFavoritesLink] = useState<ShareLink | null>(null);
  const [selectedQrLink, setSelectedQrLink] = useState<ShareLink | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => { loadLinks(); }, []);

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
        if (data.success && data.shares) setLinks(data.shares);
      }
    } catch (error) {
      console.error('Failed to load shared links:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string, type = 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(`${id}-${type}`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const revokeLink = async (shareId: string) => {
    if (!window.confirm('Revoke this link? Clients will lose access immediately.')) return;
    try {
      await fetch(rawStoriesApiUrl('/default/revokeshare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        mode: 'cors',
        body: JSON.stringify({ shareId }),
      });
      loadLinks();
      try { window.dispatchEvent(new Event('rawstories_shares_changed')); } catch {}
    } catch { alert('Failed to revoke link. Please try again.'); }
  };

  const deleteLink = async (shareId: string) => {
    if (!window.confirm('Permanently delete this share record?')) return;
    try {
      await fetch(rawStoriesApiUrl('/default/deleteshare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        mode: 'cors',
        body: JSON.stringify({ shareId }),
      });
      loadLinks();
      try { window.dispatchEvent(new Event('rawstories_shares_changed')); } catch {}
    } catch { alert('Failed to delete link. Please try again.'); }
  };

  const getShareUrl = (link: ShareLink) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/shared-folder-view/${encodeURIComponent(link.folderPrefix || link.shareId)}?sid=${link.shareId}`;
  };

  const getEmbedCode = (link: ShareLink) =>
    `<iframe src="${getShareUrl(link)}" width="100%" height="800" style="border:none;border-radius:12px;overflow:hidden;" allowfullscreen></iframe>`;

  const openFavoriteFile = async (key: string) => {
    try {
      const res = await fetch(rawStoriesApiUrl(`/default/downloadimage?key=${encodeURIComponent(key)}`), {
        method: 'GET', headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.url) throw new Error(data?.message || 'Unable to open file');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch { alert('Failed to open this file. Please try again.'); }
  };

  const exportToCSV = () => {
    if (!links.length) return;
    const headers = ['Share ID', 'Folder', 'Status', 'Created', 'Views', 'Unique IPs', 'Downloads', 'Last Access'];
    const rows = links.map(l => [
      l.shareId, l.folderPrefix || '', l.isActive ? 'Active' : 'Revoked',
      new Date(l.createdAt).toLocaleString(), l.viewCount || 0,
      l.ips?.length || 0, l.downloadCount || 0,
      l.lastAccess ? new Date(l.lastAccess).toLocaleString() : 'Never',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `share_analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredLinks = links.filter(link => {
    const q = searchTerm.toLowerCase();
    const matches = link.items.some(i => i.toLowerCase().includes(q)) ||
      link.shareId.toLowerCase().includes(q) ||
      (link.folderPrefix || '').toLowerCase().includes(q);
    if (!matches) return false;
    if (statusFilter === 'active') return link.isActive;
    if (statusFilter === 'pin') return !!link.sharePin;
    if (statusFilter === 'revoked') return !link.isActive;
    return true;
  });

  const activeLinks = links.filter(l => l.isActive).length;
  const protectedLinks = links.filter(l => Boolean(l.sharePin)).length;
  const totalViews = links.reduce((s, l) => s + (l.viewCount || 0), 0);
  const totalDownloads = links.reduce((s, l) => s + (l.downloadCount || 0), 0);

  const TABS = [
    { id: 'all', label: 'All', count: links.length, color: 'cyan' },
    { id: 'active', label: 'Active', count: activeLinks, color: 'emerald' },
    { id: 'pin', label: 'PIN Protected', count: protectedLinks, color: 'amber' },
    { id: 'revoked', label: 'Revoked', count: links.length - activeLinks, color: 'red' },
  ] as const;

  return (
    <div className="min-h-screen text-white relative">
      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-[#00BCEB]/8 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 -left-60 w-[500px] h-[500px] bg-purple-600/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 sm:p-6 md:p-8">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8"
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-[#00BCEB]/15 border border-[#00BCEB]/30 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,188,235,0.2)]">
                <LinkIcon className="w-5 h-5 text-[#00BCEB]" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Shared Links
              </h1>
            </div>
            <p className="text-slate-400 text-sm ml-[52px]">Manage client galleries, track views & revoke access</p>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={loadLinks}
              className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-700/80 text-slate-200 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all text-sm font-medium"
            >
              <DownloadCloud className="w-4 h-4 text-[#00BCEB]" />
              Export CSV
            </motion.button>
          </div>
        </motion.div>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {[
            { label: 'Total Links', value: links.length, icon: Globe, color: '#00BCEB', glow: 'rgba(0,188,235,0.15)' },
            { label: 'Active', value: activeLinks, icon: Activity, color: '#34d399', glow: 'rgba(52,211,153,0.15)' },
            { label: 'PIN Protected', value: protectedLinks, icon: Shield, color: '#fbbf24', glow: 'rgba(251,191,36,0.15)' },
            { label: 'Total Views', value: totalViews, icon: TrendingUp, color: '#a78bfa', glow: 'rgba(167,139,250,0.15)' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="relative bg-slate-900/60 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-4 sm:p-5 overflow-hidden group hover:border-slate-700 transition-all duration-300"
              style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.03)` }}
            >
              <div
                className="absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: stat.glow }}
              />
              <div className="flex items-start justify-between mb-3 relative z-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{stat.label}</p>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: `${stat.color}18`, border: `1px solid ${stat.color}30` }}
                >
                  <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                </div>
              </div>
              <p className="text-3xl font-bold text-white relative z-10">{stat.value}</p>
              {stat.label === 'Total Views' && (
                <p className="text-xs text-slate-500 mt-1 relative z-10">{totalDownloads} downloads</p>
              )}
            </motion.div>
          ))}
        </div>

        {/* ── Search + Filter Bar ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-3 mb-6"
        >
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by folder, link ID…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-800 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BCEB]/40 focus:border-[#00BCEB]/40 transition-all placeholder-slate-600"
            />
          </div>

          {/* Tab Filters */}
          <div className="flex items-center gap-2 p-1 bg-slate-900/60 border border-slate-800 rounded-xl">
            {TABS.map(tab => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-[#00BCEB] text-slate-950 shadow-[0_0_12px_rgba(0,188,235,0.4)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    isActive ? 'bg-slate-950/30' : 'bg-slate-800 text-slate-400'
                  }`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* ── Loading ── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 border-2 border-slate-700 border-t-[#00BCEB] rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Loading shared links…</p>
          </div>
        ) : filteredLinks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 gap-4"
          >
            <div className="w-20 h-20 bg-slate-900/60 border border-slate-800 rounded-3xl flex items-center justify-center mb-2">
              <LinkIcon className="w-10 h-10 text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-white">No links found</h3>
            <p className="text-slate-400 text-sm text-center max-w-xs">
              {searchTerm ? 'No links match your search.' : 'Share a gallery folder to get started.'}
            </p>
          </motion.div>
        ) : (
          /* ── Link Cards Grid ── */
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredLinks.map((link, index) => {
              const isExpanded = expandedCards.has(link.shareId);
              const shareUrl = getShareUrl(link);
              const hasFavs = (link.favorites?.length || 0) > 0;

              return (
                <motion.div
                  key={link.shareId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`group relative bg-slate-900/60 backdrop-blur-sm border rounded-2xl overflow-hidden transition-all duration-300 ${
                    link.isActive
                      ? 'border-slate-800/80 hover:border-slate-700 hover:shadow-xl hover:shadow-black/30'
                      : 'border-red-500/15 opacity-75'
                  }`}
                >
                  {/* Top accent line */}
                  <div className={`absolute top-0 left-0 right-0 h-[2px] ${link.isActive ? 'bg-gradient-to-r from-[#00BCEB]/0 via-[#00BCEB]/60 to-[#00BCEB]/0' : 'bg-gradient-to-r from-red-500/0 via-red-500/40 to-red-500/0'}`} />

                  <div className="p-5">
                    {/* ── Card Header ── */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Status Icon */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${link.isActive ? 'bg-[#00BCEB]/10 border border-[#00BCEB]/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                          <LinkIcon className={`w-4 h-4 ${link.isActive ? 'text-[#00BCEB]' : 'text-red-400'}`} />
                        </div>
                        <div className="min-w-0">
                          {/* Folder Name */}
                          <p className="font-semibold text-white text-sm truncate leading-tight">
                            {link.folderPrefix || link.items[0]?.replace(/\//, '') || 'Shared Gallery'}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {new Date(link.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                          link.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${link.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                          {link.isActive ? 'Active' : 'Revoked'}
                        </span>
                        {link.sharePin && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Lock className="w-2.5 h-2.5" /> PIN
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ── URL Box ── */}
                    <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 mb-4">
                      <Globe className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <p className="font-mono text-[11px] text-slate-400 truncate flex-1">{shareUrl}</p>
                      <button
                        onClick={() => copyToClipboard(shareUrl, link.shareId, 'link')}
                        className="shrink-0 p-1 rounded-lg hover:bg-slate-700 transition-colors"
                        title="Copy link"
                      >
                        {copiedId === `${link.shareId}-link`
                          ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                          : <Copy className="w-3.5 h-3.5 text-slate-500 hover:text-white" />}
                      </button>
                    </div>

                    {/* ── Analytics Mini Row ── */}
                    <div className="grid grid-cols-4 gap-2 bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 mb-4">
                      {[
                        { icon: Eye, label: 'Views', value: link.viewCount || 0, color: 'text-[#00BCEB]' },
                        { icon: Users, label: 'IPs', value: link.ips?.length || 0, color: 'text-purple-400' },
                        { icon: Download, label: 'DLs', value: link.downloadCount || 0, color: 'text-emerald-400' },
                        { icon: Calendar, label: 'Last', value: link.lastAccess ? new Date(link.lastAccess).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—', color: 'text-amber-400' },
                      ].map(stat => (
                        <div key={stat.label} className="text-center">
                          <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                          <p className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* ── Action Buttons ── */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* WhatsApp Share */}
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Here is your gallery link: ${shareUrl}`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/20 text-xs font-medium transition-all"
                        title="Share on WhatsApp"
                      >
                        {WHATSAPP_ICON} WhatsApp
                      </a>

                      {/* QR Code */}
                      <button
                        onClick={() => setSelectedQrLink(link)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700/50 text-xs font-medium transition-all"
                      >
                        <QrCode className="w-3.5 h-3.5 text-[#00BCEB]" /> QR Code
                      </button>

                      {/* Copy Embed */}
                      <button
                        onClick={() => copyToClipboard(getEmbedCode(link), link.shareId, 'embed')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700/50 text-xs font-medium transition-all"
                      >
                        {copiedId === `${link.shareId}-embed`
                          ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied</>
                          : <><Code className="w-3.5 h-3.5" /> Embed</>}
                      </button>

                      {/* Open */}
                      <a
                        href={shareUrl}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700/50 text-xs font-medium transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open
                      </a>

                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleExpand(link.shareId)}
                        className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 hover:text-white transition-colors"
                      >
                        {isExpanded ? <><ChevronUp className="w-3.5 h-3.5" />Less</> : <><ChevronDown className="w-3.5 h-3.5" />More</>}
                      </button>
                    </div>

                    {/* ── Expanded: Items & Favorites ── */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 space-y-3">
                            {/* Shared items */}
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Shared Items</p>
                              <div className="flex flex-wrap gap-1.5">
                                {link.items.map((item, i) => (
                                  <span key={i} className="text-[11px] bg-slate-800/80 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700/50 truncate max-w-[200px]">
                                    {item.replace(/^\//, '').replace(/\/$/, '')}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Client Favorites */}
                            {hasFavs && (
                              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                                    <Heart className="w-3.5 h-3.5 fill-current" />
                                    Client Favorites ({link.favorites!.length})
                                  </span>
                                  <button onClick={() => setSelectedFavoritesLink(link)} className="text-[11px] text-[#00BCEB] hover:text-white font-semibold transition-colors">
                                    View All →
                                  </button>
                                </div>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {link.favorites!.map(f => f.replace(/^\//, '').split('/').pop()).slice(0, 3).join(', ')}
                                  {link.favorites!.length > 3 && ` +${link.favorites!.length - 3} more`}
                                </p>
                              </div>
                            )}

                            {/* Danger zone */}
                            <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
                              {link.isActive ? (
                                <button
                                  onClick={() => revokeLink(link.shareId)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-amber-400 hover:text-amber-300 bg-amber-500/8 hover:bg-amber-500/15 border border-amber-500/20 rounded-xl text-xs font-medium transition-all"
                                >
                                  <AlertCircle className="w-3.5 h-3.5" /> Revoke Access
                                </button>
                              ) : (
                                <span className="text-[11px] text-red-400/70 italic">Access revoked</span>
                              )}
                              <button
                                onClick={() => deleteLink(link.shareId)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:text-red-300 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 rounded-xl text-xs font-medium transition-all ml-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ════ QR Code Modal ════ */}
      <AnimatePresence>
        {selectedQrLink && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setSelectedQrLink(null)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <button onClick={() => setSelectedQrLink(null)} className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <QrCode className="w-5 h-5 text-[#00BCEB]" />
                  <h3 className="text-lg font-bold text-white">Scan Gallery QR</h3>
                </div>
                <p className="text-xs text-slate-400 mb-5">Point camera to open shared gallery link</p>

                <div id="admin-qr-canvas-box" className="bg-white p-4 rounded-2xl inline-block mb-4 shadow-xl">
                  <QRCodeCanvas value={getShareUrl(selectedQrLink)} size={200} includeMargin bg="#ffffff" fg="#090d16" />
                </div>
                <p className="text-[11px] text-slate-500 font-mono break-all px-2 mb-6">{getShareUrl(selectedQrLink)}</p>

                <div className="space-y-2.5">
                  <button
                    onClick={() => {
                      const canvas = document.querySelector('#admin-qr-canvas-box canvas') as HTMLCanvasElement;
                      if (canvas) {
                        const a = document.createElement('a');
                        a.href = canvas.toDataURL('image/png');
                        a.download = `share_qr_${selectedQrLink.shareId}.png`;
                        a.click();
                      }
                    }}
                    className="w-full py-3 bg-gradient-to-r from-[#00BCEB] to-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#00BCEB]/20 hover:brightness-110"
                  >
                    <Download className="w-4 h-4" /> Download QR Code PNG
                  </button>

                  <button
                    onClick={() => copyToClipboard(getShareUrl(selectedQrLink), selectedQrLink.shareId, 'modal-qr')}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all"
                  >
                    {copiedId === `${selectedQrLink.shareId}-modal-qr` ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copiedId === `${selectedQrLink.shareId}-modal-qr` ? 'Copied Link!' : 'Copy Gallery Link'}
                  </button>

                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Here is your gallery link: ${getShareUrl(selectedQrLink)}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-emerald-500/30 transition-all"
                  >
                    {WHATSAPP_ICON} Share via WhatsApp
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════ Favorites Modal ════ */}
      <AnimatePresence>
        {selectedFavoritesLink && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setSelectedFavoritesLink(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 40 }}
              className="relative bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-emerald-400 fill-current" />
                  <h3 className="text-lg font-bold text-white">
                    Client Favorites
                    <span className="ml-2 text-sm text-slate-400 font-normal">({selectedFavoritesLink.favorites?.length || 0})</span>
                  </h3>
                </div>
                <button onClick={() => setSelectedFavoritesLink(null)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {(selectedFavoritesLink.favorites || []).map((fav, i) => (
                  <button
                    key={i}
                    onClick={() => openFavoriteFile(fav)}
                    className="w-full flex items-center gap-3 p-3 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-xl text-left transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <Heart className="w-4 h-4 text-emerald-400 fill-current" />
                    </div>
                    <span className="text-sm text-slate-300 group-hover:text-white truncate transition-colors">
                      {fav.replace(/^\//, '').split('/').pop()}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-[#00BCEB] ml-auto shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
