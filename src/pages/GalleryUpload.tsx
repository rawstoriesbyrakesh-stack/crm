import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import { rawStoriesApiUrl } from '../api/rawStoriesBackend';
import { 
  ArrowLeft, 
  Upload, 
  X, 
  Eye, 
  EyeOff, 
  Lock, 
  AlertCircle,
  Loader2
} from 'lucide-react';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  title: string;
  watermarkedFile?: File; // Add watermarked file to store the processed image
}

interface ProjectData {
  id: string;
  title: string;
  clientName: string;
  eventDate?: string;
  eventType?: string;   
}

function GalleryUpload() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const handleInit = () => {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      }
    };
    handleInit();
  }, []);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMessages, setUploadMessages] = useState<string[]>([]);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    enableFaceTagging: false,
    applyWatermark: true,
    protectWithPin: false,
    pin: ''
  });

  const [showPin, setShowPin] = useState(false);

  // API endpoints
  const GET_PROJECT_BY_ID_URL = rawStoriesApiUrl(`/default/Get_Project_Details/${projectId}`);
  const UPLOAD_URL = rawStoriesApiUrl('/default/imagesupload');

  // UUID validation regex
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const isDev = process.env.NODE_ENV === 'development';

  // Sanitize folder name to remove special characters and ensure S3 compatibility
  const sanitizeFolderName = (name: string) => {
    return name
      .replace(/[^a-zA-Z0-9-_]/g, '_') // Replace special characters with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with a single one
      .toLowerCase()
      .slice(0, 100); // Limit length to avoid S3 path issues
  };

  // Function to add image watermark to an image
  const addWatermark = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const watermarkImg = new Image();
      const reader = new FileReader();

      img.crossOrigin = 'anonymous'; // Enable CORS for the original image
      watermarkImg.crossOrigin = 'anonymous'; // Enable CORS for the watermark image

      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        // Draw the original image
        ctx.drawImage(img, 0, 0);

        // Load watermark image (replace with your served/hosted image URL with CORS support)
        watermarkImg.src = '/images/image-removebg-preview.png'; // Updated to match your file path

        watermarkImg.onload = () => {
          // Calculate watermark size (e.g., 10% of the original image width)
          const watermarkSize = img.width * 0.2;
          const watermarkX = img.width - watermarkSize - 20; // 20px padding from right
          const watermarkY = img.height - watermarkSize - 20; // 20px padding from bottom

          // Draw watermark with transparency
          ctx.globalAlpha = 0.5; // 50% opacity
          ctx.drawImage(watermarkImg, watermarkX, watermarkY, watermarkSize, watermarkSize);
          ctx.globalAlpha = 1.0; // Reset opacity

          // Convert canvas to Blob and then to File
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to create watermarked image'));
              return;
            }
            const watermarkedFile = new File([blob], file.name, { type: file.type });
            resolve(watermarkedFile);
          }, file.type);
        };

        watermarkImg.onerror = () => {
          if (isDev) console.warn('Watermark image failed to load, skipping watermark due to CORS or resource issue. ');
          resolve(file); // Fallback to original file if watermark fails
        };
      };

      img.onerror = () => reject(new Error('Failed to load image for watermarking due to CORS or resource issue'));
      reader.onerror = () => reject(new Error('Failed to read file for watermarking'));
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    if (!projectId || !UUID_REGEX.test(projectId)) {
      setError('Invalid or missing project ID in the URL');
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> => {
      for (let i = 0; i < retries; i++) {
        try {
          if (isDev) console.log(`Fetching project, attempt ${i + 1}: ${url}`);
          const response = await fetch(url, options);
          if (response.status === 429 && i < retries - 1) {
            if (isDev) console.warn(`Rate limit hit, retrying after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          return response;
        } catch (err) {
          if (i === retries - 1) throw err;
          if (isDev) console.warn(`Fetch attempt ${i + 1} failed, retrying...`);
        }
      }
      throw new Error('Max retries reached');
    };

    const fetchProject = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetchWithRetry(GET_PROJECT_BY_ID_URL, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          if (response.status === 403) {
            throw new Error('Unauthorized access to project details. Please check your credentials.');
          } else if (response.status === 404) {
            throw new Error(`Project with ID ${projectId} not found`);
          } else if (response.status === 429) {
            throw new Error('Too many requests. Please try again later.');
          } else {
            throw new Error(`Failed to fetch project: ${response.status} ${response.statusText}`);
          }
        }

        const data = await response.json();
        if (isDev) {
          console.log('API Response:', data);
          console.log('Project Object:', data.project);
        }

        // Check if the response has the expected structure
        if (!data || typeof data !== 'object' || !data.success || !data.project || !data.project.projectId) {
          throw new Error('Invalid project data received');
        }

        const project = data.project;

        // Validate required fields (only clientName and projectId required)
        if (!project.clientName || !project.projectId) {
          throw new Error('Project data is missing required fields (clientName or projectId)');
        }

        // API uses 'shootType' instead of 'eventType'
        const eventType = project.shootType || 'Unknown';
        const eventDate = project.eventDate || project.validUntil || new Date().toISOString().split('T')[0];

        // Warn if optional fields are missing
        if (!project.shootType || !project.eventDate) {
          setError('Some project details are missing and have been set to default values.');
        }

        if (!isMounted) return;

        setProjectData({
          id: project.projectId,
          title: `${project.clientName} - ${eventType}`,
          clientName: project.clientName,
          eventDate: eventDate,
          eventType: eventType.split(',')[0].trim(),
        });
      } catch (err: any) {
        if (isMounted) {
          console.error('Error fetching project:', err.message);
          setError(err.message || 'Failed to load project details. Please try again later.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProject();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  if (!projectId || !UUID_REGEX.test(projectId)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 text-lg">Invalid or missing project ID in the URL</p>
          <button
            onClick={() => navigate('/gallery')}
            className="mt-4 px-4 py-2 bg-[#00BCEB] text-white rounded-lg hover:bg-[#00A5CF] transition-colors duration-200"
          >
            Back to Gallery
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin h-12 w-12 text-[#00BCEB] mx-auto" />
      </div>
    );
  }

  if (error && !projectData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 text-lg">{error || 'Project not found'}</p>
          <button
            onClick={() => navigate('/gallery')}
            className="mt-4 px-4 py-2 bg-[#00BCEB] text-white rounded-lg hover:bg-[#00A5CF] transition-colors duration-200"
          >
            Back to Gallery
          </button>
        </div>
      </div>
    );
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };

  const handleFiles = async (files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    const batchSize = 10;
    for (let i = 0; i < imageFiles.length; i += batchSize) {
      const batch = imageFiles.slice(i, i + batchSize);
      const promises = batch.map(file => new Promise<UploadedFile>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            file,
            preview: e.target?.result as string,
            title: file.name.replace(/\.[^/.]+$/, '')
          });
        };
        reader.readAsDataURL(file);
      }));
      const newFiles = await Promise.all(promises);
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const updateFileTitle = (fileId: string, title: string) => {
    setUploadedFiles(prev => 
      prev.map(f => f.id === fileId ? { ...f, title } : f)
    );
  };

  const handleSettingChange = (setting: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handleUpload = async () => {
    if (uploadedFiles.length === 0) {
      setUploadMessages(['❌ No files selected for upload']);
      return;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    const oversizedFiles = uploadedFiles.filter(file => file.file.size > maxSize);
    if (oversizedFiles.length > 0) {
      setUploadMessages(prev => [
        ...prev,
        `❌ ${oversizedFiles.map(f => f.file.name).join(', ')} exceed 50MB limit`
      ]);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadMessages([]);

    const uploadWithRetry = async (url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> => {
      for (let i = 0; i < retries; i++) {
        try {
          if (isDev) console.log(`PUT request attempt ${i + 1} for ${url}`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout
          const response = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          return response;
        } catch (err: any) {
          if (err.name === 'AbortError') {
            throw new Error('Upload timed out after 30 seconds');
          }
          if (i === retries - 1) throw err;
          if (isDev) console.warn(`PUT attempt ${i + 1} failed, retrying after ${delay}ms: ${err.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      throw new Error('Max retries reached for PUT request');
    };

    try {
      // Apply watermark to images if enabled
      let filesToUpload = uploadedFiles;
      if (settings.applyWatermark) {
        setUploadMessages(prev => [...prev, '📝 Applying watermarks to images...']);
        const watermarkedPromises = uploadedFiles.map(async (fileObj) => {
          try {
            const watermarkedFile = await addWatermark(fileObj.file);
            return { ...fileObj, watermarkedFile };
          } catch (err) {
            if (isDev) console.error('Watermarking failed due to CORS or resource issue:', err.message);
            setUploadMessages(prev => [...prev, `⚠️ Failed to apply watermark to ${fileObj.file.name}, uploading original`]);
            return { ...fileObj }; // Fallback to original file
          }
        });
        filesToUpload = await Promise.all(watermarkedPromises);
        setUploadedFiles(filesToUpload); // Update state with watermarked files
      }

      const fileNames = filesToUpload.map(file => file.watermarkedFile?.name || file.file.name);
      const fileTypes = filesToUpload.map(file => file.watermarkedFile?.type || file.file.type);
      // Create folder path: projects/gallery/clientName-eventType-eventDate
      const folder = `projects/gallery/${sanitizeFolderName(projectData!.clientName)}-${sanitizeFolderName(projectData!.eventType || 'Unknown')}-${sanitizeFolderName(projectData!.eventDate || new Date().toISOString().split('T')[0])}`;

      const payload = {
        project_id: projectData!.id,
        client_name: projectData!.clientName,
        event_type: projectData!.eventType || 'Unknown',
        event_date: projectData!.eventDate || new Date().toISOString().split('T')[0],
        uploadConfig: {
          projectId: projectData!.id,
          files: fileNames,
          fileTypes: fileTypes,
          folder,
          settings: {
            enableFaceTagging: settings.enableFaceTagging,
            applyWatermark: settings.applyWatermark,
            protectWithPin: settings.protectWithPin,
            pin: settings.protectWithPin ? settings.pin : undefined
          }
        }
      };

      if (isDev) console.log('Upload Payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error('Missing required fields in upload request');
        } else if (response.status === 403) {
          throw new Error('Unauthorized access to upload endpoint. Check S3 bucket permissions or API credentials.');
        } else if (response.status === 429) {
          throw new Error('Too many requests. Please try again later.');
        } else {
          throw new Error(`Upload API error: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      if (isDev) console.log('Upload Response:', JSON.stringify(result, null, 2));

      const presignedUrls = result.presignedUrls;
      if (!Array.isArray(presignedUrls) || presignedUrls.length !== filesToUpload.length) {
        if (isDev) console.error('Upload API Response (Invalid presignedUrls):', JSON.stringify(result, null, 2));
        throw new Error(`Invalid or missing presigned URLs in response. Expected ${filesToUpload.length} URLs, got ${presignedUrls ? presignedUrls.length : 0}.`);
      }

      let completed = 0;
      const uploadPromises = filesToUpload.map(async (fileObj, i) => {
        const presignedUrl = presignedUrls[i];
        const fileToUpload = fileObj.watermarkedFile || fileObj.file;
        try {
          const res = await uploadWithRetry(presignedUrl, {
            method: 'PUT',
            body: fileToUpload,
            headers: {
              'Content-Type': fileToUpload.type
            }
          });

          if (!res.ok) {
            throw new Error(`Failed to upload: ${fileToUpload.name} (${res.status} ${res.statusText})`);
          }

          completed++;
          setUploadProgress(Math.round((completed / filesToUpload.length) * 100));
          setUploadMessages(prev => [...prev, `✅ ${fileToUpload.name} uploaded`]);
        } catch (err: any) {
          if (isDev) console.error(`Failed PUT to ${presignedUrl}: ${err.message}`);
          setUploadMessages(prev => [...prev, `❌ ${fileToUpload.name} failed: ${err.message}`]);
          throw err;
        }
      });

      await Promise.all(uploadPromises);

      setUploadMessages(prev => [...prev, '✅ Upload completed successfully']);
      setTimeout(() => navigate('/gallery'), 2000);
    } catch (err: any) {
      console.error('Upload error details:', err);
      setUploadMessages(prev => [...prev, `❌ Error: ${err.message}`]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    if (uploadedFiles.length > 0) {
      const confirm = window.confirm('You have unsaved files. Are you sure you want to cancel?');
      if (!confirm) return;
    }
    navigate('/gallery');
  };

  const isFormValid = () => {
    if (uploadedFiles.length === 0) return false;
    if (settings.protectWithPin && settings.pin.length !== 4) return false;
    return true;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className={`flex-1 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <Header title="Upload Gallery" sidebarCollapsed={sidebarCollapsed} />
        <main className="pt-16 p-6">
          <button
            onClick={() => navigate('/gallery')}
            className="flex items-center text-[#00BCEB] hover:text-[#00A5CF] mb-6 transition-colors duration-200"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Gallery
          </button>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <h1 className="text-2xl font-bold text-[#2D2D2D] mb-2">
              Upload Gallery – {projectData?.title}
            </h1>
            {error && (
              <p className="text-yellow-600 text-sm mb-2 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {error}
              </p>
            )}
            <div className="flex items-center space-x-4 text-gray-600">
              <span>{projectData?.eventDate ? new Date(projectData.eventDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }) : 'Date Unknown'}</span>
              <span>•</span>
              <span>{projectData?.clientName}</span>
              <span>•</span>
              <span>{projectData?.eventType || 'Unknown'}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-[#2D2D2D] mb-4">Upload Files</h3>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                    isDragging ? 'border-[#00BCEB] bg-[#00BCEB]/5' : 'border-gray-300 hover:border-[#00BCEB] hover:bg-[#00BCEB]/5'
                  }`}
                >
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-[#2D2D2D] mb-2">
                    Drop files here or click to browse
                  </p>
                  <p className="text-sm text-gray-500">
                    Supports JPG, PNG, HEIC files up to 50MB each
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
                {isUploading && (
                  <div className="mt-4">
                    <div className="text-right text-sm text-gray-500">
                      Uploading {uploadProgress}% of {uploadedFiles.length} file(s)
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-[#00BCEB] h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                {uploadMessages.length > 0 && (
                  <div className="mt-4 space-y-1 text-sm">
                    {uploadMessages.map((msg, index) => (
                      <p key={index} className={msg.startsWith("✅") ? "text-green-600" : "text-red-600"}>
                        {msg}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              {uploadedFiles.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="text-lg font-semibold text-[#2D2D2D] mb-4">
                    Uploaded Files ({uploadedFiles.length})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {uploadedFiles.map((file) => (
                      <div key={file.id} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                          <img
                            src={file.preview}
                            alt={file.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          onClick={() => removeFile(file.id)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <input
                          type="text"
                          value={file.title}
                          onChange={(e) => updateFileTitle(file.id, e.target.value)}
                          className="mt-2 w-full px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#00BCEB] focus:border-[#00BCEB]"
                          placeholder="Image title"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-[#2D2D2D] mb-4">Smart Features</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[#2D2D2D]">Enable Face Tagging</p>
                      <p className="text-sm text-gray-600">Automatically detect and tag faces</p>
                    </div>
                    <button
                      onClick={() => handleSettingChange('enableFaceTagging', !settings.enableFaceTagging)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        settings.enableFaceTagging ? 'bg-[#00BCEB]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          settings.enableFaceTagging ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[#2D2D2D]">Apply Watermark</p>
                      <p className="text-sm text-gray-600">Add studio watermark to images</p>
                    </div>
                    <button
                      onClick={() => handleSettingChange('applyWatermark', !settings.applyWatermark)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        settings.applyWatermark ? 'bg-[#00BCEB]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          settings.applyWatermark ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[#2D2D2D]">Protect Gallery with PIN</p>
                      <p className="text-sm text-gray-600">Secure client access with PIN</p>
                    </div>
                    <button
                      onClick={() => handleSettingChange('protectWithPin', !settings.protectWithPin)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        settings.protectWithPin ? 'bg-[#00BCEB]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          settings.protectWithPin ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
              {settings.protectWithPin && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="text-lg font-semibold text-[#2D2D2D] mb-4">PIN Protection</h3>
                  <div>
                    <label className="block text-sm font-medium text-[#2D2D2D] mb-2">
                      Enter 4-digit PIN for client access
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type={showPin ? 'text' : 'password'}
                        value={settings.pin}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          handleSettingChange('pin', value);
                        }}
                        className="w-full pl-10 pr-12 py-2 bg-[#F5F7FA] border border-gray-200 rounded-lg text-[#2D2D2D] focus:outline-none focus:ring-2 focus:ring-[#00BCEB] focus:border-[#00BCEB] transition-all duration-200"
                        placeholder="0000"
                        maxLength={4}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-[#00BCEB] transition-colors duration-200"
                      >
                        {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {settings.pin.length > 0 && settings.pin.length < 4 && (
                      <p className="mt-1 text-sm text-red-500 flex items-center">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        PIN must be 4 digits
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-[#2D2D2D] mb-4">Upload Summary</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Files to upload:</span>
                    <span className="font-medium text-[#2D2D2D]">{uploadedFiles.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Face tagging:</span>
                    <span className={`font-medium ${settings.enableFaceTagging ? 'text-green-600' : 'text-gray-400'}`}>
                      {settings.enableFaceTagging ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Watermark:</span>
                    <span className={`font-medium ${settings.applyWatermark ? 'text-green-600' : 'text-gray-400'}`}>
                      {settings.applyWatermark ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">PIN protection:</span>
                    <span className={`font-medium ${settings.protectWithPin ? 'text-green-600' : 'text-gray-400'}`}>
                      {settings.protectWithPin ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <button
                  onClick={handleUpload}
                  disabled={!isFormValid() || isUploading}
                  className={`w-full flex items-center justify-center px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                    isFormValid() && !isUploading
                      ? 'bg-[#00BCEB] text-white hover:bg-[#00A5CF] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Gallery
                    </>
                  )}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isUploading}
                  className="w-full px-6 py-3 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
export default GalleryUpload
