import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve data files relative to this script, so it runs from any folder
const DIR = dirname(fileURLToPath(import.meta.url));

const BLOG_ID = '4333353184444059143';
const TOKEN_FILE = join(DIR, 'blogger_token.json');
// Posts styled by hand in the browser (no draft marker) — keep auto-runs off them
const DONE_IDS = ['7750670184181847377', '8165197205662590687'];

const creds = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));

async function getAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('No access token: ' + JSON.stringify(d));
  return d.access_token;
}

async function updatePost(token, postId, title, content) {
  const r = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${postId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: postId, title, content }),
    }
  );
  const d = await r.json();
  if (d.error) throw new Error(JSON.stringify(d.error));
  return d;
}

async function fetchAllPosts(token) {
  let posts = [], pageToken = null;
  do {
    const url = new URL(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts`);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('fetchBodies', 'true');
    url.searchParams.set('status', 'live');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    posts = posts.concat(d.items || []);
    pageToken = d.nextPageToken;
  } while (pageToken);
  return posts;
}

// Recover the pristine original from an already-formatted post (text after the
// draft marker), so re-formatting never double-wraps the styled HTML.
const DRAFT_MARKER = '— оригинальный текст (черновик) —</p>';
function getOriginal(content) {
  const idx = content.indexOf(DRAFT_MARKER);
  return idx === -1 ? content : content.slice(idx + DRAFT_MARKER.length);
}

// ---------- Text utilities ----------

function stripCodeFences(html) {
  return html.replace(/```[a-z]*/gi, '');
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/```[a-z]*/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ');
}

// Strip leading emoji / symbols / bullets from a header title for classification
function normalizeTitle(t) {
  return t.replace(/^[^\p{L}\d]+/u, '').trim();
}

// Import artifacts that are not recipe content: source attributions, bare URLs,
// "see here"-style link leftovers, and junk pasted from the Ginger browser
// extension. These are unambiguous, so they're safe to drop from any list.
// NB: JS \b does not work after Cyrillic letters, so we don't rely on it here.
function isJunkLine(l) {
  l = l.trim();
  // bare URL or Ginger-extension junk (matched anywhere in the line)
  if (/^https?:\/\/|^www\.|enable ginger|cannot connect to ginger|edit in ginger|disable in this text field/i.test(l)) return true;
  // explicit attribution leftovers
  if (/^(рецепт\S*\s+взят|взят\S*\s+(с|из|от)|по мотивам)/i.test(l)) return true;
  // "Оригинал[ьный] рецепт … тут/здесь/посмотреть/<url>" — a source pointer, not a step
  if (/^(оригинал|источник|original|recipe source)/i.test(l) &&
      /(https?:\/\/|www\.|тут|здесь|посмотрет|взят|сайт|ссылк|\.com|\.ru|:\s*$)/i.test(l)) return true;
  // a bare "see here"-style link leftover (must point somewhere — avoids eating
  // a real instruction like "Смотрите за огнём")
  if (/^(посмотреть|подробнее)/i.test(l) && /(здесь|тут|ссылк|сайт|http)/i.test(l)) return true;
  return false;
}
// Drop junk lines from a multi-line text blob (used for intro paragraphs)
function dropJunk(text) {
  return text.split('\n').map(s => s.trim()).filter(s => s && !isJunkLine(s)).join('\n');
}

// Split a block of text into clean item lines, handling glued emoji/«Шаг N» lists
function blockToLines(text) {
  let lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const emojiCount = (line.match(/\p{Extended_Pictographic}/gu) || []).length;
    const stepCount = (line.match(/Шаг\s*\d+/gi) || []).length;

    if (stepCount >= 2) {
      const parts = line.split(/(?=Шаг\s*\d+\s*[—\-:])/i).map(s => s.trim()).filter(Boolean);
      out.push(...parts);
    } else if (emojiCount >= 2 && line.length > 35) {
      // Emoji used as bullet separators — split before each emoji
      const parts = line.split(/(?=\p{Extended_Pictographic})/u).map(s => s.trim()).filter(Boolean);
      out.push(...parts);
    } else {
      out.push(line);
    }
  }
  // Repair glued words at lost line breaks: lowercase-Cyrillic directly
  // followed by uppercase-Cyrillic never occurs naturally in Russian.
  return out
    .map(l => l
      .replace(/([а-яё])([А-ЯЁ])/g, '$1. $2')          // lost line break between words
      .replace(/([а-яё][.!?])([А-ЯЁ])/g, '$1 $2')      // missing space after sentence end
      .replace(/([а-яёa-z]):([А-ЯЁA-Z])/g, '$1: $2'))  // missing space after colon
    .filter(l => l.length > 1 && !isJunkLine(l));
}

function extractItemsFromBlock(html) {
  return blockToLines(stripHtml(html));
}

// ---------- Classification ----------

const ING_PAT = /^(ингредиент|ингридиент|состав|продукт|вам понадоб|нам понадоб)/i;
const STEP_PAT = /^(приготовлен|способ|инструкц|пошагов|как готов|шаги|метод)/i;
const SKIP_PAT = /^(совет|примечани|note|tip|важно|внимани|подача|подавать)/i;
// A line that opens a "tips / tricks" section (header for one or more tips)
const TIPS_HEADER = /^(маленьк\S*\s+хитрост|хитрост|совет|полезн\S*\s+совет|на\s+заметку|примечани|рекомендац)\S*\s*:?\s*$/i;
function isTipsHeader(line) {
  return line.length < 45 && TIPS_HEADER.test(normalizeTitle(line));
}

function classify(title) {
  const t = normalizeTitle(title);
  if (ING_PAT.test(t)) return 'ing';
  if (STEP_PAT.test(t)) return 'step';
  if (SKIP_PAT.test(t) || TIPS_HEADER.test(t)) return 'skip';
  return 'other';
}

// ---------- Structured parser (level-aware) ----------

function parseStructuredHTML(html, postTitle) {
  const clean = stripCodeFences(html);

  // Walk headers in document order, tracking level
  const headerRe = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const segments = [];
  let lastIndex = 0;
  let preBody = '';
  let m;
  while ((m = headerRe.exec(clean)) !== null) {
    const before = clean.slice(lastIndex, m.index);
    if (segments.length === 0) preBody += before;
    else segments[segments.length - 1].body += before;
    segments.push({ level: parseInt(m[1][1], 10), title: stripHtml(m[2]).trim(), body: '' });
    lastIndex = headerRe.lastIndex;
  }
  if (segments.length) segments[segments.length - 1].body += clean.slice(lastIndex);
  else preBody += clean.slice(lastIndex);

  const introParts = [];
  const preIntro = stripHtml(preBody).trim();
  if (preIntro) introParts.push(preIntro);

  const ingSections = [];
  const stepSections = [];
  const notes = [];
  let pendingLabel = null;
  let current = null;        // { kind:'ing'|'step', section, level }
  let seenSection = false;

  const titleNorm = (postTitle || '').toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim();

  for (const seg of segments) {
    const kind = classify(seg.title);
    const items = extractItemsFromBlock(seg.body);

    if (kind === 'ing') {
      seenSection = true;
      const section = { label: pendingLabel, groups: [{ sublabel: null, items }] };
      ingSections.push(section);
      current = { kind: 'ing', section, level: seg.level };
    } else if (kind === 'step') {
      seenSection = true;
      const section = { label: pendingLabel, groups: [{ sublabel: null, items }] };
      stepSections.push(section);
      current = { kind: 'step', section, level: seg.level };
    } else if (kind === 'skip') {
      const tipItems = extractItemsFromBlock(seg.body);
      if (tipItems.length > 1) notes.push({ label: normalizeTitle(seg.title), items: tipItems });
      else if (tipItems.length === 1) notes.push({ label: normalizeTitle(seg.title), text: tipItems[0] });
      current = null;
    } else {
      // OTHER: sub-group / content-blob / sub-recipe name / post title / intro
      const isEmptySec = current &&
        current.section.groups.length === 1 &&
        current.section.groups[0].sublabel === null &&
        current.section.groups[0].items.length === 0;
      const emojiN = (seg.title.match(/\p{Extended_Pictographic}/gu) || []).length;
      const looksLikeContent = emojiN >= 2 || seg.title.length > 60 ||
        /Шаг\s*\d+/i.test(seg.title) || /^\d+[\.\)]\s/.test(seg.title);

      if (current && isEmptySec && looksLikeContent && seg.level <= current.level) {
        // Content blob whose header lives at a shallower level than its section
        // header (pasted-from-chat structure) — use it as the section's items.
        const blobItems = blockToLines(seg.title).concat(items);
        current.section.groups[0] = { sublabel: null, items: blobItems };
      } else if (current && seg.level > current.level) {
        // Deeper header inside a section → sub-group (Для теста / Бисквит / phase)
        const g = current.section.groups;
        if (g.length === 1 && g[0].sublabel === null && g[0].items.length === 0) {
          g[0] = { sublabel: seg.title, items };
        } else {
          g.push({ sublabel: seg.title, items });
        }
      } else if (!seenSection) {
        // Before any section → this is the post title or intro paragraph
        const segTitleNorm = seg.title.toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim();
        const isTitle = titleNorm && segTitleNorm &&
          (titleNorm.includes(segTitleNorm) || segTitleNorm.includes(titleNorm));
        if (!isTitle && seg.title) introParts.push(seg.title);
        const b = stripHtml(seg.body).trim();
        if (b) introParts.push(b);
        pendingLabel = null;
        current = null;
      } else {
        // After a section → a named sub-recipe (e.g. «Заварной крем»)
        pendingLabel = seg.title;
        current = null;
        const b = stripHtml(seg.body).trim();
        if (b) introParts.push(b);
      }
    }
  }

  const hasStructure = ingSections.length > 0 || stepSections.length > 0;

  // If there are multiple sub-recipes, give the first (unlabeled) ones the recipe name
  const anyLabel = [...ingSections, ...stepSections].some(s => s.label);
  let intro = introParts.filter(Boolean).map(dropJunk).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (anyLabel) {
    const firstName = postTitle && postTitle.length < 45 ? postTitle : null;
    if (firstName) {
      for (const s of [...ingSections, ...stepSections]) if (!s.label) s.label = firstName;
    }
  }

  return { intro, ingSections, stepSections, notes, hasStructure };
}

// ---------- Plain parser (no headers) ----------

const STEP_NUM = /^\d+[\.\)]\s+\S/;
const STEP_WORD = /^шаг\s+\d+/i;
const ING_INLINE = /^(ингредиент|ингридиент|состав|продукт)/i;
const STEP_INLINE = /^(приготовлен|пошагов|способ|инструкц|как готов|метод)/i;

const QTY_RE = /^[\d½¼¾⅓⅔⅛]+([.,\-–]\s*[\d½¼¾⅓⅔⅛]+)?\s*(г|гр|кг|мл|л|шт|ст|ч|зуб|стак|пуч|горст|кусоч|щепот|дольк|банк|пачк|уп|г\.|мл\.)?/i;
// Ingredient lines also commonly carry the amount at the END: "Лук — 1 шт."
// Require spaces around the dash so ranges like "1-2" / "20-25" don't match.
const QTY_TAIL = /\s[—–-]\s+([\d½¼¾⅓⅔⅛]+|по вкусу|для жарки|щепотк)/i;
// Quantity anywhere in the line: "творог 500 гр." (amount not at the start).
// Unicode lookahead for the word end — JS \b does not work with Cyrillic.
const QTY_MID = /[\d½¼¾⅓⅔⅛]+([.,]\d+)?\s*(грамм[а-яё]*|гр|кг|мл|л|шт[а-яё]*|стак[а-яё]*|зуб[а-яё]*|пуч[а-яё]*|горст[а-яё]*|пакетик[а-яё]*|ст\.?\s*л|ч\.?\s*л)(?![\p{L}])/iu;
function hasQty(l) {
  return QTY_RE.test(l) || /^[\-•▢*]/.test(l) || QTY_TAIL.test(l) || QTY_MID.test(l);
}
function startsWithQty(l) {
  return QTY_RE.test(l) || /^[\-•▢*]/.test(l);
}
// Quantity by unit (ignores a bare leading number, unlike QTY_RE)
function hasUnitQty(l) {
  return QTY_TAIL.test(l) || QTY_MID.test(l) || /по вкусу/i.test(l);
}
// A numbered line ("1. …") — is it a step, or just a numbered ingredient?
function numberedIsStep(line) {
  const rest = line.replace(/^\d+[\.\)]\s*/, '');
  if (isInstruction(rest)) return true;          // "1. Обжарьте…"
  if (hasUnitQty(rest)) return false;            // "2. яйца — 4 шт."
  return rest.split(/\s+/).length >= 4;          // "1. В томатной пасте…" (sentence)
}

// A cooking instruction (prose recipes with no headers/numbers). Whole-word verb
// forms only — must not match nouns like "запеканка" (which contains "запека").
const STEP_VERB = new RegExp('(?<![\\p{L}])(' + [
  'смешайте','смешать','смешиваем','добавьте','добавить','добавляем','добавляйте',
  'перемешайте','перемешать','перемешиваем','положите','положить','кладём','кладем',
  'возьмите','выпекать','выпекаем','выпекайте','испеките','нарежьте','нарезать','нарезаем','режем','режьте',
  'обжарьте','обжарить','обжариваем','жарим','жарьте','жарить','разогрейте','разогреть',
  'влейте','влить','вливаем','взбейте','взбить','взбиваем','залейте','залить','заливаем',
  'посыпьте','посыпать','распределите','распределить','поставьте','ставим',
  'готовим','готовьте','готовить','варим','варите','варить','сварите','тушим','тушите','тушить',
  'запекаем','запекайте','запекать','смажьте','смазать','вымешивайте','вымесить',
  'раскатайте','раскатать','снимите','снять','остудите','остудить','подавайте','подавать',
  'накройте','накрыть','доведите','довести','посолите','посолить','поперчите','натрите','натереть',
  'очистите','очистить','промойте','промыть','замесите','замесить','замочите',
  'соедините','соединить','выложите','выложить','выкладываем','сформируйте','сформировать',
  'поместите','поместить','укладывайте','перетопите','засыпьте','всыпьте','выровняйте','проткните',
  'выпарить','выпарите','выпарь','отварите','отварить','обваляйте','перетрите','натрите',
  'режем','жарим','смешиваем','добавляем','варим','тушим','запекаем','выкладываем','кладём','кладем',
  'мешаем','перемешиваем','солим','перчим','измельчите','измельчить','взбиваем','остужаем',
].join('|') + ')(?![\\p{L}])', 'iu');
function isInstruction(l) {
  return STEP_VERB.test(l);
}
// Instruction strong enough to start/break the steps section: a verb in a sentence
function isInstructionSentence(l) {
  return isInstruction(l) && l.split(/\s+/).length >= 3;
}

// Many posts use real list markup: <ul> for ingredients, <ol> for steps.
// That is far more reliable than text heuristics, so try it first.
function parseListBased(html) {
  const clean = stripCodeFences(html);
  const liText = block => [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map(m => stripHtml(m[1]).replace(/\s+/g, ' ').trim()).filter(l => l.length > 1 && !isJunkLine(l));

  const steps = [];
  for (const m of clean.matchAll(/<ol[^>]*>([\s\S]*?)<\/ol>/gi)) steps.push(...liText(m[1]));
  const ingredients = [];
  for (const m of clean.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/gi)) ingredients.push(...liText(m[1]));

  const firstList = clean.search(/<[ou]l[\s>]/i);
  let intro = '';
  if (firstList >= 0) {
    intro = stripHtml(clean.slice(0, firstList)).split('\n').map(s => s.trim())
      .filter(Boolean)
      .filter(l => !ING_INLINE.test(normalizeTitle(l)) && !STEP_INLINE.test(normalizeTitle(l)) && !isJunkLine(l))
      .join(' ').replace(/\s+/g, ' ').trim();
  }
  return { intro, ingredients, steps, hasBoth: ingredients.length > 0 && steps.length > 0 };
}

function parseContent(rawHtml) {
  // Reliable path: clean <ul>=ingredients + <ol>=steps markup
  const listed = parseListBased(rawHtml);
  if (listed.hasBoth) {
    const { steps, notes } = splitOutTips(listed.steps);
    return { intro: listed.intro, ingredients: listed.ingredients, steps, notes };
  }

  const text = stripHtml(stripCodeFences(rawHtml));
  // Keep blank lines as boundary markers; glue-split non-blank lines
  const lines = [];
  for (const rl of text.split('\n').map(s => s.trim())) {
    if (!rl) { lines.push(''); continue; }
    const parts = blockToLines(rl);
    if (parts.length) lines.push(...parts); else lines.push('');
  }

  let intro = [];
  let ingredients = [];
  let steps = [];
  let mode = 'intro';
  let blankSinceIng = false;

  for (const line of lines) {
    if (line === '') { if (mode === 'ingredients') blankSinceIng = true; continue; }
    const t = normalizeTitle(line);

    if (ING_INLINE.test(t) && line.length < 50) { mode = 'ingredients'; continue; }
    if (STEP_INLINE.test(t) && line.length < 50) { mode = 'steps'; continue; }
    if ((STEP_NUM.test(line) || STEP_WORD.test(line)) && mode !== 'intro') {
      if (mode === 'steps' || numberedIsStep(line)) mode = 'steps';
    }

    // Leaving intro: an instruction sentence starts steps; otherwise a quantity
    // line starts the ingredient list. Instruction wins (handles "Добавьте 60 г").
    if (mode === 'intro') {
      if (isInstructionSentence(line) && !startsWithQty(line)) mode = 'steps';
      else if (hasQty(line)) mode = 'ingredients';
    }
    // Within ingredients: an instruction sentence with NO quantity ends the
    // ingredient list and starts the steps. (A line with a quantity — even one
    // containing a verb in a parenthetical — stays an ingredient.)
    if (mode === 'ingredients' && !hasQty(line) && isInstructionSentence(line)) mode = 'steps';
    // A blank line after ingredients, followed by a quantity-free instruction,
    // starts the steps (a quantity line stays an ingredient).
    if (mode === 'ingredients' && blankSinceIng && !hasQty(line) && isInstructionSentence(line)) { mode = 'steps'; }
    blankSinceIng = false;
    // A long sentence with no quantity (once we have ingredients) is a step
    if (mode === 'ingredients' && !hasQty(line) &&
        ingredients.length >= 2 && line.split(/\s+/).length >= 6) mode = 'steps';

    if (mode === 'intro') intro.push(line);
    // Strip a leading list marker only — a bullet (-•▢*) or a numbered-list
    // prefix ("1." / "2)"). Must NOT eat a quantity glued to a dash ("-15 г"):
    // strip the bullet but keep the number.
    else if (mode === 'ingredients') ingredients.push(line.replace(/^(?:[\-•▢*]\s*|\d+[.\)]\s+)/, ''));
    else steps.push(line);
  }

  // Fallback: numbered-line split if nothing detected
  if (ingredients.length === 0 && steps.length === 0) {
    const ingLines = [], stepLines = [];
    let foundStep = false;
    const flat = lines.filter(Boolean);
    for (const line of flat.slice(intro.length > 0 ? 1 : 0)) {
      if (!foundStep && (STEP_NUM.test(line) || STEP_WORD.test(line))) foundStep = true;
      if (foundStep) stepLines.push(line);
      else ingLines.push(line.replace(/^[\-•▢*]\s*/, ''));
    }
    if (ingLines.length) ingredients = ingLines;
    if (stepLines.length) steps = stepLines;
    if (foundStep) intro = intro.slice(0, 1);
  }

  const { steps: cleanSteps, notes } = splitOutTips(steps);
  return { intro: intro.join(' ').trim(), ingredients, steps: cleanSteps, notes };
}

// Pull a trailing "tips / tricks" section out of a step list into a note block,
// so it isn't mis-rendered as a sub-step of the last numbered step.
const TIP_INLINE = /^(совет|важно|примечани\S*|хитрост\S*|на заметку|рекомендац\S*)\s*:\s*(.+)/i;
// Closing pleasantries duplicate the template footer — drop them from steps
const CLOSING = /^(приятн\S*\s+аппетит|bon\s+app|наслажд)/i;
function splitOutTips(steps) {
  const notes = [];
  let body = steps.filter(l => !CLOSING.test(l));

  // 1) A "tips section" header followed by tip lines
  const idx = body.findIndex(isTipsHeader);
  if (idx !== -1) {
    const label = normalizeTitle(body[idx]).replace(/[:\s]+$/, '');
    const items = body.slice(idx + 1).filter(l => l.length > 2);
    if (items.length) notes.push({ label, items });
    body = body.slice(0, idx);
  }

  // 2) Trailing single tips lines ("Совет: …", "Важно: …") at the very end
  const tail = [];
  while (body.length) {
    const m = body[body.length - 1].match(TIP_INLINE);
    if (!m) break;
    const label = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    tail.unshift({ label, text: m[2] });
    body = body.slice(0, -1);
  }
  notes.push(...tail);

  return { steps: body, notes };
}

// ---------- Step grouping ----------

function groupStepLines(lines) {
  const groups = [];
  let current = null;
  const NOTE_RE = /^(важно|примечани|note|tip|совет|внимани)[\s:]/i;
  const STEP_NUM_RE = /^\d+[\.\)]\s+/;

  for (const line of lines) {
    const isNumbered = STEP_NUM_RE.test(line);
    const isNote = NOTE_RE.test(line);
    if (isNumbered) {
      if (current) groups.push(current);
      current = { main: line.replace(STEP_NUM_RE, ''), subs: [], notes: [] };
    } else if (!current) {
      groups.push({ main: line, subs: [], notes: [] });
    } else if (isNote) {
      current.notes.push(line);
    } else {
      current.subs.push(line);
    }
  }
  if (current) groups.push(current);
  return groups;
}

function renderStepGroup(g) {
  let html = g.main.replace(/^шаг\s+\d+\s*[—\-:]*\s*/i, '');
  // Bold a short leading label ending with a colon ("Нагрев:", "Подготовка муки:")
  html = html.replace(/^([^:<]{2,40}):\s+/, '<strong>$1:</strong> ');
  if (g.subs.length > 0) {
    html += '<ul style="margin: 4px 0 2px 16px; padding: 0; list-style: disc;">' +
      g.subs.map(s => `<li style="padding: 1px 0; color: #555;">${s}</li>`).join('') +
      '</ul>';
  }
  if (g.notes.length > 0) {
    html += g.notes.map(n =>
      `<div style="margin-top: 5px; padding: 5px 10px; background: #fff8e6; border-left: 3px solid #f0a030; font-size: 0.9em; border-radius: 0 4px 4px 0;">⚠️ ${n}</div>`
    ).join('');
  }
  return `    <li style="padding: 7px 0; border-bottom: 1px solid #e0f0e0; line-height: 1.7;">${html}</li>`;
}

// ---------- HTML builders ----------

function imgBlockOf(images) {
  return images.length > 0 ? `<div style="text-align: center; margin: 16px 0;">${images[0]}</div>` : '';
}
function introHtmlOf(intro) {
  return intro
    ? `<p style="border-left: 4px solid #c0392b; padding: 10px 16px; font-size: 1.05em; color: #444; font-style: italic; margin: 20px 0; background: #fffafa; border-radius: 0 8px 8px 0;">${intro}</p>`
    : '';
}
function notesHtmlOf(notes) {
  if (!notes || notes.length === 0) return '';
  return notes.map(n => {
    const body = (n.items && n.items.length)
      ? `<ul style="margin: 8px 0 0; padding-left: 18px;">` +
        n.items.map(it => `<li style="padding: 2px 0;">${it}</li>`).join('') + `</ul>`
      : (n.text ? ` ${n.text}` : '');
    return `<div style="margin: 14px 0; padding: 12px 16px; background: #fff8e6; border-left: 4px solid #f0a030; border-radius: 0 8px 8px 0;"><strong>💡 ${n.label || 'Совет'}:</strong>${body}</div>`;
  }).join('\n');
}

const ING_CARD_OPEN = `<div style="background: #fff8f5; border-radius: 12px; padding: 20px 24px; margin: 24px 0; border: 1px solid #f0d0c0;">
  <h3 style="margin: 0 0 14px 0; color: #c0392b; font-size: 1.1em; letter-spacing: 0.5px;">🥗 Ингредиенты</h3>`;
const STEP_CARD_OPEN = `<div style="background: #f5fbf5; border-radius: 12px; padding: 20px 24px; margin: 24px 0; border: 1px solid #c0e8c0;">
  <h3 style="margin: 0 0 14px 0; color: #27ae60; font-size: 1.1em; letter-spacing: 0.5px;">👩‍🍳 Приготовление</h3>`;

function ingListHtml(items) {
  return `  <ul style="list-style: none; padding: 0; margin: 0;">\n` +
    items.filter(l => l.length > 1)
      .map(l => `    <li style="padding: 4px 0; border-bottom: 1px solid #f0dfd8; line-height: 1.5;">${l}</li>`)
      .join('\n') +
    `\n  </ul>`;
}
function sectionLabelHtml(label) {
  return `  <div style="margin: 16px 0 8px; color: #b05030; font-size: 1em; font-weight: bold;">${label}</div>`;
}
function groupLabelHtml(label) {
  return `  <div style="margin: 12px 0 4px; color: #a05040; font-size: 0.85em; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;">— ${label} —</div>`;
}
function stepGroupLabelHtml(label) {
  return `  <div style="margin: 12px 0 4px; color: #2a7a4a; font-size: 0.85em; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;">— ${label} —</div>`;
}

function buildStructuredHtml(images, parsed, originalContent) {
  // Ingredients card
  let ingInner = '';
  const multiIng = parsed.ingSections.length > 1;
  for (const sec of parsed.ingSections) {
    if (multiIng && sec.label) ingInner += sectionLabelHtml(sec.label) + '\n';
    for (const g of sec.groups) {
      if (g.sublabel) ingInner += groupLabelHtml(g.sublabel) + '\n';
      if (g.items.length) ingInner += ingListHtml(g.items) + '\n';
    }
  }

  // Steps card — number continuously within each section, sub-groups as phase labels
  let stepInner = '';
  const multiStep = parsed.stepSections.length > 1;
  for (const sec of parsed.stepSections) {
    if (multiStep && sec.label) stepInner += sectionLabelHtml(sec.label) + '\n';
    for (const g of sec.groups) {
      if (g.sublabel) stepInner += stepGroupLabelHtml(g.sublabel) + '\n';
      const grouped = groupStepLines(g.items.filter(l => l.length > 3));
      if (grouped.length) {
        stepInner += `  <ol style="padding-left: 22px; margin: 0;">\n` +
          grouped.map(renderStepGroup).join('\n') + `\n  </ol>\n`;
      }
    }
  }

  return wrap(images, parsed.intro, ingInner, stepInner, parsed.notes, originalContent);
}

function buildHtml(images, intro, ingredients, steps, notes, originalContent) {
  const ingInner = ingredients.length ? ingListHtml(ingredients) : '';
  const grouped = groupStepLines(steps.filter(l => l.length > 3));
  const stepInner = grouped.length
    ? `  <ol style="padding-left: 22px; margin: 0;">\n` + grouped.map(renderStepGroup).join('\n') + `\n  </ol>`
    : '';
  return wrap(images, intro, ingInner, stepInner, notes, originalContent);
}

function wrap(images, intro, ingInner, stepInner, notes, originalContent) {
  const ingCard = `${ING_CARD_OPEN}\n${ingInner || '  <p style="color:#aaa;">см. оригинальный рецепт ниже</p>'}\n</div>`;
  const stepCard = `${STEP_CARD_OPEN}\n${stepInner || '  <p style="color:#aaa;">см. оригинальный рецепт ниже</p>'}\n${notesHtmlOf(notes)}\n</div>`;

  return `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 750px; margin: 0 auto; color: #333; line-height: 1.7;">

${imgBlockOf(images)}

${introHtmlOf(intro)}

${ingCard}

${stepCard}

<p style="font-style: italic; text-align: center; color: #bbb; font-size: 0.9em; margin: 30px 0 10px;">✨ Приятного аппетита!</p>

</div>

<hr style="margin: 40px 0; border: none; border-top: 3px dashed #ccc;" />
<p style="color: #aaa; font-size: 0.85em; text-align: center;">— оригинальный текст (черновик) —</p>
${stripCodeFences(originalContent)}`;
}

// ---------- Misc ----------

function extractImages(html) {
  const imgs = [];
  const linkedImgs = html.match(/<a[^>]*>\s*<img[^>]+>\s*<\/a>/gi) || [];
  imgs.push(...linkedImgs);
  const bareImgs = html.replace(/<a[^>]*>\s*<img[^>]+>\s*<\/a>/gi, '').match(/<img[^>]+>/gi) || [];
  imgs.push(...bareImgs);
  return imgs;
}

function isAlreadyFormatted(content) {
  return content.includes('оригинальный текст (черновик)') ||
    content.includes('border-top: 3px dashed');
}

// Hand-curated ingredient/step lists for the few posts too messy to auto-parse
// (metadata noise, glued multi-column tables, ingredients without quantities).
let OVERRIDES = {};
try { OVERRIDES = JSON.parse(readFileSync(join(DIR, 'manual_overrides.json'), 'utf8')); } catch {}

// Format one post's raw content into styled HTML. Returns { html, mode }.
function formatPost(rawContent, title, postId) {
  const original = getOriginal(rawContent);     // pristine source (handles re-runs)
  const images = extractImages(original);

  const ov = postId && OVERRIDES[postId];
  if (ov) {
    return {
      html: buildHtml(images, ov.intro || '', ov.ingredients || [], ov.steps || [], ov.notes || [], original),
      mode: `manual override (ing:${(ov.ingredients||[]).length}, step:${(ov.steps||[]).length})`,
    };
  }

  const structured = parseStructuredHTML(original, title);
  if (structured.hasStructure) {
    return {
      html: buildStructuredHtml(images, structured, original),
      mode: `structured (ing:${structured.ingSections.length}, step:${structured.stepSections.length}, notes:${structured.notes.length})`,
    };
  }
  const { intro, ingredients, steps, notes } = parseContent(original);
  return {
    html: buildHtml(images, intro, ingredients, steps, notes || [], original),
    mode: `plain (ing:${ingredients.length}, step:${steps.length}, notes:${(notes||[]).length})`,
  };
}

const BACKUP_FILE = join(DIR, 'posts_backup.json');
const HELP = `
Blogger recipe formatter — styles posts into ingredient/step cards,
keeping the original text below a separator as a reviewable draft.

Usage:  node blogger_format.mjs [options]

  (no options)   Fetch live posts, format only NOT-yet-formatted ones
  --all          Re-format every post (recovers original from drafts)
  --id=ID        Format a single post by id
  --ids=A,B,C    Format specific posts
  --dry          Preview only — no changes written (saves preview_<id>.html
                 when combined with --id/--ids)
  --backup       Use cached posts_backup.json instead of fetching live
  --help         Show this help
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(HELP); return; }

  const dryRun = args.includes('--dry');
  const all = args.includes('--all');
  const useBackup = args.includes('--backup');
  const onlyId = args.find(a => a.startsWith('--id='))?.split('=')[1] || null;
  const onlyIds = args.find(a => a.startsWith('--ids='))?.split('=')[1]?.split(',') || null;

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}${all ? ' (re-format all)' : ''}`);
  const token = await getAccessToken();
  console.log('Token OK');

  let posts;
  if (useBackup) {
    posts = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));
    console.log(`Loaded ${posts.length} posts from backup`);
  } else {
    posts = await fetchAllPosts(token);
    console.log(`Fetched ${posts.length} live posts`);
    // Keep a pristine backup of any post not yet formatted
    try {
      const existing = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));
      const known = new Set(existing.map(p => p.id));
      const fresh = posts.filter(p => !known.has(p.id) && !isAlreadyFormatted(p.content));
      if (fresh.length) {
        writeFileSync(BACKUP_FILE, JSON.stringify(existing.concat(fresh), null, 2));
        console.log(`Backup: added ${fresh.length} new pristine post(s)`);
      }
    } catch {
      writeFileSync(BACKUP_FILE, JSON.stringify(posts, null, 2));
      console.log('Backup: created posts_backup.json');
    }
  }

  const errors = [];
  let processed = 0, skipped = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];

    if (onlyId && post.id !== onlyId) continue;
    if (onlyIds && !onlyIds.includes(post.id)) continue;
    // Posts handled manually elsewhere — never auto-touch (still reachable via --id)
    if (!onlyId && !onlyIds && DONE_IDS.includes(post.id)) { skipped++; continue; }
    // Default run: only touch posts that aren't styled yet
    if (!onlyId && !onlyIds && !all && isAlreadyFormatted(post.content)) { skipped++; continue; }

    try {
      const { html, mode } = formatPost(post.content, post.title, post.id);
      console.log(`[${i+1}/${posts.length}] "${post.title}" — ${mode}`);

      if (!dryRun) {
        await updatePost(token, post.id, post.title, html);
        console.log(`  ✓ Updated`);
        await new Promise(r => setTimeout(r, 700));
      } else if (onlyIds || onlyId) {
        writeFileSync(join(DIR, `preview_${post.id}.html`), html);
        console.log(`  → preview saved`);
      }
      processed++;
    } catch (e) {
      console.error(`  ✗ Error on "${post.title}": ${e.message}`);
      errors.push({ id: post.id, title: post.title, error: e.message });
    }
  }

  console.log(`\nDone. Processed: ${processed}, Skipped (already formatted): ${skipped}, Errors: ${errors.length}`);
  if (errors.length) console.log('Errors:', JSON.stringify(errors, null, 2));
}

// Run only when invoked directly (so the parser can be imported for diagnostics)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(console.error);
}

export { formatPost, parseContent, parseStructuredHTML, getOriginal, OVERRIDES, isJunkLine };
