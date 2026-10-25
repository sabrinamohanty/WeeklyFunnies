import { readFile, mkdir, writeFile, realpath, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const input = path.resolve(process.argv[2] || path.join(root, 'contributors.json'))
const colors = new Set(['yellow', 'blue', 'purple', 'green', 'pink', 'orange', 'gray'])
const signs = new Set(['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces', ''])
const assert = (ok, message) => { if (!ok) throw new Error(message) }

async function main() {
  const data = JSON.parse(await readFile(input, 'utf8'))
  assert(data.paper && /^[a-z0-9-]+$/.test(data.paper.id), 'Provide a paper id using lowercase letters, numbers, and hyphens.')
  assert(typeof data.paper.name === 'string' && data.paper.name.trim(), 'Provide a paper name.')
  assert(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(data.paper.pressDay), 'Provide a valid pressDay.')
  assert(Array.isArray(data.contributors) && data.contributors.length > 0, 'Add at least one contributor.')
  const ids = new Set(), emails = new Set(), photos = []
  const sourceRoot = await realpath(path.dirname(input))
  async function preparePhoto(filename, label) {
    assert(typeof filename === 'string' && /^photos\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(filename), `Use a local photos/ image for ${label}.`)
    const source = await realpath(path.resolve(sourceRoot, filename))
    assert(source.startsWith(sourceRoot + path.sep), 'Photos must remain inside the seed folder.')
    const destination = `photos/${label}${path.extname(source).toLowerCase()}`
    photos.push({ source, destination })
    return destination
  }
  const contributors = []
  for (const c of data.contributors) {
    assert(c && typeof c === 'object', 'Each contributor must be an object.')
    assert(Object.keys(c).every(k => ['id', 'name', 'first', 'role', 'city', 'birthday', 'bio', 'photo', 'artStyle', 'color', 'sign', 'login', 'highlights'].includes(k)), 'Unknown contributor field; do not include passwords, tokens, or secrets.')
    assert(c.artStyle === undefined || ['classic', 'manga', 'hero', 'sketch'].includes(c.artStyle), `Invalid art style for ${c.id}.`)
    if (c.birthday) {
      assert(typeof c.birthday === 'string' && /^\d{2}-\d{2}$/.test(c.birthday), 'Birthday must use MM-DD format.')
      const [month, day] = c.birthday.split('-').map(Number)
      const date = new Date(Date.UTC(2000, month - 1, day))
      assert(date.getUTCMonth() === month - 1 && date.getUTCDate() === day, 'Birthday must be a valid month and day.')
    }
    assert(typeof c.id === 'string' && /^[a-z0-9-]+$/.test(c.id) && !ids.has(c.id), 'Contributor ids must be unique lowercase slugs.')
    ids.add(c.id)
    assert(typeof c.name === 'string' && c.name.trim(), `Missing name for ${c.id}.`)
    assert(['Editor', 'Contributor'].includes(c.role), `Invalid role for ${c.id}.`)
    assert(colors.has(c.color) && signs.has(c.sign ?? ''), `Invalid color or zodiac sign for ${c.id}.`)
    const email = c.login?.email
    assert(c.login && Object.keys(c.login).every(k => k === 'email'), 'Login accepts email only. Never include passwords or tokens.')
    assert(typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), `Invalid email for ${c.id}.`)
    const normalizedEmail = email.trim().toLowerCase()
    assert(!emails.has(normalizedEmail), `Duplicate login email for ${c.id}.`)
    emails.add(normalizedEmail)
    const highlights = c.highlights ?? []
    assert(Array.isArray(highlights), `Highlights must be an array for ${c.id}.`)
    const preparedHighlights = await Promise.all(highlights.map(async (h, i) => {
      assert(h && typeof h.text === 'string' && h.text.trim(), `Missing highlight text for ${c.id}.`)
      assert((h.inComic === undefined || typeof h.inComic === 'boolean') && (h.serious === undefined || typeof h.serious === 'boolean'), `Highlight flags must be booleans for ${c.id}.`)
      assert(h.photos === undefined || Array.isArray(h.photos), `Highlight photos must be an array for ${c.id}.`)
      const highlightPhotos = await Promise.all((h.photos ?? []).map((filename, j) => preparePhoto(filename, `${c.id}-highlight-${i + 1}-${j + 1}`)))
      return { id: `${c.id}-highlight-${i + 1}`, contributorId: c.id, text: h.text.trim(), photos: highlightPhotos, inComic: h.inComic ?? true, serious: h.serious ?? false }
    }))
    let photo = null
    if (c.photo) {
      assert(typeof c.photo === 'string' && /^photos\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(c.photo), `Use a local photos/ image for ${c.id}.`)
      const source = await realpath(path.resolve(sourceRoot, c.photo))
      assert(source.startsWith(sourceRoot + path.sep), 'Photos must remain inside the seed folder.')
      photo = `photos/${c.id}${path.extname(source).toLowerCase()}`
      photos.push({ source, destination: photo })
    }
    contributors.push({ id: c.id, name: c.name.trim(), first: c.first || c.name.trim().split(/\s+/)[0], role: c.role, city: c.city || '', birthday: c.birthday || '', bio: c.bio || '', photo, artStyle: c.artStyle || 'classic', color: c.color, sign: c.sign || '', highlights: preparedHighlights })
  }
  assert(contributors.some(c => c.role === 'Editor'), 'Choose at least one Editor.')
  const output = path.join(root, 'generated')
  await mkdir(path.join(output, 'photos'), { recursive: true })
  for (const p of photos) await copyFile(p.source, path.join(output, p.destination))
  // Public profile data and private account invitations deliberately have separate outputs.
  await writeFile(path.join(output, 'profiles.json'), JSON.stringify({ version: 1, paper: data.paper, contributors }, null, 2) + '\n')
  await writeFile(path.join(output, 'demo-seed.json'), JSON.stringify({ version: 1, mode: 'demo', paper: data.paper, contributors, testUser: { startWithEmptyProfile: true, allowPhotoUpload: true, allowHighlights: true }, comic: { contributorIds: contributors.map(c => c.id), includeTestUser: true } }, null, 2) + '\n')
  await writeFile(path.join(output, 'account-invitations.private.json'), JSON.stringify({ version: 1, accounts: data.contributors.map(c => ({ contributorId: c.id, email: c.login.email.trim().toLowerCase(), action: 'invite' })) }, null, 2) + '\n', { mode: 0o600 })
  console.log(`Prepared ${contributors.length} contributors in ${output}. No app files or accounts were changed.`)
}

main().catch(error => { console.error(`Seed generation failed: ${error.message}`); process.exitCode = 1 })
