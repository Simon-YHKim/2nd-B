import { profileChoiceLabelKey, profileSummaryParts } from '../profile-details';

// The one-line profile summary on /me/profile (Simon 2026-10-06). It only repeats what the user filled in,
// in field order, and never invents a line for someone who filled nothing.

test('an empty profile has no summary parts', () => {
  expect(profileSummaryParts({})).toEqual([]);
  expect(profileSummaryParts({ occupation: '   ' })).toEqual([]);
});

test('filled fields come in field order, text verbatim and choices as label keys, three at most', () => {
  expect(profileSummaryParts({ gender: 'male', region: '서울', occupation: '디자이너', household: '1인' })).toEqual([
    { text: '디자이너' },
    { text: '서울' },
    { text: '1인' },
  ]);
  expect(profileSummaryParts({ region: '부산', gender: 'female', marital: 'single' })).toEqual([
    { text: '부산' },
    { labelKey: 'genderFemale' },
    { labelKey: 'maritalSingle' },
  ]);
  // '답하지 않음' 은 요약에 싣지 않는다.
  expect(profileSummaryParts({ gender: 'undisclosed', motto: '천천히 꾸준히' })).toEqual([{ text: '천천히 꾸준히' }]);
  expect(profileSummaryParts({ occupation: 'a', region: 'b' }, 1)).toEqual([{ text: 'a' }]);
});

test('the same value keeps its own label per field (gender vs marital)', () => {
  expect(profileChoiceLabelKey('gender', 'other')).toBe('genderOther');
  expect(profileChoiceLabelKey('marital', 'other')).toBe('maritalOther');
  expect(profileChoiceLabelKey('marital', 'undisclosed')).toBe('maritalUndisclosed');
});
