import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Image as ImageIcon, Share2, HardDrive, AlertCircle, Loader2, ArrowRight, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { rawStoriesApiUrl, getRawStoriesToken } from '../api/rawStoriesBackend';

interface Job {
  id: number;
  type: string;
  status: string;
  progress: number;
}

interface DashboardStats {
  totalFolders: number;
  totalImages: number;
  totalSharedLinks: number;
  totalStorage: number;
  recentUploads: Array<{ name: string; uploadedAt: string }>;
}

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalFolders: 0,
    totalImages: 0,
    totalSharedLinks: 0,
    totalStorage: 0,
    recentUploads: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetchDashboardStats();
    fetchJobs();
    const interval = setInterval(fetchJobs, 2000);
    return () => clearInterval(interval);
  }, []);

  // Refresh stats when shared links change elsewhere in the app
  useEffect(() => {
    const h = () => fetchDashboardStats();
    window.addEventListener('rawstories_shares_changed', h);
    window.addEventListener('rawstories_stats_changed', h);
    return () => {
      window.removeEventListener('rawstories_shares_changed', h);
      window.removeEventListener('rawstories_stats_changed', h);
    };
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await fetch(rawStoriesApiUrl('/default/jobs'), {
        headers: { Authorization: `Bearer ${getRawStoriesToken()}` },
      });
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {}
  };

  const fetchDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(rawStoriesApiUrl('/api/stats'), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRawStoriesToken()}` },
        mode: 'cors',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.status}`);
      }

      const data = await response.json();
      setStats(data.stats || {
        totalFolders: 0,
        totalImages: 0,
        totalSharedLinks: 0,
        totalStorage: 0,
        recentUploads: [],
      });
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      setError(err.message || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 relative overflow-hidden">
      {/* Premium Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-primary-600/10 mix-blend-screen filter blur-[120px]" />
        <div className="absolute bottom-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-secondary-600/10 mix-blend-screen filter blur-[120px]" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">
              Dashboard
            </h1>
            <p className="text-slate-400 text-lg">Welcome to RawStories Gallery Admin</p>
          </div>
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/gallery')}
              className="px-6 py-2.5 bg-gradient-to-r from-[#00BCEB] to-blue-600 hover:from-[#00A5CF] hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-[#00BCEB]/25 transition-all flex items-center gap-2"
            >
              Open Gallery <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>

        {/* Error Alert */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 flex items-center shadow-lg"
          >
            <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </motion.div>
        )}

        {/* Statistics Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary-500" />
          </div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10"
          >
            {/* Total Folders */}
            <motion.div variants={itemVariants} className="glass-dark rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 group-hover:opacity-20 transition-all duration-500">
                <Folder className="h-32 w-32 text-primary-400" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-primary-500/20 rounded-2xl flex items-center justify-center mb-4">
                  <Folder className="h-6 w-6 text-primary-400" />
                </div>
                <p className="text-slate-400 text-sm font-medium mb-1">Total Folders</p>
                <p className="text-4xl font-bold text-white tracking-tight">{stats.totalFolders}</p>
              </div>
            </motion.div>

            {/* Total Images */}
            <motion.div variants={itemVariants} className="glass-dark rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 group-hover:opacity-20 transition-all duration-500">
                <ImageIcon className="h-32 w-32 text-secondary-400" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-secondary-500/20 rounded-2xl flex items-center justify-center mb-4">
                  <ImageIcon className="h-6 w-6 text-secondary-400" />
                </div>
                <p className="text-slate-400 text-sm font-medium mb-1">Total Images</p>
                <p className="text-4xl font-bold text-white tracking-tight">{stats.totalImages}</p>
              </div>
            </motion.div>

            {/* Shared Links */}
            <motion.div variants={itemVariants} className="glass-dark rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 group-hover:opacity-20 transition-all duration-500">
                <Share2 className="h-32 w-32 text-blue-400" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-4">
                  <Share2 className="h-6 w-6 text-blue-400" />
                </div>
                <p className="text-slate-400 text-sm font-medium mb-1">Shared Links</p>
                <p className="text-4xl font-bold text-white tracking-tight">{stats.totalSharedLinks}</p>
              </div>
            </motion.div>

            {/* Total Storage */}
            <motion.div variants={itemVariants} className="glass-dark rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 group-hover:opacity-20 transition-all duration-500">
                <HardDrive className="h-32 w-32 text-purple-400" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-4">
                  <HardDrive className="h-6 w-6 text-purple-400" />
                </div>
                <p className="text-slate-400 text-sm font-medium mb-1">Storage Used</p>
                <p className="text-3xl font-bold text-white tracking-tight mt-1">{formatBytes(stats.totalStorage)}</p>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Background Jobs */}
        {jobs.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-dark rounded-3xl p-8 mb-10"
          >
            <h2 className="text-2xl font-bold text-white mb-6">Background Tasks</h2>
            <div className="space-y-4">
              {jobs.map(job => (
                <div key={job.id} className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-slate-200 flex items-center gap-2">
                      <Settings className={`w-4 h-4 ${job.status === 'processing' ? 'animate-spin text-primary-500' : 'text-emerald-500'}`} />
                      {job.type}
                    </span>
                    <span className={`text-sm ${job.status === 'completed' ? 'text-emerald-400' : 'text-primary-400'}`}>
                      {job.status === 'completed' ? 'Done' : `${job.progress}%`}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div className="bg-gradient-to-r from-primary-500 to-primary-400 h-2 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Recent Uploads */}
        {!loading && stats.recentUploads.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-dark rounded-3xl p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Recent Uploads</h2>
              <button 
                onClick={fetchDashboardStats}
                className="text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
              >
                Refresh Data
              </button>
            </div>
            <div className="space-y-3">
              {stats.recentUploads.slice(0, 5).map((upload, index) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  key={`${upload.name}-${upload.uploadedAt}`} 
                  className="flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800/80 rounded-2xl border border-slate-700/50 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-5 h-5 text-slate-400 group-hover:text-primary-400 transition-colors" />
                    </div>
                    <span className="text-slate-200 font-medium truncate max-w-[200px] sm:max-w-md">{upload.name}</span>
                  </div>
                  <span className="text-slate-500 text-sm whitespace-nowrap ml-4 bg-slate-800/50 px-3 py-1 rounded-lg">
                    {new Date(upload.uploadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
