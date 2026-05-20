
import { rawStoriesApiUrl } from './rawStoriesBackend';

// Test function to verify API endpoints work
export const testAPIs = async () => {
  console.log('=== TESTING APIs ===');
  
  // Test folder creation
  try {
    const testFolderResponse = await fetch(CREATE_FOLDER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'projects/client%20selection/prabhas__prabhas_wedding_2025-08-09/' })
    });
    console.log('Test folder creation:', testFolderResponse.status, await testFolderResponse.text());
  } catch (error) {
    console.error('Test folder creation failed:', error);
  }
  
  // Test bulk upload
  try {
    const testUploadResponse = await fetch(BULK_UPLOAD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: ['projects/gallery/prabhas__prabhas_wedding_2025-08-09/Snapchat-870713468.jpg'],
        folder: 'projects/client%20selection/prabhas__prabhas_wedding_2025-08-09/'
      })
    });
    console.log('Test bulk upload:', testUploadResponse.status, await testUploadResponse.text());
  } catch (error) {
    console.error('Test bulk upload failed:', error);
  }
  
  console.log('=== END API TEST ===');
};

// Real API endpoints for creating folders and uploading images
const CREATE_FOLDER_API = rawStoriesApiUrl('/default/createfolder');
const BULK_UPLOAD_API = rawStoriesApiUrl('/default/bulkupload');

export const createFavoritesFolderAPI = async (data: {
  folderName: string;
  imageKeys: string[];
  sourceFolder: string;
}) => {
  try {
    console.log('Creating new folder and uploading images:', data);

    // Extract projectName from sourceFolder
    const pathSegments = data.sourceFolder.split('/');
    const galleryIndex = pathSegments.indexOf('gallery');
    const projectName = galleryIndex !== -1 && galleryIndex + 1 < pathSegments.length ? pathSegments[galleryIndex + 1] : data.sourceFolder.split('/').pop() || 'default';
    console.log('Derived projectName from sourceFolder:', projectName);

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
    console.log('Folder created:', createFolderResult);

    // Step 2: Upload images to the folder
    console.log('=== UPLOAD DEBUG INFO ===');
    console.log('Original image keys:', data.imageKeys);
    console.log('Target folder path:', folderPath);
    console.log('Number of images to upload:', data.imageKeys.length);

    const uploadPayload = {
      files: data.imageKeys, // Full S3 keys
      folder: folderPath
    };

    // Log the exact stringified payload
    const stringifiedPayload = JSON.stringify(uploadPayload);
    console.log('Stringified upload payload:', stringifiedPayload);

    const uploadResponse = await fetch(BULK_UPLOAD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stringifiedPayload
    });

    console.log('Upload response status:', uploadResponse.status);
    console.log('Upload response ok:', uploadResponse.ok);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', uploadResponse.status, errorText);
      throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log('Final upload result:', uploadResult);

    // Adjust folderPath if Lambda returns a default (e.g., '/fav/')
    const adjustedFolderPath = uploadResult.folderPath === '/fav/' ? folderPath : uploadResult.folderPath;

    // Step 3: Verify the folder was created and contains images (with delay for S3 propagation)
    console.log('=== VERIFICATION STEP ===');
    try {
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3-second delay
      const verifyResponse = await fetch(
        rawStoriesApiUrl(`/default/getallimages?prefix=${encodeURIComponent(adjustedFolderPath.replace(/^\/+/, ''))}&recursive=true`),
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors',
        }
      );

      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        console.log('Verification - Folder contents:', verifyData);
        console.log('Verification - Files count:', verifyData.files?.length || 0);
        if (verifyData.files?.length === 0) {
          console.warn('No files found after upload. Check S3 consistency or API prefix.');
        }
      } else {
        console.error('Verification failed:', verifyResponse.status);
      }
    } catch (verifyError) {
      console.error('Verification error:', verifyError);
    }
    console.log('=== END VERIFICATION ===');
    console.log('=== END UPLOAD DEBUG ===');

    // Return success response with adjusted folder path
    return {
      success: true,
      message: `New folder "${projectName}" created successfully under ${data.folderName}! ${data.imageKeys.length} images uploaded to the folder.`,
      folderId: `favorites_${Date.now()}`,
      folderPath: adjustedFolderPath,
      folderName: projectName,
      imageCount: data.imageKeys.length,
      uploadedImages: data.imageKeys.map((key) => ({
        originalKey: key,
        newKey: `${adjustedFolderPath}${key.split('/').pop()}`,
        uploadStatus: 'success',
        uploadedAt: new Date().toISOString()
      })),
      createdAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('Error creating folder and uploading images:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      sourceFolder: data.sourceFolder,
      imageKeys: data.imageKeys
    });
    throw new Error(`Failed to create folder and upload images: ${error.message}`);
  }
};

// Mock API endpoint for fetching favorites folders
export const getFavoritesFoldersAPI = async () => {
  // Mock implementation - replace with actual API call
  console.log('Fetching favorites folders');
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Mock response with sample favorites folders
  return {
    success: true,
    folders: [
      {
        id: 'favorites_1',
        name: 'Wedding Highlights',
        imageCount: 25,
        createdAt: '2024-01-15T10:30:00Z',
        thumbnail: 'https://picsum.photos/200/200?random=1'
      },
      {
        id: 'favorites_2',
        name: 'Best Portraits',
        imageCount: 15,
        createdAt: '2024-01-10T14:20:00Z',
        thumbnail: 'https://picsum.photos/200/200?random=2'
      }
    ]
  };
};

// Mock API endpoint for fetching images in a favorites folder
export const getFavoritesFolderImagesAPI = async (folderId: string) => {
  // Mock implementation - replace with actual API call
  console.log('Fetching images for favorites folder:', folderId);
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Mock response with sample images
  return {
    success: true,
    images: [
      {
        id: 'img_1',
        title: 'Wedding Ceremony',
        imageUrl: 'https://picsum.photos/400/300?random=1',
        eventDate: '2024-01-15',
        shootType: 'Wedding',
        isVideo: false
      },
      {
        id: 'img_2',
        title: 'Couple Portrait',
        imageUrl: 'https://picsum.photos/400/300?random=2',
        eventDate: '2024-01-15',
        shootType: 'Portrait',
        isVideo: false
      }
    ]
  };
};
