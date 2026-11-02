
import { rawStoriesApiUrl } from './rawStoriesBackend';

// Real API endpoints for creating folders and uploading images
const CREATE_FOLDER_API = rawStoriesApiUrl('/default/createfolder');
const BULK_UPLOAD_API = rawStoriesApiUrl('/default/bulkupload');
const GET_ALL_IMAGES_API = rawStoriesApiUrl('/default/getallimages');
const FAVORITES_ROOT = 'projects/client selection/';

interface FavoriteFolderResponse {
  name?: string;
  path: string;
  createdAt?: string;
}

interface FavoriteFileResponse {
  key: string;
  filename?: string;
  presigned_url?: string;
  url?: string;
  last_modified?: string;
  shootType?: string;
  isFavorite?: boolean;
  tags?: string[];
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export const createFavoritesFolderAPI = async (data: {
  folderName: string;
  imageKeys: string[];
  sourceFolder: string;
}) => {
  try {
    if (data.imageKeys.length === 0) throw new Error('Select at least one image to add.');

    // Extract projectName from sourceFolder
    const pathSegments = data.sourceFolder.split('/');
    const galleryIndex = pathSegments.indexOf('gallery');
    const projectName = galleryIndex !== -1 && galleryIndex + 1 < pathSegments.length ? pathSegments[galleryIndex + 1] : data.sourceFolder.split('/').pop() || 'default';

    // Construct the full folder path using folderName and projectName
    const folderPath = `projects/${data.folderName}/${projectName}/`;

    // Step 1: Create the folder in parent directory
    const createFolderResponse = await fetch(CREATE_FOLDER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: folderPath
      })
    });

    if (!createFolderResponse.ok) {
      const errorText = await createFolderResponse.text();
      throw new Error(`Failed to create folder: ${createFolderResponse.status} ${errorText}`);
    }

    const createFolderResult = await createFolderResponse.json();
    if (!createFolderResult?.success) {
      throw new Error(createFolderResult?.message || 'The favorites folder could not be created.');
    }

    // Step 2: Upload images to the folder
    const uploadPayload = {
      files: data.imageKeys, // Full S3 keys
      folder: folderPath
    };

    const uploadResponse = await fetch(BULK_UPLOAD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadPayload)
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    const uploads = Array.isArray(uploadResult?.uploads) ? uploadResult.uploads : [];
    const failedUploads = uploads.filter((upload: { success?: boolean }) => upload.success === false);
    if (uploadResult?.success !== true || uploads.length !== data.imageKeys.length || failedUploads.length > 0) {
      const failedNames = failedUploads.map((upload: { key?: string }) => upload.key).filter(Boolean).join(', ');
      throw new Error(failedNames ? `Some images could not be copied: ${failedNames}` : 'The server did not confirm that all images were copied.');
    }

    const adjustedFolderPath = uploadResult.folderPath || createFolderResult.folderPath || folderPath;

    // Return success response with adjusted folder path
    return {
      success: true,
      message: `New folder "${projectName}" created successfully under ${data.folderName}! ${data.imageKeys.length} images uploaded to the folder.`,
      folderId: encodeURIComponent(adjustedFolderPath),
      folderPath: adjustedFolderPath,
      folderName: projectName,
      imageCount: data.imageKeys.length,
      uploadedImages: uploads.map((upload: { key: string }, index: number) => ({
        key: upload.key,
        originalKey: data.imageKeys[index],
        newKey: upload.key,
        uploadStatus: 'success',
        uploadedAt: new Date().toISOString()
      })),
      createdAt: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`Failed to create folder and upload images: ${getErrorMessage(error)}`);
  }
};

// Real API endpoint for fetching favorites folders
export const getFavoritesFoldersAPI = async () => {
  try {
    // Fetch project folders under the same root used when copying client selections.
    const response = await fetch(
      `${GET_ALL_IMAGES_API}?prefix=${encodeURIComponent(FAVORITES_ROOT)}&recursive=false`,
      {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      mode: 'cors',
    }
  );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch favorites folders: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch favorites folders');
    }

    // Transform folder data to expected format
    const folders = ((data.folders || []) as FavoriteFolderResponse[]).map((folder) => ({
      id: encodeURIComponent(folder.path),
      name: folder.name || folder.path.split('/').filter(Boolean).pop() || 'Untitled',
      imageCount: 0, // Would need additional API call to get count
      createdAt: folder.createdAt || new Date().toISOString(),
      thumbnail: null, // Would need to fetch first image
      path: folder.path
    }));

    return {
      success: true,
      folders
    };
  } catch (error) {
    throw new Error(`Failed to fetch favorites folders: ${getErrorMessage(error)}`);
  }
};

// Real API endpoint for fetching images in a favorites folder
export const getFavoritesFolderImagesAPI = async (folderPath: string) => {
  try {
    // Folder IDs are URI encoded so path separators and underscores remain unambiguous.
    let decodedPath = folderPath;
    try { decodedPath = decodeURIComponent(folderPath); } catch { /* Accept a raw path as a fallback. */ }
    const prefix = `${decodedPath.replace(/^\/+|\/+$/g, '')}/`;

    const response = await fetch(
      `${GET_ALL_IMAGES_API}?prefix=${encodeURIComponent(prefix)}&recursive=true`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch folder images: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch folder images');
    }

    // Transform file data to expected format
    const images = ((data.files || []) as FavoriteFileResponse[]).map((file) => ({
      id: file.key,
      title: file.filename || file.key.split('/').pop() || 'Untitled',
      imageUrl: file.presigned_url || file.url,
      key: file.key,
      eventDate: file.last_modified || new Date().toISOString(),
      shootType: file.shootType || 'Unknown',
      isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(file.key),
      isFavorite: file.isFavorite || false,
      tags: file.tags || []
    }));

    return {
      success: true,
      images
    };
  } catch (error) {
    throw new Error(`Failed to fetch folder images: ${getErrorMessage(error)}`);
  }
};
