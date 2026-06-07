import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const BLOG_ID = '4333353184444059143';
const creds = JSON.parse(readFileSync(join(DIR, 'blogger_token.json'), 'utf8'));

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

const token = await getAccessToken();
const auth = { Authorization: `Bearer ${token}` };

// 1) blog description
const blog = await (await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}`, { headers: auth })).json();
const description = (blog.description || '').trim();
console.log('DESCRIPTION:', JSON.stringify(description));

// 2) existing pages
const pages = await (await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/pages`, { headers: auth })).json();
const existing = (pages.items || []).find(p => (p.title || '').trim().toLowerCase() === 'о сайте');
if (existing) {
  console.log('ALREADY EXISTS:', existing.url, existing.id);
  process.exit(0);
}

// 3) create page
const content = `<p style="font-size:1.05em;line-height:1.6;color:#5a4742;max-width:680px;margin:0 auto;">${description}</p>`;
const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/pages`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'О сайте', content }),
});
const created = await res.json();
if (created.error) throw new Error('Create failed: ' + JSON.stringify(created.error));
console.log('CREATED URL:', created.url);
console.log('CREATED ID:', created.id);
console.log('STATUS:', created.status || '(live)');
