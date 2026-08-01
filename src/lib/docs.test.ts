import { describe, it, expect } from 'vitest';
import { getAllDocs, getDocBySlug, extractHeadings, getWordCount } from './docs';

describe('Docs Engine Utilities (src/lib/docs.ts)', () => {
  it('getAllDocs returns a list of indexed markdown documentation files', () => {
    const docs = getAllDocs();
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThan(5);

    const setupDoc = docs.find((d) => d.slug === 'setup');
    expect(setupDoc).toBeDefined();
    expect(setupDoc?.title).toBeTruthy();
  });

  it('getDocBySlug handles uppercase and lowercase slugs case-insensitively', () => {
    const lowercaseSetup = getDocBySlug('setup');
    const uppercaseSetup = getDocBySlug('SETUP');

    expect(lowercaseSetup).toBeDefined();
    expect(uppercaseSetup).toBeDefined();
    expect(lowercaseSetup?.meta.slug).toBe(uppercaseSetup?.meta.slug);

    const licenseLower = getDocBySlug('license');
    const licenseUpper = getDocBySlug('LICENSE');
    expect(licenseLower?.meta.slug).toBe(licenseUpper?.meta.slug);
  });

  it('extractHeadings correctly parses markdown h2 and h3 headings for TOC', () => {
    const markdown = `
# Title Heading
## Section Heading
### Sub-Section Heading
`;
    const headings = extractHeadings(markdown);
    expect(headings.length).toBe(2);
    expect(headings[0].text).toBe('Section Heading');
    expect(headings[0].level).toBe(2);
    expect(headings[1].text).toBe('Sub-Section Heading');
    expect(headings[1].level).toBe(3);
  });

  it('getWordCount accurately estimates total words in markdown text', () => {
    const text = 'SyncingBoard is a stateless design sync engine for Miro.';
    const wordCount = getWordCount(text);
    expect(wordCount).toBe(9);
  });
});
