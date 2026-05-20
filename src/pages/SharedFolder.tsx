import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Loader2, Lock } from 'lucide-react';
import { rawStoriesApiUrl } from '../api/rawStoriesBackend';

const SHARE_API_ACCESS = rawStoriesApiUrl('/default/SharedLinkAccess');

function SharedFolder() {
  const { sharedId } = useParams<{ sharedId: string }>();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [isRevoked, setIsRevoked] = useState(false);

  // On mount, check share link status so revoked links show a clear permission error
  useEffect(() => {
    const checkStatus = async () => {
      if (!sharedId) {
        setStatusLoading(false);
        return;
      }
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
        } catch {
          data = null;
        }

        if (!res.ok || !data || data.success === false) {
          // Treat unknown/failed status as revoked for safety
          setIsRevoked(true);
          setError(
            (data && data.message) ||
              'You do not have permission to access this shared folder.'
          );
          return;
        }

        const link = (data as any).shareLink;
        if (link && link.isActive === false) {
          setIsRevoked(true);
          setError(
            'This share link has been revoked or expired. You do not have permission to access this folder.'
          );
        }
      } catch (e: any) {
        // On network/parse errors, assume no permission
        setIsRevoked(true);
        setError(
          e?.message ||
            'You do not have permission to access this shared folder.'
        );
      } finally {
        setStatusLoading(false);
      }
    };

    checkStatus();
  }, [sharedId]);

  const handleVerify = async () => {
    if (!sharedId || !pin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(SHARE_API_ACCESS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify({
          action: 'verify_pin',
          sharedId,
          pin,
        }),
      });
      const txt = await res.text();
      let data: any = null;
      try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }
      if (!res.ok) {
        const msg = (data && data.message) ? data.message : txt || 'Verification failed';
        throw new Error(msg);
      }
      if (!data || data.success === false) {
        throw new Error((data && data.message) || 'Invalid response from server');
      }
      // Expected: { success:true, message, folderName, shareUrl }
      const folderName: string | undefined = data.folderName;
      if (!folderName) {
        throw new Error('Server did not return a folderName');
      }
      // Navigate to existing shared images view, preserve shared id in query
      const encoded = encodeURIComponent(folderName);
      navigate(`/shared-images/${encoded}?sid=${encodeURIComponent(sharedId)}`);
    } catch (e: any) {
      setError(e.message || 'PIN verification failed');
    } finally {
      setLoading(false);
    }
  };

  // While we are checking server status initially
  if (statusLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm border border-amber-100 flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-amber-700 animate-spin mb-4" />
          <p className="text-gray-700 text-sm">Checking link permissions…</p>
        </div>
      </div>
    );
  }

  // If revoked or no permission, show a clear message instead of PIN form
  if (isRevoked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md border border-amber-100">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-red-50 rounded-full mb-6">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Access Denied
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              {error ||
                "You don't have permission to access this shared folder. The link may have been revoked or expired."}
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 px-6 bg-amber-900 text-white rounded-xl hover:bg-amber-800 transition-colors font-medium"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md border border-amber-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-100 to-amber-200 rounded-full mb-6">
            <Lock className="h-10 w-10 text-amber-700" />
          </div>
          <h2 className="text-3xl font-light text-gray-900 mb-3 tracking-tight">Enter PIN to Continue</h2>
          <p className="text-gray-600 text-base leading-relaxed">This shared folder is protected. Enter the PIN provided to you.</p>
        </div>
        <div className="space-y-6">
          <div>
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
              placeholder="Enter PIN"
              maxLength={6}
              className="w-full px-6 py-4 border-2 border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-center text-2xl tracking-[0.3em] font-light text-gray-900 placeholder-amber-400 transition-all"
              autoFocus
            />
            {error && (
              <p className="mt-3 text-sm text-red-600 flex items-center justify-center">
                <AlertCircle className="h-4 w-4 mr-2" />
                {error}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3 px-6 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleVerify}
              disabled={!pin || loading}
              className="flex-1 py-3 px-6 bg-amber-900 text-white rounded-xl hover:bg-amber-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verifying…</> : 'Verify'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SharedFolder;

