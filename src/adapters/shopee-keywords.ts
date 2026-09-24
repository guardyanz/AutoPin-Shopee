export function matchesProductKeywords(title: string, query: string): boolean {
  const terms = normalize(query).split(' ').filter(Boolean)
  if (terms.length === 0) return true
  const titleWords = normalize(title).split(' ').filter(Boolean)
  return terms.every((term) => titleWords.some((word) => word.includes(term)))
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}
