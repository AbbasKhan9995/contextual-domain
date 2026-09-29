// Client catalog: the inventory as a client may see it. Publisher domains,
// names, costs, contacts and notes never leave this module. The exported
// file carries only a reference code per site (GP-7F3A2C), so a client can
// pick sites and send the codes back without being able to buy direct.

import { createHash } from 'node:crypto'

/** Stable, non-reversible reference code for a site. */
export const refCode = (siteId) => `GP-${createHash('sha1').update(`gpp:${siteId}`).digest('hex').slice(0, 6).toUpperCase()}`

const TRAFFIC_BUCKETS = [[1e7, '10M+'], [1e6, '1M – 10M'], [5e5, '500K – 1M'], [1e5, '100K – 500K'], [5e4, '50K – 100K'], [1e4, '10K – 50K'], [1e3, '1K – 10K'], [0, 'Under 1K']]
const bucketOf = (t) => (t == null ? null : TRAFFIC_BUCKETS.find(([min]) => t >= min))
export const trafficBucket = (t) => bucketOf(t)?.[1] ?? null

/** Public ending only: "blog.outrightcrm.com" → ".com", "news.co.uk" → ".co.uk".
 *  Taking everything after the first dot leaked the real domain of any
 *  site listed on a subdomain. */
export function suffixOf(domain) {
  const parts = String(domain).toLowerCase().split('.')
  const two = parts.slice(-2).join('.')
  return parts.length > 2 && /^(co|com|org|net|ac|gov|edu|or|ne)\.[a-z]{2}$/.test(two) ? `.${two}` : `.${parts.at(-1)}`
}

/** "forbes.com" → "fo•••s.com" (partial) or "Publisher · .com" (hidden).
 *  Partial masks the registrable name and drops any subdomain. */
export function maskDomain(domain, mode) {
  const tld = suffixOf(domain)
  const name = domain.slice(0, -tld.length).split('.').at(-1) || '?'
  if (mode === 'partial') return `${name.slice(0, 2)}${'•'.repeat(Math.max(3, name.length - 3))}${name.slice(-1)}${tld}`
  return `Publisher · ${tld}`
}

export const DEFAULT_CATALOG = {
  name: 'Guest post catalog',
  clientId: '',
  intro: 'Hand-checked publishers with real traffic. Tick the sites you want and send us the list; we confirm availability and handle writing, placement and reporting.',
  contactEmail: '',
  criteria: { niche: '', minDr: 30, maxDr: '', minTraffic: '1K', follow: 'dofollow', maxCost: '', excludeFlagged: true, liveOnly: false },
  pricing: { markup: 2, minMargin: 50, round: 10 },
  display: { mask: 'hidden', traffic: 'bucket', showDa: true },
}

/** Client price for one site: the markup, but never less than the minimum
 *  margin, rounded up so prices look deliberate ($190, not $187.40). */
export function sellPrice(cost, pricing = {}) {
  if (!(cost > 0)) return null
  const markup = Number(pricing.markup) || 1
  const minMargin = Number(pricing.minMargin) || 0
  const step = Number(pricing.round) || 1
  return Math.ceil(Math.max(cost * markup, cost + minMargin) / step) * step
}

/** One client-safe row. Only these fields are ever exported. */
export function clientRow(s, catalog) {
  const d = catalog.display || {}
  return {
    code: refCode(s.id),
    publisher: maskDomain(s.url, d.mask),
    tld: suffixOf(s.url),
    niches: s.niches.filter((n) => !/coming soon/i.test(n)),
    country: s.country || null,
    language: s.language || null,
    dr: s.dr ?? null,
    da: d.showDa === false ? null : s.da ?? null,
    traffic: d.traffic === 'exact' ? s.traffic ?? null : null,
    trafficBand: trafficBucket(s.traffic),
    // Sorting key: in range mode it's the band floor, never the exact figure.
    trafficSort: s.traffic == null ? -1 : d.traffic === 'exact' ? s.traffic : bucketOf(s.traffic)[0],
    follow: s.follow || null,
    maxLinks: s.maxLinks ?? null,
    sponsored: !!s.sponsored,
    tatDays: s.tatDays ?? null,
    price: sellPrice(s.priceGuestPost, catalog.pricing),
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** Self-contained HTML catalog: no external requests, works from an email
 *  attachment or a Drive preview. Data is embedded as JSON. */
export function renderCatalogHtml(catalog, rows) {
  const data = JSON.stringify({ name: catalog.name, intro: catalog.intro, email: catalog.contactEmail, generated: new Date().toISOString().slice(0, 10), showDa: catalog.display?.showDa !== false, rows })
    .replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(catalog.name)}</title>
<style>
:root{--ink:#0f172a;--mute:#64748b;--line:#e2e8f0;--soft:#f8fafc;--brand:#4f46e5;--good:#047857;--bg:#f4f5f9}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 16px 120px}
h1{margin:0 0 6px;font-size:26px;letter-spacing:-.02em}.intro{color:var(--mute);max-width:720px;margin:0 0 18px}
.meta{font-size:12px;color:var(--mute);margin-bottom:18px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px}
.filters{display:flex;flex-wrap:wrap;gap:10px;padding:14px;margin-bottom:14px;align-items:end}
.filters label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--mute)}
input,select{font:inherit;font-size:14px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);min-width:0}
input[type=number]{width:90px}.grow{flex:1;min-width:180px}.grow input{width:100%}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:-4px 0 14px}.chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 12px;font-size:12px;cursor:pointer}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.tablebox{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:820px}
th{background:var(--soft);text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);padding:10px 12px;white-space:nowrap;cursor:pointer;user-select:none}
td{padding:10px 12px;border-top:1px solid var(--line);white-space:nowrap}
tr.sel td{background:#eef2ff}.code{font:600 12px ui-monospace,Consolas,monospace;color:var(--brand)}
.pub{font-weight:600}.sub{font-size:12px;color:var(--mute)}
.pill{display:inline-flex;flex-direction:column;align-items:center;min-width:40px;border-radius:7px;padding:2px 6px;font-weight:700;line-height:1.1;border:1px solid var(--line)}
.pill small{font-size:9px;font-weight:600;opacity:.7}.t70{background:#059669;color:#fff;border-color:#059669}.t50{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}.t30{background:#fffbeb;color:#92400e;border-color:#fde68a}
.badge{border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600}.dof{background:#ecfdf5;color:var(--good)}.nof{background:#fff1f2;color:#be123c}
.price{font-weight:800;font-size:15px;text-align:right}
button.pick{border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;font-weight:600;cursor:pointer}
tr.sel button.pick{background:var(--brand);color:#fff;border-color:var(--brand)}
.pager{display:flex;gap:6px;align-items:center;justify-content:space-between;padding:12px 14px;border-top:1px solid var(--line);font-size:13px;color:var(--mute)}
.pager button{border:1px solid var(--line);background:#fff;border-radius:7px;padding:5px 10px;cursor:pointer}.pager button:disabled{opacity:.4;cursor:default}
.basket{position:fixed;left:0;right:0;bottom:0;background:var(--ink);color:#fff;padding:14px 16px;display:none}
.basket.show{display:block}.basket .in{max-width:1180px;margin:0 auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.basket b{font-size:18px}.basket .list{flex:1;font:12px ui-monospace,Consolas,monospace;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:120px}
.basket a,.basket button{background:#fff;color:var(--ink);border:0;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;text-decoration:none;font-size:14px}
.basket .ghost{background:transparent;color:#fff;border:1px solid #475569}
.note{font-size:12px;color:var(--mute);margin-top:12px}
@media print{.filters,.chips,.basket,.pager,button.pick{display:none!important}body{background:#fff}}
</style></head><body><div class="wrap">
<h1 id="t"></h1><p class="intro" id="intro"></p><div class="meta" id="meta"></div>
<div class="card filters">
  <label class="grow">Search niche or code<input id="q" placeholder="e.g. business, tech, GP-7F3A2C"></label>
  <label>Niche<select id="niche"><option value="">All niches</option></select></label>
  <label>Country<select id="country"><option value="">Any</option></select></label>
  <label>Min DR<input id="minDr" type="number" min="0" max="100"></label>
  <label>Max price $<input id="maxPrice" type="number" min="0"></label>
  <label>Sort<select id="sort"><option value="dr">Highest DR</option><option value="traffic">Most traffic</option><option value="price">Lowest price</option><option value="tat">Fastest</option></select></label>
</div>
<div class="chips" id="chips"></div>
<div class="card"><div class="tablebox"><table><thead><tr id="head"></tr></thead><tbody id="body"></tbody></table></div>
<div class="pager"><span id="count"></span><span><button id="prev">‹ Prev</button> <span id="pg"></span> <button id="next">Next ›</button></span></div></div>
<p class="note">Publisher names are shared once your order is confirmed. DR and traffic are Ahrefs figures as listed by each publisher; DA is Moz. Prices are per published article and include placement.</p>
</div>
<div class="basket" id="basket"><div class="in"><span><b id="bn">0</b> selected · <b id="bt">$0</b></span><span class="list" id="bl"></span>
<button class="ghost" id="clear">Clear</button><button id="copy">Copy list</button><a id="mail" href="#">Email request</a></div></div>
<script id="data" type="application/json">${data}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('data').textContent),R=D.rows,$=function(i){return document.getElementById(i)};
var sel={},page=1,PER=20,chip={};
$('t').textContent=D.name;$('intro').textContent=D.intro||'';$('meta').textContent=R.length+' publishers · prices valid from '+D.generated;document.title=D.name;
var niches={},countries={};R.forEach(function(r){r.niches.forEach(function(n){niches[n]=(niches[n]||0)+1});if(r.country)countries[r.country]=(countries[r.country]||0)+1});
Object.keys(niches).sort().forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n+' ('+niches[n]+')';$('niche').appendChild(o)});
Object.keys(countries).sort().forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n;$('country').appendChild(o)});
var CH=[['dof','Dofollow only'],['dr50','DR 50+'],['t100','100K+ visitors'],['fast','Live in 3 days'],['u200','Under $200']];
CH.forEach(function(c){var b=document.createElement('button');b.className='chip';b.textContent=c[1];b.onclick=function(){chip[c[0]]=!chip[c[0]];b.classList.toggle('on');page=1;draw()};$('chips').appendChild(b)});
var cols=['','Code','Publisher','Niche','DR'].concat(D.showDa?['DA']:[]).concat(['Traffic / mo','Link','Turnaround','Price']);
cols.forEach(function(c){var th=document.createElement('th');th.textContent=c;if(c==='Price')th.style.textAlign='right';$('head').appendChild(th)});
function tier(v){return v>=70?'t70':v>=50?'t50':v>=30?'t30':''}
function pill(v,l){return v==null?'<span class="sub">—</span>':'<span class="pill '+tier(v)+'">'+v+'<small>'+l+'</small></span>'}
function money(n){return n==null?'—':'$'+n.toLocaleString()}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
['q','niche','country','minDr','maxPrice','sort'].forEach(function(i){$(i).addEventListener('input',function(){page=1;draw()})});
function list(){
  var q=$('q').value.trim().toLowerCase(),n=$('niche').value,c=$('country').value,md=+$('minDr').value||0,mp=+$('maxPrice').value||0,s=$('sort').value;
  var out=R.filter(function(r){
    if(r.price==null)return false;
    if(q&&!(r.code.toLowerCase().indexOf(q)>=0||r.niches.join(' ').toLowerCase().indexOf(q)>=0||(r.country||'').toLowerCase().indexOf(q)>=0))return false;
    if(n&&r.niches.indexOf(n)<0)return false;if(c&&r.country!==c)return false;
    if(md&&(r.dr||0)<md)return false;if(mp&&r.price>mp)return false;
    if(chip.dof&&r.follow!=='dofollow')return false;if(chip.dr50&&(r.dr||0)<50)return false;
    if(chip.t100&&r.trafficSort<1e5)return false;if(chip.fast&&!(r.tatDays!=null&&r.tatDays<=3))return false;if(chip.u200&&r.price>200)return false;
    return true});
  var key={dr:function(r){return -(r.dr||0)},traffic:function(r){return -r.trafficSort},price:function(r){return r.price},tat:function(r){return r.tatDays==null?999:r.tatDays}}[s];
  return out.sort(function(a,b){return key(a)-key(b)});
}
function draw(){
  var L=list(),pages=Math.max(1,Math.ceil(L.length/PER));if(page>pages)page=pages;
  var rows=L.slice((page-1)*PER,page*PER);
  $('body').innerHTML=rows.map(function(r){
    var on=sel[r.code];
    return '<tr class="'+(on?'sel':'')+'"><td><button class="pick" data-c="'+r.code+'">'+(on?'✓ Added':'Add')+'</button></td>'+
      '<td class="code">'+r.code+'</td><td><div class="pub">'+esc(r.publisher)+'</div><div class="sub">'+esc([r.country,r.language].filter(Boolean).join(' · '))+'</div></td>'+
      '<td class="sub">'+esc(r.niches.slice(0,2).join(', '))+'</td><td>'+pill(r.dr,'DR')+'</td>'+(D.showDa?'<td>'+pill(r.da,'DA')+'</td>':'')+
      '<td>'+(r.traffic!=null?r.traffic.toLocaleString():(r.trafficBand||'—'))+'</td>'+
      '<td>'+(r.follow?'<span class="badge '+(r.follow==='dofollow'?'dof':'nof')+'">'+(r.maxLinks?r.maxLinks+'× ':'')+(r.follow==='dofollow'?'Dofollow':'Nofollow')+'</span>'+(r.sponsored?' <span class="sub">sponsored tag</span>':''):'<span class="sub">—</span>')+'</td>'+
      '<td>'+(r.tatDays!=null?(r.tatDays<1?'< 1 day':r.tatDays+(r.tatDays===1?' day':' days')):'—')+'</td><td class="price">'+money(r.price)+'</td></tr>'}).join('')||'<tr><td colspan="10" class="sub" style="padding:24px;text-align:center">No publishers match. Loosen the filters.</td></tr>';
  $('count').textContent=L.length+' publishers';$('pg').textContent='Page '+page+' of '+pages;$('prev').disabled=page<=1;$('next').disabled=page>=pages;
  basket();
}
$('body').addEventListener('click',function(e){var b=e.target.closest('button.pick');if(!b)return;var c=b.getAttribute('data-c');if(sel[c])delete sel[c];else sel[c]=R.filter(function(r){return r.code===c})[0];draw()});
$('prev').onclick=function(){page--;draw();scrollTo(0,0)};$('next').onclick=function(){page++;draw();scrollTo(0,0)};
function basket(){
  var ks=Object.keys(sel),tot=ks.reduce(function(a,k){return a+sel[k].price},0);
  $('basket').classList.toggle('show',ks.length>0);$('bn').textContent=ks.length;$('bt').textContent=money(tot);$('bl').textContent=ks.join(', ');
  var body='Hi,\\n\\nI would like to order these placements from "'+D.name+'":\\n\\n'+ks.map(function(k){return k+'  ('+sel[k].niches[0]+', DR '+(sel[k].dr==null?'?':sel[k].dr)+', '+money(sel[k].price)+')'}).join('\\n')+'\\n\\nTotal: '+money(tot)+'\\n\\nThanks';
  $('mail').href='mailto:'+encodeURIComponent(D.email||'')+'?subject='+encodeURIComponent('Placement request: '+ks.length+' sites')+'&body='+encodeURIComponent(body);
  $('mail').style.display=D.email?'':'none';
  $('copy').onclick=function(){var t=body;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){$('copy').textContent='Copied ✓';setTimeout(function(){$('copy').textContent='Copy list'},1500)},function(){prompt('Copy this list:',ks.join(', '))})};
}
$('clear').onclick=function(){sel={};draw()};
draw();
})();
</script></body></html>`
}
