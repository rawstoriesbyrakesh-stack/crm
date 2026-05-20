// Type definitions for File System Access API
declare global {
  interface Window {
    showSaveFilePicker: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: { [mimeType: string]: string[] };
      }>;
    }) => Promise<FileSystemFileHandle>;
  }

  interface FileSystemFileHandle {
    createWritable: () => Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write: (data: any) => Promise<void>;
    close: () => Promise<void>;
  }
}

export {};
