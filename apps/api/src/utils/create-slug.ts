export function createSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove symbols
    .replace(/[\s-]+/g, '-') // Replace spaces and repeated hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}
