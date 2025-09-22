import { getFileBaseName } from '../../src/globals';

describe('getFileBaseName', () => {
  test('extracts base name from unix-style path', () => {
    expect(getFileBaseName('notes/daily/2025-09-20.md')).toBe('2025-09-20');
  });

  test('extracts base name from windows-style path', () => {
    expect(getFileBaseName('C:\\vault\\meeting\\summary.docx')).toBe('summary');
  });

  test('returns file name when there is no extension', () => {
    expect(getFileBaseName('notes/drafts/readme')).toBe('readme');
  });

  test('preserves dot-prefixed files such as .gitignore', () => {
    expect(getFileBaseName('.gitignore')).toBe('.gitignore');
  });

  test('returns empty string when given an empty input', () => {
    expect(getFileBaseName('')).toBe('');
  });
});
