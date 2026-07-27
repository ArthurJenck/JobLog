export type Sex = 'male' | 'female' | 'unspecified';

export interface UserProfile {
  firstName: string;
  sex: Sex;
}

export function accord(sex: Sex, forms: { female: string; other: string; male?: string }): string {
  if (sex === 'female') return forms.female;
  if (sex === 'male' && forms.male !== undefined) return forms.male;
  return forms.other;
}
