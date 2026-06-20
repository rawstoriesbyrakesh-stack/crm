import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Gallery from './pages/Gallery';
import GalleryUpload from './pages/GalleryUpload';
import SharedImages from './pages/SharedImages';
import SharedFolder from './pages/SharedFolder';
import SharedFolderView from './pages/SharedFolderView';
import SharedLinks from './pages/SharedLinks';
import SmartCollections from './pages/SmartCollections';
import Watermarks from './pages/Watermarks';
import Trash from './pages/Trash';
import Layout from './components/Layout';
import { isRawStoriesAuthenticated } from './api/rawStoriesBackend';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(isRawStoriesAuthenticated());

  useEffect(() => {
    const syncAuth = () => setIsAuthenticated(isRawStoriesAuthenticated());
    syncAuth();
    globalThis.addEventListener('storage', syncAuth);
    globalThis.addEventListener('rawstories_session_changed', syncAuth as EventListener);
    return () => {
      globalThis.removeEventListener('storage', syncAuth);
      globalThis.removeEventListener('rawstories_session_changed', syncAuth as EventListener);
    };
  }, []);

  return (
    <>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/shared-images/:folderPath" element={<SharedImages />} />
          <Route path="/shared-folder/:sharedId" element={<SharedFolder />} />
          <Route path="/shared-folder-view/:folderPath" element={<SharedFolderView />} />
          <Route
            path="/dashboard"
            element={isAuthenticated ? <Layout><Dashboard /></Layout> : <Navigate to="/login" replace />}
          />
          <Route
            path="/gallery"
            element={isAuthenticated ? <Layout><Gallery /></Layout> : <Navigate to="/login" replace />}
          />
          <Route
            path="/gallery/*"
            element={isAuthenticated ? <Layout><Gallery /></Layout> : <Navigate to="/login" replace />}
          />
          <Route
            path="/shared-links"
            element={isAuthenticated ? <Layout><SharedLinks /></Layout> : <Navigate to="/login" replace />}
          />
          <Route
            path="/smart-collections"
            element={isAuthenticated ? <Layout><SmartCollections /></Layout> : <Navigate to="/login" replace />}
          />
          <Route
            path="/watermarks"
            element={isAuthenticated ? <Layout><Watermarks /></Layout> : <Navigate to="/login" replace />}
          />
          <Route
            path="/trash"
            element={isAuthenticated ? <Layout><Trash /></Layout> : <Navigate to="/login" replace />}
          />
          <Route
            path="/gallery/upload/:projectId"
            element={isAuthenticated ? <Layout><GalleryUpload /></Layout> : <Navigate to="/login" replace />}
          />
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
          <Route
            path="/"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      <SpeedInsights />
    </>
  );
}

export default App;