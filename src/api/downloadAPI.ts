import { rawStoriesApiUrl } from './rawStoriesBackend';

const DOWNLOAD_API = rawStoriesApiUrl('/default/downloadimage');

export const downloadFiles = async (fileKeys: string[]) => {
  try {
    const response = await fetch(DOWNLOAD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileKeys }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Download failed: ${error}`);
    }

    // The backend should return a zip file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'download.zip';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    return { success: true };
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
};
