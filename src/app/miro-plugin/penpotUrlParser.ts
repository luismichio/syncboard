export interface PenpotUrlInfo {
  fileId: string;
  objectId: string;
}

/**
 * Parses Penpot editor URLs and extracts the fileId and objectId.
 * Standard format:
 * https://design.penpot.app/#/workspace/WS_ID/project/PROJ_ID/file/FILE_ID?node=OBJECT_ID
 */
export function parsePenpotUrl(url: string): PenpotUrlInfo | null {
  if (!url) return null;
  
  try {
    const fileIdMatch = url.match(/\/file\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
    if (!fileIdMatch) return null;
    
    const fileId = fileIdMatch[1];
    
    // Matches "?node=UUID" or "&node=UUID" anywhere in the URL (both standard search params or inside hashes)
    const nodeMatch = url.match(/[?&]node=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
    if (!nodeMatch) return null;
    
    const objectId = nodeMatch[1];
    
    return { fileId, objectId };
  } catch {
    return null;
  }
}
