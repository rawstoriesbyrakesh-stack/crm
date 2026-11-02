export const TRASH_RETENTION_DAYS: number;

export function getTrashDaysLeft(
  lastModified: string | null | undefined,
  now?: number,
  retentionDays?: number,
): number;

export function getExpiryDaysLeft(
  expiresAt: string | null | undefined,
  now?: number,
): number | null;

export function sanitizeFolderName(name: string): string;

export function calculateProposalTotals(
  items: Array<{ price: number | string }>,
  discountPercent?: number,
  taxPercent?: number,
): {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  grandTotal: number;
};

export function toggleSetValue<T>(values: Set<T>, value: T): Set<T>;

export interface FavoriteFile {
  key?: string;
  isFavorite?: boolean;
  presigned_url?: string;
  url?: string;
}

export interface FavoriteItem {
  id: string;
  key: string;
  filename: string;
  imageUrl: string;
  folderPath: string;
  folderName: string;
  isVideo: boolean;
}

export interface FavoriteGroup {
  folderPath: string;
  folderName: string;
  items: FavoriteItem[];
}

export function buildFavoriteGroups(
  files: FavoriteFile[],
  shareFavoriteKeys: Set<string> | string[],
  apiBaseUrl?: string,
): FavoriteGroup[];

export interface ProposalRecord {
  id: string;
}

export function saveProposalRecord<T extends ProposalRecord>(
  proposal: T,
  request: typeof fetch,
  endpoint: string,
): Promise<{ persisted: boolean; result: { success: true; persisted?: boolean } }>;

export function mergeProposalRecords<T extends ProposalRecord>(
  localProposals: T[],
  remoteProposals: T[],
): T[];
