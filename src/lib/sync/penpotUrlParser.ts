export interface PenpotUrlInfo {
  fileId: string;
  objectId: string;
}

/**
 * Parses Penpot editor URLs and extracts the fileId and objectId.
 * Supports multiple URL structures:
 * - Format A: https://design.penpot.app/#/workspace/WS_ID/project/PROJ_ID/file/FILE_ID?node=OBJECT_ID
 * - Format B: https://design.penpot.app/#/workspace?team-id=TEAM_ID&file-id=FILE_ID&board-id=OBJECT_ID
 */
export function parsePenpotUrl(url: string): PenpotUrlInfo | null {
  if (!url) return null;
  
  try {
    // 1. Extract fileId: search for "/file/UUID" or "?file-id=UUID"
    const fileIdMatch = url.match(/\/file\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
    const fileIdParamMatch = url.match(/[?&]file-id=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
    const fileId = fileIdMatch ? fileIdMatch[1] : (fileIdParamMatch ? fileIdParamMatch[1] : null);
    
    if (!fileId) return null;
    
    // 2. Extract objectId: search for "?node=UUID", "?board-id=UUID" or default to 'selection'
    const nodeMatch = url.match(/[?&]node=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
    const boardMatch = url.match(/[?&]board-id=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
    const objectId = nodeMatch ? nodeMatch[1] : (boardMatch ? boardMatch[1] : 'selection');
    
    return { fileId, objectId };
  } catch {
    return null;
  }
}
