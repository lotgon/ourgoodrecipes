import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_URL = 'https://ourgoodrecipes.blogspot.com';
const FEED_URL = `${BLOG_URL}/feeds/posts/default?alt=json&max-results=500`;
const OUT_DIR = join(ROOT, 'recipes', 'blogger');
const IMAGE_DIR = join(ROOT, 'images', 'blogger');
const OVERRIDES = JSON.parse(readFileSync(join(ROOT, 'manual_overrides.json'), 'utf8'));

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(IMAGE_DIR, { recursive: true });

const stripHtml = html => html
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n')
  .replace(/<\/li>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+\n/g, '\n')
  .replace(/\n\s+/g, '\n')
  .trim();

function slugify(s) {
  const map = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ы:'y',э:'e',ю:'yu',я:'ya',ь:'',ъ:''};
  return s.toLowerCase().split('').map(c => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'recipe';
}

function postId(entry) {
  const raw = entry.id?.$t || '';
  return raw.split('.post-').pop();
}

function labels(entry) {
  return (entry.category || []).map(x => x.term).filter(Boolean);
}

function alternateUrl(entry) {
  return (entry.link || []).find(x => x.rel === 'alternate')?.href || null;
}

function extractImageUrls(html) {
  const out = [];
  for (const m of html.matchAll(/<img[^>]+(?:src|data-original)=["']([^"']+)["'][^>]*>/gi)) {
    let u = m[1].replace(/&amp;/g, '&');
    if (u.startsWith('//')) u = 'https:' + u;
    if (/blogger\.googleusercontent\.com|bp\.blogspot\.com|googleusercontent\.com/i.test(u)) out.push(u);
  }
  return [...new Set(out)];
}

function listItemsBetween(html, headingNeedle, nextHeadingNeedle) {
  const lower = html.toLowerCase();
  let start = lower.indexOf(headingNeedle.toLowerCase());
  if (start < 0) return [];
  let end = nextHeadingNeedle ? lower.indexOf(nextHeadingNeedle.toLowerCase(), start + headingNeedle.length) : -1;
  if (end < 0) end = html.length;
  const block = html.slice(start, end);
  const li = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => stripHtml(m[1])).filter(Boolean);
  return li;
}

function parseRendered(entry, id) {
  const html = entry.content?.$t || '';
  if (OVERRIDES[id]) {
    const o = OVERRIDES[id];
    return {
      intro: o.intro || '',
      ingredients: o.ingredients || [],
      steps: o.steps || [],
      notes: o.notes || []
    };
  }
  const ingredients = listItemsBetween(html, '🥗 Ингредиенты', '👩‍🍳 Приготовление');
  const steps = listItemsBetween(html, '👩‍🍳 Приготовление', '✨ Приятного аппетита');
  const introMatch = html.match(/<p[^>]*border-left:[^>]*>([\s\S]*?)<\/p>/i);
  return { intro: introMatch ? stripHtml(introMatch[1]) : '', ingredients, steps, notes: [] };
}

function existingByNormalizedTitle() {
  const map = new Map();
  const dirs = [join(ROOT, 'recipes')];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir, { recursive: true })) {
      if (!name.endsWith('.json')) continue;
      try {
        const p = join(dir, name);
        const d = JSON.parse(readFileSync(p, 'utf8'));
        if (d.title) map.set(d.title.toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim(), p);
      } catch {}
    }
  }
  return map;
}

async function downloadImages(urls, slug) {
  const saved = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = await fetch(urls[i], { redirect: 'follow' });
      if (!r.ok) continue;
      const type = r.headers.get('content-type') || '';
      const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
      const dir = join(IMAGE_DIR, slug);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${i + 1}${ext}`);
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      saved.push(file.replace(ROOT + '/', ''));
    } catch (e) {
      console.warn('image failed', urls[i], e.message);
    }
  }
  return saved;
}

const response = await fetch(FEED_URL, { redirect: 'follow' });
if (!response.ok) throw new Error(`Blogger feed failed: ${response.status} ${response.statusText}`);
const feed = await response.json();
const entries = feed.feed?.entry || [];
console.log(`Fetched ${entries.length} Blogger posts`);

const existingTitles = existingByNormalizedTitle();
const manifest = [];
let imported = 0, duplicateTitles = 0;

for (const entry of entries) {
  const id = postId(entry);
  const title = entry.title?.$t?.trim() || `Recipe ${id}`;
  const slug = `${slugify(title)}-${id.slice(-6)}`;
  const parsed = parseRendered(entry, id);
  const imageUrls = extractImageUrls(entry.content?.$t || '');
  const images = await downloadImages(imageUrls, slug);
  const normTitle = title.toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim();
  const duplicateOf = existingTitles.get(normTitle)?.replace(ROOT + '/', '') || null;
  if (duplicateOf) duplicateTitles++;

  const recipe = {
    id: `blogger-${id}`,
    title,
    status: 'imported',
    source: {
      type: 'blogger',
      blog: BLOG_URL,
      postId: id,
      url: alternateUrl(entry)
    },
    publishedAt: entry.published?.$t?.slice(0, 10) || null,
    updatedAt: entry.updated?.$t?.slice(0, 10) || null,
    labels: labels(entry),
    mainIngredients: [],
    intro: parsed.intro,
    ingredients: parsed.ingredients,
    steps: parsed.steps,
    notes: parsed.notes,
    images,
    originalImageUrls: imageUrls,
    possibleDuplicateOf: duplicateOf
  };

  writeFileSync(join(OUT_DIR, `${slug}.json`), JSON.stringify(recipe, null, 2) + '\n');
  manifest.push({ id: recipe.id, title, file: `recipes/blogger/${slug}.json`, images, possibleDuplicateOf: duplicateOf });
  imported++;
}

writeFileSync(join(OUT_DIR, '_manifest.json'), JSON.stringify({ importedAt: new Date().toISOString(), count: manifest.length, duplicateTitles, recipes: manifest }, null, 2) + '\n');
console.log(`Imported ${imported}; exact-title possible duplicates: ${duplicateTitles}`);
