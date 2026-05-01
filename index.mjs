const port = process.env.masscode_port || '4321'
const baseUrl = `http://localhost:${port}`

const [snippets, tags] = await Promise.all([
  fetch(`${baseUrl}/snippets`).then((r) => r.json()),
  fetch(`${baseUrl}/tags`).then((r) => r.json()),
])

const input = (process.argv[2] || '').trim()
const tagPrefixMatch = input.match(/^@(\S*)(?:\s+(.*))?$/)

const exactTag = tagPrefixMatch
  ? tags.find((t) => t.name.toLowerCase() === tagPrefixMatch[1].toLowerCase())
  : null

let items

if (tagPrefixMatch && !input.includes(' ') && !exactTag) {
  const partial = tagPrefixMatch[1].toLowerCase()
  const candidates = tags.filter((t) => t.name.toLowerCase().startsWith(partial))
  items = candidates.map((t) => ({
    title: `@${t.name}`,
    subtitle: 'Tab to filter snippets by this tag',
    autocomplete: `@${t.name} `,
    valid: false,
  }))
  if (!items.length) {
    items = [{ title: 'No matching tags', subtitle: partial ? `@${partial}` : '@', valid: false }]
  }
} else {
  let pool = snippets.filter((s) => !s.isDeleted)
  let nameQuery = input
  let activeTag = null

  if (tagPrefixMatch) {
    const tagName = tagPrefixMatch[1]
    nameQuery = (tagPrefixMatch[2] || '').trim()
    activeTag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    if (activeTag) {
      pool = pool.filter((s) => s.tags?.some((t) => t.id === activeTag.id))
    } else {
      pool = []
    }
  }

  const matched = nameQuery
    ? pool.filter((s) => s.name?.toLowerCase().includes(nameQuery.toLowerCase()))
    : pool

  items = matched.map((element) => ({
    title: element.name,
    subtitle: [activeTag ? `@${activeTag.name}` : null, element.folder?.name || 'Inbox']
      .filter(Boolean)
      .join('  ·  '),
    arg: element.contents[0].value,
    mods: {
      alt: {
        subtitle: 'Open in massCode',
        arg: `masscode://goto?snippetId=${element.id}`,
      },
    },
  }))
}

console.log(JSON.stringify({ items }))
