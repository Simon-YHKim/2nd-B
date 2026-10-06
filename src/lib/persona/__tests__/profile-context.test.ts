import { readFileSync } from 'fs';
import { resolve } from 'path';

jest.mock('../../supabase/client', () => ({ getSupabaseClient: jest.fn() }));

import { profileContextLines } from '../profile-context';

// Simon Q-261007-05: 세컨비 reads what the user filled in. Only filled fields, no "prefer not to say",
// no chat name, plus the age computed from the birth date.

test('filled fields and the age become one line each, in field order', () => {
  expect(profileContextLines({ motto: '천천히 꾸준히', occupation: '디자이너', gender: 'female' }, 34)).toEqual([
    'age: 34',
    'occupation: 디자이너',
    'gender: female',
    'motto: 천천히 꾸준히',
  ]);
});

test('nothing filled and no age gives no lines; "prefer not to say" and a bad age are left out', () => {
  expect(profileContextLines({}, null)).toEqual([]);
  expect(profileContextLines({ gender: 'undisclosed', marital: 'undisclosed' }, -1)).toEqual([]);
  expect(profileContextLines({ region: '  ' }, 200)).toEqual([]);
});

test('the chat engine fences the profile as untrusted data and never sends the chat name', () => {
  const chat = readFileSync(resolve(__dirname, '..', '..', 'chat', 'conversation.ts'), 'utf8').replace(/\r\n/g, '\n');
  expect(chat).toContain('const profileLines = await loadProfileContext(input.userId);');
  expect(chat).toContain('<UNTRUSTED type="profile">\\n${sanitizeUntrusted(profileLines.join("\\n"))}\\n</UNTRUSTED>');
  expect(chat).not.toContain('chat_name');
  const ctx = readFileSync(resolve(__dirname, '..', 'profile-context.ts'), 'utf8');
  expect(ctx).not.toMatch(/select\([^)]*chat_name/);
});
