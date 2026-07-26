/**
 * Decode common HTML entities in a string.
 *
 * Handles both named entities (&amp;, &lt;, &gt;, &quot;, &#39;) and
 * numeric character references (&#61;, &#x3D;, etc).
 *
 * This is a pure function that works in any runtime (Node, Edge, browser).
 */
const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

export function decodeHtmlEntities(value: string): string {
  let result = value;

  // Replace named entities
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    result = result.split(entity).join(char);
  }

  // Replace decimal numeric references: &#61; &#38; etc
  result = result.replace(/&#(\d+);/g, (_match, dec) => {
    const code = parseInt(dec, 10);
    // Avoid null / control characters
    if (code < 32 && code !== 10 && code !== 13) return _match;
    return String.fromCharCode(code);
  });

  // Replace hex numeric references: &#x3D; &#x26; etc
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
    const code = parseInt(hex, 16);
    if (code < 32 && code !== 10 && code !== 13) return _match;
    return String.fromCharCode(code);
  });

  return result;
}
