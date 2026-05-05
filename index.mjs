import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const port = process.env.masscode_port || '4321'

const VALID_MODES = new Set(['all', 'note', 'code'])
const rawMode = (process.argv[2] || 'all').trim()
const mode = VALID_MODES.has(rawMode) ? rawMode : 'all'
const input = (process.argv[3] || '').trim()

const STORAGE_TYPES = {
  code: { listKey: 'snippets', urlKey: 'snippetId' },
  notes: { listKey: 'notes', urlKey: 'noteId' },
}

const vaultPath = await resolveVaultPath()
const storages = vaultPath ? await loadAllStorages(vaultPath) : []

const allSnippets = storages.flatMap((s) => s.snippets)
const tagsByStorage = Object.fromEntries(storages.map((s) => [s.name, s.tags]))

const modeToStorage = { all: null, note: 'notes', code: 'code' }
const targetStorage = modeToStorage[mode]
const scopedSnippets = targetStorage
  ? allSnippets.filter((s) => s.storage === targetStorage)
  : allSnippets

const visibleTagNames = uniqueByLower(
  targetStorage
    ? (tagsByStorage[targetStorage] || []).map((t) => t.name)
    : storages.flatMap((s) => s.tags.map((t) => t.name))
)

const visibleFolderNames = uniqueByLower(scopedSnippets.map((s) => s.folderName))

const tagPrefixMatch = input.match(/^#(\S*)(?:\s+(.*))?$/)
const folderPrefixMatch = !tagPrefixMatch && input.match(/^\/(\S*)(?:\s+(.*))?$/)

const exactTag = tagPrefixMatch
  ? visibleTagNames.find((n) => n.toLowerCase() === tagPrefixMatch[1].toLowerCase())
  : null
const exactFolder = folderPrefixMatch
  ? visibleFolderNames.find((n) => n.toLowerCase() === folderPrefixMatch[1].toLowerCase())
  : null

let items

if (tagPrefixMatch && !input.includes(' ') && !exactTag) {
  const partial = tagPrefixMatch[1].toLowerCase()
  const candidates = visibleTagNames.filter((n) => n.toLowerCase().startsWith(partial))
  items = candidates.map((name) => ({
    title: `#${name}`,
    subtitle: 'Tab to filter snippets by this tag',
    autocomplete: `#${name} `,
    valid: false,
  }))
  if (!items.length) {
    items = [{ title: 'No matching tags', subtitle: partial ? `#${partial}` : '#', valid: false }]
  }
} else if (folderPrefixMatch && !input.includes(' ') && !exactFolder) {
  const partial = folderPrefixMatch[1].toLowerCase()
  const candidates = visibleFolderNames.filter((n) => n.toLowerCase().startsWith(partial))
  items = candidates.map((name) => ({
    title: `/${name}`,
    subtitle: 'Tab to filter snippets by this folder',
    autocomplete: `/${name} `,
    valid: false,
  }))
  if (!items.length) {
    items = [{ title: 'No matching folders', subtitle: partial ? `/${partial}` : '/', valid: false }]
  }
} else {
  let pool = scopedSnippets
  let nameQuery = input
  let activeTagName = null
  let activeFolderName = null

  if (tagPrefixMatch) {
    const requested = tagPrefixMatch[1]
    nameQuery = (tagPrefixMatch[2] || '').trim()
    activeTagName = visibleTagNames.find((n) => n.toLowerCase() === requested.toLowerCase()) || null
    if (activeTagName) {
      const lower = activeTagName.toLowerCase()
      pool = pool.filter((s) => s.tags.some((t) => t.toLowerCase() === lower))
    } else {
      pool = []
    }
  } else if (folderPrefixMatch) {
    const requested = folderPrefixMatch[1]
    nameQuery = (folderPrefixMatch[2] || '').trim()
    activeFolderName =
      visibleFolderNames.find((n) => n.toLowerCase() === requested.toLowerCase()) || null
    if (activeFolderName) {
      const lower = activeFolderName.toLowerCase()
      pool = pool.filter((s) => s.folderName.toLowerCase() === lower)
    } else {
      pool = []
    }
  }

  const matched = nameQuery
    ? pool
        .map((s) => ({ s, score: fuzzyScore(nameQuery, s.name) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.s)
    : pool

  const codeMode = mode === 'code'

  items = matched.map((s) => {
    const url = `masscode://goto?${s.urlKey}=${s.id}`
    const subtitle = [
      activeTagName ? `#${activeTagName}` : null,
      activeFolderName ? `/${activeFolderName}` : null,
      mode === 'all' ? s.storage : null,
      activeFolderName ? null : s.folderName,
    ]
      .filter(Boolean)
      .join('  ·  ')

    return {
      title: s.name,
      subtitle,
      arg: codeMode ? url : s.content,
      mods: {
        alt: {
          subtitle: codeMode ? 'Copy to clipboard' : 'Open in massCode',
          arg: codeMode ? s.content : url,
        },
      },
    }
  })
}

if (!input) {
  items.unshift(
    {
      title: '#tagname',
      subtitle: 'Tag search — type # to browse tags, e.g. #llm prompt',
      autocomplete: '#',
      valid: false,
    },
    {
      title: '/foldername',
      subtitle: 'Folder search — type / to browse folders, e.g. /Inbox prompt',
      autocomplete: '/',
      valid: false,
    },
  )
}

console.log(JSON.stringify({ items }))

async function resolveVaultPath() {
  if (process.env.masscode_vault) return process.env.masscode_vault
  try {
    const res = await fetch(`http://localhost:${port}/system/storage-vault-path`)
    const json = await res.json()
    return json.vaultPath || null
  } catch {
    return null
  }
}

async function loadAllStorages(root) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const loaded = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const type = STORAGE_TYPES[entry.name]
    if (!type) continue
    const storage = await loadStorage(path.join(root, entry.name), entry.name, type)
    if (storage) loaded.push(storage)
  }
  return loaded
}

async function loadStorage(storageDir, storageName, type) {
  let state
  try {
    const raw = await readFile(path.join(storageDir, '.masscode', 'state.json'), 'utf8')
    state = JSON.parse(raw)
  } catch {
    return null
  }

  const tagMap = new Map((state.tags || []).map((t) => [t.id, t.name]))
  const entries = state[type.listKey] || []

  const snippets = []
  for (const entry of entries) {
    if (!entry?.filePath) continue
    let raw
    try {
      raw = await readFile(path.join(storageDir, entry.filePath), 'utf8')
    } catch {
      continue
    }
    const parsed = parseSnippetFile(raw, storageName)
    if (parsed.isDeleted) continue

    snippets.push({
      id: entry.id,
      name: parsed.name || path.basename(entry.filePath, '.md'),
      content: parsed.content,
      tags: parsed.tagIds.map((tid) => tagMap.get(tid)).filter(Boolean),
      storage: storageName,
      urlKey: type.urlKey,
      folderName: extractFolderName(entry.filePath),
    })
  }

  return { name: storageName, snippets, tags: state.tags || [] }
}

function parseSnippetFile(text, storageName) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const fm = m ? m[1] : ''
  const body = m ? m[2] : text

  const nameRaw = (fm.match(/^name:\s*(.+)$/m) || [])[1]
  const name = nameRaw ? nameRaw.trim().replace(/^['"](.*)['"]$/, '$1') : ''
  const isDeleted = parseInt((fm.match(/^isDeleted:\s*(\d+)/m) || [])[1] || '0', 10)

  let tagIds = []
  const inlineTags = fm.match(/^tags:\s*\[(.*)\]/m)
  if (inlineTags && inlineTags[1].trim()) {
    tagIds = inlineTags[1]
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n))
  } else {
    const blockTags = fm.match(/^tags:\s*\n((?:[ \t]+-\s*\d+\s*\n?)+)/m)
    if (blockTags) {
      tagIds = [...blockTags[1].matchAll(/-\s*(\d+)/g)].map((x) => parseInt(x[1], 10))
    }
  }

  let content
  if (storageName === 'code') {
    const fence = body.match(/^```[\w_-]*\n([\s\S]*?)\n```/m)
    content = fence ? fence[1] : body.trim()
  } else {
    content = body.trim()
  }

  return { name, isDeleted, tagIds, content }
}

function extractFolderName(filePath) {
  let p = filePath
  if (p.startsWith('.masscode/')) p = p.slice('.masscode/'.length)
  const segments = p.split('/')
  if (segments.length < 2) return 'Root'
  const folder = segments[0]
  return folder === 'inbox' ? 'Inbox' : folder
}

function fuzzyScore(query, target) {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 1

  let score = 0
  let qi = 0
  let lastMatchIdx = -1
  let consecutive = 0

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue

    let charScore = 1
    const prev = ti > 0 ? t[ti - 1] : ' '
    const isBoundary =
      ti === 0 ||
      /[\s\-_/.()[\]]/.test(prev) ||
      (target[ti] !== prev && target[ti].toUpperCase() === target[ti] && prev.toLowerCase() === prev)
    if (isBoundary) charScore += 8

    if (lastMatchIdx === ti - 1) {
      consecutive += 1
      charScore += consecutive * 5
    } else {
      consecutive = 0
    }

    if (qi === 0) charScore += Math.max(0, 5 - ti)

    score += charScore
    lastMatchIdx = ti
    qi += 1
  }

  if (qi < q.length) return 0
  return score - t.length * 0.05
}

function uniqueByLower(names) {
  const seen = new Set()
  const out = []
  for (const n of names) {
    const k = n.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(n)
  }
  return out
}
