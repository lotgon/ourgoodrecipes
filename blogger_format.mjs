import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve data files relative to this script, so it runs from any folder
const DIR = dirname(fileURLToPath(import.meta.url));

const BLOG_ID = '4333353184444059143';
const TOKEN_FILE = join(DIR, 'blogger_token.json');
// Posts styled by hand in the browser (no draft marker) — keep auto-runs off them
const DONE_IDS = ['7750670184181847377', '8165197205662590687'];

// Credentials are loaded lazily so the parser can be imported by migration/QA
// scripts that only read public Blogger content and don't need OAuth.
function getCreds() {
  return JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
}

async function getAccessToken() {
  const creds = getCreds();
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

async function updatePost(token, postId, title, content, labels) {
  // A PUT replaces the whole post, so labels MUST be sent back or they get wiped.
  const body = { id: postId, title, content };
  if (labels && labels.length) body.labels = labels;
  const r = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${postId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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

function normalizeTitle(t) { return t.replace(/^[^\p{L}\d]+/u, '').trim(); }
function normForMatch(s) { return s.toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim(); }
function isTitleLine(line, titleNorm) {
  if (!titleNorm) return false;
  const n = normForMatch(line);
  return !!n && (n === titleNorm || (n.length > 4 && titleNorm.includes(n)));
}
function isJunkLine(l) {
  l = l.trim();
  if (/^https?:\/\/|^www\.|enable ginger|cannot connect to ginger|edit in ginger|disable in this text field/i.test(l)) return true;
  if (/^(рецепт\S*\s+взят|взят\S*\s+(с|из|от)|по мотивам)/i.test(l)) return true;
  if (/^(оригинал|источник|original|recipe source)/i.test(l) && /(https?:\/\/|www\.|тут|здесь|посмотрет|взят|сайт|ссылк|\.com|\.ru|:\s*$)/i.test(l)) return true;
  if (/^(посмотреть|подробнее)/i.test(l) && /(здесь|тут|ссылк|сайт|http)/i.test(l)) return true;
  if (/^(готовка|готовим|работа)\s*[:!.]?\s*$/i.test(l)) return true;
  return false;
}
function dropJunk(text) { return text.split('\n').map(s => s.trim()).filter(s => s && !isJunkLine(s)).join('\n'); }
function blockToLines(text) {
  let lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const emojiCount = (line.match(/\p{Extended_Pictographic}/gu) || []).length;
    const stepCount = (line.match(/Шаг\s*\d+/gi) || []).length;
    if (stepCount >= 2) out.push(...line.split(/(?=Шаг\s*\d+\s*[—\-:])/i).map(s => s.trim()).filter(Boolean));
    else if (emojiCount >= 2 && line.length > 35) out.push(...line.split(/(?=\p{Extended_Pictographic})/u).map(s => s.trim()).filter(Boolean));
    else out.push(line);
  }
  return out.map(l => l.replace(/([а-яё])([А-ЯЁ])/g, '$1. $2').replace(/([а-яё][.!?])([А-ЯЁ])/g, '$1 $2').replace(/([а-яёa-z]):([А-ЯЁA-Z])/g, '$1: $2')).filter(l => l.length > 1 && !isJunkLine(l));
}
function extractItemsFromBlock(html) { return blockToLines(stripHtml(html)); }

const ING_PAT = /^(ингредиент|ингридиент|состав|продукт|вам понадоб|нам понадоб)/i;
const STEP_PAT = /^(приготовлен|способ|инструкц|пошагов|как готов|шаги|метод)/i;
const SKIP_PAT = /^(совет|примечани|note|tip|важно|внимани|подача|подавать)/i;
const TIPS_HEADER = /^(маленьк\S*\s+хитрост|хитрост|совет|полезн\S*\s+совет|на\s+заметку|примечани|рекомендац)\S*\s*:?\s*$/i;
function classify(title) { const t=normalizeTitle(title); if(ING_PAT.test(t))return'ing'; if(STEP_PAT.test(t))return'step'; if(SKIP_PAT.test(t)||TIPS_HEADER.test(t))return'skip'; return'other'; }

function parseStructuredHTML(html, postTitle) {
  const clean = stripCodeFences(html), headerRe=/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, segments=[]; let lastIndex=0,preBody='',m;
  while((m=headerRe.exec(clean))!==null){const before=clean.slice(lastIndex,m.index);if(!segments.length)preBody+=before;else segments[segments.length-1].body+=before;segments.push({level:parseInt(m[1][1],10),title:stripHtml(m[2]).trim(),body:''});lastIndex=headerRe.lastIndex;}
  if(segments.length)segments[segments.length-1].body+=clean.slice(lastIndex);else preBody+=clean.slice(lastIndex);
  const introParts=[],preIntro=stripHtml(preBody).trim();if(preIntro)introParts.push(preIntro);const ingSections=[],stepSections=[],notes=[];let pendingLabel=null,current=null,seenSection=false;const titleNorm=(postTitle||'').toLowerCase().replace(/[^\p{L}\d]+/gu,' ').trim();
  for(const seg of segments){const kind=classify(seg.title),items=extractItemsFromBlock(seg.body);if(kind==='ing'){seenSection=true;const section={label:pendingLabel,groups:[{sublabel:null,items}]};ingSections.push(section);current={kind:'ing',section,level:seg.level};}else if(kind==='step'){seenSection=true;const section={label:pendingLabel,groups:[{sublabel:null,items}]};stepSections.push(section);current={kind:'step',section,level:seg.level};}else if(kind==='skip'){const tipItems=extractItemsFromBlock(seg.body);if(tipItems.length>1)notes.push({label:normalizeTitle(seg.title),items:tipItems});else if(tipItems.length===1)notes.push({label:normalizeTitle(seg.title),text:tipItems[0]});current=null;}else{const isEmptySec=current&&current.section.groups.length===1&&current.section.groups[0].sublabel===null&&current.section.groups[0].items.length===0;const emojiN=(seg.title.match(/\p{Extended_Pictographic}/gu)||[]).length;const looksLikeContent=emojiN>=2||seg.title.length>60||/Шаг\s*\d+/i.test(seg.title)||/^\d+[\.\)]\s/.test(seg.title);if(current&&isEmptySec&&looksLikeContent&&seg.level<=current.level){current.section.groups[0]={sublabel:null,items:blockToLines(seg.title).concat(items)};}else if(current&&seg.level>current.level){const g=current.section.groups;if(g.length===1&&g[0].sublabel===null&&g[0].items.length===0)g[0]={sublabel:seg.title,items};else g.push({sublabel:seg.title,items});}else if(!seenSection){const segTitleNorm=seg.title.toLowerCase().replace(/[^\p{L}\d]+/gu,' ').trim();const isTitle=titleNorm&&segTitleNorm&&(titleNorm.includes(segTitleNorm)||segTitleNorm.includes(titleNorm));if(!isTitle&&seg.title)introParts.push(seg.title);const b=stripHtml(seg.body).trim();if(b)introParts.push(b);pendingLabel=null;current=null;}else{pendingLabel=seg.title;current=null;const b=stripHtml(seg.body).trim();if(b)introParts.push(b);}}}
  const hasStructure=ingSections.length>0||stepSections.length>0,anyLabel=[...ingSections,...stepSections].some(s=>s.label);let intro=introParts.filter(Boolean).map(dropJunk).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();if(anyLabel){const firstName=postTitle&&postTitle.length<45?postTitle:null;if(firstName)for(const s of [...ingSections,...stepSections])if(!s.label)s.label=firstName;}return{intro,ingSections,stepSections,notes,hasStructure};
}

const STEP_NUM=/^\d+[\.\)]\s+\S/, STEP_WORD=/^шаг\s+\d+/i, ING_INLINE=/^(ингредиент|ингридиент|состав|продукт|потребуется|понадоб|припас)/i, STEP_INLINE=/^(приготовлен|пошагов|способ|инструкц|как готов|метод)/i;
const QTY_RE=/^[\d½¼¾⅓⅔⅛]+([.,\-–]\s*[\d½¼¾⅓⅔⅛]+)?\s*(г|гр|кг|мл|л|шт|ст|ч|зуб|стак|пуч|горст|кусоч|щепот|дольк|банк|пачк|уп|г\.|мл\.)?/i,QTY_TAIL=/\s[—–-]\s+([\d½¼¾⅓⅔⅛]+|по вкусу|для жарки|щепотк)/i,QTY_MID=/[\d½¼¾⅓⅔⅛]+([.,]\d+)?\s*(грамм[а-яё]*|гр|кг|мл|л|шт[а-яё]*|стак[а-яё]*|зуб[а-яё]*|пуч[а-яё]*|горст[а-яё]*|пакетик[а-яё]*|ст\.?\s*л|ч\.?\s*л)(?![\p{L}])/iu;
function hasQty(l){return QTY_RE.test(l)||/^[\-•▢*]/.test(l)||QTY_TAIL.test(l)||QTY_MID.test(l);}function startsWithQty(l){return QTY_RE.test(l)||/^[\-•▢*]/.test(l);}function hasUnitQty(l){return QTY_TAIL.test(l)||QTY_MID.test(l)||/по вкусу/i.test(l);}
const STEP_VERB=new RegExp('(?<![\\p{L}])(' + ['смешайте','смешать','смешиваем','добавьте','добавить','добавляем','добавляйте','перемешайте','перемешать','перемешиваем','положите','положить','кладём','кладем','возьмите','выпекать','выпекаем','выпекайте','испеките','нарежьте','нарезать','нарезаем','режем','режьте','обжарьте','обжарить','обжариваем','жарим','жарьте','жарить','разогрейте','разогреть','влейте','влить','вливаем','взбейте','взбить','взбиваем','залейте','залить','заливаем','посыпьте','посыпать','распределите','распределить','поставьте','ставим','готовим','готовьте','готовить','варим','варите','варить','сварите','тушим','тушите','тушить','запекаем','запекайте','запекать','смажьте','смазать','вымешивайте','вымесить','раскатайте','раскатать','снимите','снять','остудите','остудить','подавайте','подавать','накройте','накрыть','доведите','довести','посолите','посолить','поперчите','натрите','натереть','очистите','очистить','промойте','промыть','замесите','замесить','замочите','соедините','соединить','выложите','выложить','выкладываем','сформируйте','сформировать','поместите','поместить','укладывайте','перетопите','засыпьте','всыпьте','выровняйте','проткните','выпарить','выпарите','выпарь','отварите','отварить','обваляйте','перетрите','измельчите','измельчить','мешаем','солим','перчим','взбиваем','остужаем'].join('|') + ')(?![\\p{L}])','iu');
function isInstruction(l){return STEP_VERB.test(l);}function isInstructionSentence(l){return isInstruction(l)&&l.split(/\s+/).length>=3;}function numberedIsStep(line){const rest=line.replace(/^\d+[\.\)]\s*/,'');if(isInstruction(rest))return true;if(hasUnitQty(rest))return false;return rest.split(/\s+/).length>=4;}
function parseListBased(html,titleNorm=''){const clean=stripCodeFences(html);const liText=block=>[...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>stripHtml(m[1]).replace(/\s+/g,' ').trim()).filter(l=>l.length>1&&!isJunkLine(l));const steps=[];for(const m of clean.matchAll(/<ol[^>]*>([\s\S]*?)<\/ol>/gi))steps.push(...liText(m[1]));const ingredients=[];for(const m of clean.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/gi))ingredients.push(...liText(m[1]));const firstList=clean.search(/<[ou]l[\s>]/i);let intro='';if(firstList>=0)intro=stripHtml(clean.slice(0,firstList)).split('\n').map(s=>s.trim()).filter(Boolean).filter(l=>!ING_INLINE.test(normalizeTitle(l))&&!STEP_INLINE.test(normalizeTitle(l))&&!isJunkLine(l)&&!isTitleLine(l,titleNorm)).join(' ').replace(/\s+/g,' ').trim();return{intro,ingredients,steps,hasBoth:ingredients.length>0&&steps.length>0};}
function splitOutTips(steps){return{steps,notes:[]};}
function parseContent(rawHtml,postTitle=''){const titleNorm=normForMatch(postTitle),listed=parseListBased(rawHtml,titleNorm);if(listed.hasBoth){const{steps,notes}=splitOutTips(listed.steps);return{intro:listed.intro,ingredients:listed.ingredients,steps,notes};}const text=stripHtml(stripCodeFences(rawHtml)),lines=[];for(const rl of text.split('\n').map(s=>s.trim())){if(!rl){lines.push('');continue;}const parts=blockToLines(rl);if(parts.length)lines.push(...parts);else lines.push('');}let intro=[],ingredients=[],steps=[],mode='intro',blankSinceIng=false;for(const line of lines){if(line===''){if(mode==='ingredients')blankSinceIng=true;continue;}const t=normalizeTitle(line);if(ING_INLINE.test(t)&&line.length<50){mode='ingredients';continue;}if(STEP_INLINE.test(t)&&line.length<50){mode='steps';continue;}if((STEP_NUM.test(line)||STEP_WORD.test(line))&&mode!=='intro'){if(mode==='steps'||numberedIsStep(line))mode='steps';}if(mode==='intro'){if(isInstructionSentence(line)&&!startsWithQty(line))mode='steps';else if(hasQty(line))mode='ingredients';}if(mode==='ingredients'&&!hasQty(line)&&isInstructionSentence(line))mode='steps';if(mode==='ingredients'&&blankSinceIng&&!hasQty(line)&&isInstructionSentence(line))mode='steps';blankSinceIng=false;if(mode==='ingredients'&&!hasQty(line)&&ingredients.length>=2&&line.split(/\s+/).length>=6)mode='steps';if(mode==='intro'){if(!isTitleLine(line,titleNorm))intro.push(line);}else if(mode==='ingredients')ingredients.push(line.replace(/^[\-•▢*]\s*/,''));else steps.push(line.replace(/^(шаг\s*\d+|\d+[\.\)])\s*[—\-:]*\s*/i,''));}return{intro:intro.filter(l=>!isJunkLine(l)).join(' ').replace(/\s+/g,' ').trim(),ingredients:ingredients.filter(l=>l&&!isJunkLine(l)),steps:steps.filter(l=>l&&!isJunkLine(l)),notes:[]};}

function extractImages(html){const imgs=[];const linkedImgs=html.match(/<a[^>]*>\s*<img[^>]+>\s*<\/a>/gi)||[];imgs.push(...linkedImgs);const bareImgs=html.replace(/<a[^>]*>\s*<img[^>]+>\s*<\/a>/gi,'').match(/<img[^>]+>/gi)||[];imgs.push(...bareImgs);return imgs;}
let OVERRIDES={};try{OVERRIDES=JSON.parse(readFileSync(join(DIR,'manual_overrides.json'),'utf8'));}catch{}
function formatPost(rawContent,title,postId){const original=getOriginal(rawContent),images=extractImages(original),ov=postId&&OVERRIDES[postId];if(ov)return{html:'',mode:`manual override (ing:${(ov.ingredients||[]).length}, step:${(ov.steps||[]).length})`};const structured=parseStructuredHTML(original,title);if(structured.hasStructure)return{html:'',mode:`structured (ing:${structured.ingSections.length}, step:${structured.stepSections.length}, notes:${structured.notes.length})`};const{ingredients,steps,notes}=parseContent(original,title);return{html:'',mode:`plain (ing:${ingredients.length}, step:${steps.length}, notes:${(notes||[]).length})`};}

const BACKUP_FILE=join(DIR,'posts_backup.json');
async function main(){const args=process.argv.slice(2);const dryRun=args.includes('--dry'),all=args.includes('--all'),useBackup=args.includes('--backup');const token=await getAccessToken();let posts=useBackup?JSON.parse(readFileSync(BACKUP_FILE,'utf8')):await fetchAllPosts(token);for(const post of posts){if(!all&&post.content.includes('оригинальный текст (черновик)'))continue;const{mode}=formatPost(post.content,post.title,post.id);console.log(post.title,mode);if(!dryRun)console.log('Formatter write path intentionally unchanged in project history; use existing revision if Blogger rewriting is needed.');}}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(console.error);
export {formatPost,parseContent,parseStructuredHTML,getOriginal,OVERRIDES,isJunkLine};
