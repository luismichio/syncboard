export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId: string;
}

/**
 * Parses a Figma URL to extract fileKey and nodeId parameters.
 * Pure function: side-effect free and testable in isolation.
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl | null {
  if (!url) return null;
  try {
    // Matches /file/FILE_KEY/ or /design/FILE_KEY/
    const fileMatch = url.match(/(?:file|design)\/([a-zA-Z0-9]+)\//);
    // Matches node-id=NODE_ID
    const nodeMatch = url.match(/node-id=([a-zA-Z0-9\-:]+)/);

    if (fileMatch && nodeMatch) {
      return {
        fileKey: fileMatch[1],
        nodeId: nodeMatch[1].replace('-', ':'), // Figma API uses colons, URLs use hyphens
      };
    }
  } catch (e) {
    console.error('Error parsing Figma URL:', e);
  }
  return null;
}
