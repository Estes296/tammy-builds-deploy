const MONEY_RE = /(?:\b(?:USD|US\$)\s*)?\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\b(?:USD\s*)?\d+(?:\.\d+)?\s?(?:million|thousand)\b/gi;
const PERCENT_RE = /\b\d+(?:\.\d+)?\s?%/g;
const DATE_RE = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi;

export const WATCH_TERMS = [
  ['AI / Digital Replica', /artificial intelligence|generative ai|digital replica|synthetic (?:voice|performance)|machine learning|training data|photogrammetry|biometric|embedding/i],
  ['Likeness / Voice', /likeness|name and likeness|voice|image rights|publicity rights|digital double/i],
  ['Compensation', /compensation|salary|residual|royalt|backend|participation|gross receipts|adjusted gross|net proceeds|pay-or-play|guaranteed/i],
  ['Termination', /termination|terminate|suspension|suspend|convenience termination/i],
  ['Indemnity', /indemnif|hold harmless/i],
  ['Exclusivity', /exclusiv|non-compete|noncompete|hold period/i],
  ['Option / Renewal', /option period|renewal|extension option|option(?:s)?\b/i],
  ['Assignment', /assign(?:ment|able)?/i],
  ['Dispute / Law', /arbitration|governing law|jurisdiction|venue|mediation/i],
  ['Force Majeure', /force majeure|labor interruption|financing interruption|distribution hold/i],
  ['Confidentiality', /confidential|non-disclosure|nondisclosure|nda|liquidated damages/i],
  ['Credit', /screen credit|billing|credit position|credit|main-title|single-card|shared card/i],
  ['Audit Rights', /audit right|books and records|accounting records|statements shall|audit costs/i],
  ['Insurance', /insurance|errors and omissions|e&o|workers.? compensation|additional insured/i],
  ['Travel / Per Diem', /per diem|travel|lodging|hotel|airfare|transportation|premium economy|business.class/i],
  ['Overtime / Work Rules', /overtime|turnaround|meal penalty|workday|work week|rehearsal|pickup days/i],
  ['Morality', /morals clause|morality clause|public disrepute|scandal/i],
  ['Publicity / Approval', /publicity|paid advertising|sensitive-category|political advertising/i],
  ['Hold / Availability', /first-position hold|blackout \/ hold|hold period|hold request|release the hold|release or confirm|cannot commit|shall not commit to conflicting|availability hold/i],
  ['Cancellation / Postponement', /cancell(?:ation|ed?)|postpon(?:ement|ed?)/i],
  ['MFN / Favored Nations', /most[- ]favored[- ]nation(?:s)?|most[- ]favoured[- ]nation(?:s)?|favored nations|favoured nations|\bmfn\b/i],
  ['Order of Precedence', /order of precedence|precedence|later-dated|rider .*controls?|body .*controls?/i],
  ['Data Retention / Model Use', /delet(?:e|ed|ion)|retain|retention|derived model|embedding|raw biometric|archive copy/i],
  ['Budget / Reallocation', /budget|contingency|completion bond|production fee|reallocat|reserve|above the line|below the line/i],
];

const HIGH_TOPICS = new Set(['AI / Digital Replica','Likeness / Voice','Compensation','Termination','Indemnity','Exclusivity','Option / Renewal','Assignment','Dispute / Law','Force Majeure','Confidentiality','Credit','Audit Rights','Insurance','Travel / Per Diem','Publicity / Approval','Hold / Availability','Cancellation / Postponement','MFN / Favored Nations','Order of Precedence','Data Retention / Model Use']);
const DEADLINE_RE = /\b(?:no later than|not later than|within\s+\d+\s+(?:business\s+)?days?|within\s+\d+\s+hours?|on or before|on or after|by\s+(?:the\s+)?\w+|deadline|due date|expires?|expiration|notice period)\b/i;

function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
function contextFor(text, start, length, radius = 120) { const a=Math.max(0,start-radius); const b=Math.min(text.length,start+length+radius); return clean(text.slice(a,b)); }
function collectRegex(section, regex, kind) {
  const out=[]; const text=section.text||''; const local=new RegExp(regex.source, regex.flags.includes('g')?regex.flags:`${regex.flags}g`);
  for (const match of text.matchAll(local)) out.push({kind,value:match[0],sourceRef:section.ref,context:contextFor(text,match.index||0,match[0].length)});
  return out;
}

export function deterministicScan(document) {
  const findings={money:[],percentages:[],dates:[],deadlines:[],watchTerms:[]};
  for (const section of document.sections||[]) {
    findings.money.push(...collectRegex(section,MONEY_RE,'money'));
    findings.percentages.push(...collectRegex(section,PERCENT_RE,'percentage'));
    findings.dates.push(...collectRegex(section,DATE_RE,'date'));
    const sectionText=clean(section.text);
    if (sectionText && DEADLINE_RE.test(sectionText)) findings.deadlines.push({kind:'deadline',value:'Deadline / time-sensitive language',sourceRef:section.ref,context:sectionText.slice(0,500)});
    for (const [category,pattern] of WATCH_TERMS) if (pattern.test(sectionText)) findings.watchTerms.push({kind:'watch',category,value:category,sourceRef:section.ref,context:sectionText.slice(0,500)});
  }
  for (const key of Object.keys(findings)) { const seen=new Set(); findings[key]=findings[key].filter((item)=>{const sig=`${item.sourceRef}|${item.value}|${item.context}`; if(seen.has(sig)) return false; seen.add(sig); return true;}); }
  return findings;
}

export function parseDollarAmount(value) {
  if (!value) return null;
  const normalized=value.toLowerCase().replace(/usd|us\$/g,'').trim();
  const mult=normalized.includes('million')?1_000_000:normalized.includes('thousand')?1_000:1;
  const number=Number(normalized.replace(/[$,]/g,'').replace(/million|thousand/g,'').trim());
  return Number.isFinite(number)?number*mult:null;
}
function parsePercent(value){const n=Number(String(value||'').replace('%','').trim()); return Number.isFinite(n)?n:null;}
function anchorTokens(text){return clean(text).toLowerCase().replace(/\$\s?\d[\d,.]*/g,' ').replace(/\b\d+(?:\.\d+)?\s?%/g,' ').replace(/\b\d+(?:\.\d+)?\b/g,' ').replace(/[^a-z]+/g,' ').split(/\s+/).filter((w)=>w.length>2&&!['the','and','for','with','from','that','this','shall','may','will','are','was','were','into','upon','under','only','each','all','any','not'].includes(w));}
function similarity(a,b){const A=new Set(anchorTokens(a)); const B=new Set(anchorTokens(b)); if(!A.size||!B.size)return 0; let intersect=0; for(const x of A) if(B.has(x))intersect+=1; return intersect/Math.max(A.size,B.size);}
function greedyPair(itemsA,itemsB,threshold=.42){const candidates=[]; itemsA.forEach((a,ai)=>itemsB.forEach((b,bi)=>{const score=similarity(a.context||a.text||'',b.context||b.text||''); if(score>=threshold)candidates.push({ai,bi,score});})); candidates.sort((x,y)=>y.score-x.score); const usedA=new Set(),usedB=new Set(),pairs=[]; for(const c of candidates){if(usedA.has(c.ai)||usedB.has(c.bi))continue; usedA.add(c.ai);usedB.add(c.bi);pairs.push({a:itemsA[c.ai],b:itemsB[c.bi],score:c.score});} return {pairs,unmatchedA:itemsA.filter((_,i)=>!usedA.has(i)),unmatchedB:itemsB.filter((_,i)=>!usedB.has(i))};}

export function moneySetComparison(scanA,scanB){const summarize=(items)=>{const map=new Map(); for(const item of items||[]){const amount=parseDollarAmount(item.value); if(amount===null)continue; const key=amount.toFixed(2); if(!map.has(key))map.set(key,{amount,examples:[]}); const bucket=map.get(key); if(bucket.examples.length<3)bucket.examples.push(item);} return map;}; const a=summarize(scanA?.money), b=summarize(scanB?.money); return {removed:[...a.entries()].filter(([k])=>!b.has(k)).map(([,v])=>v),added:[...b.entries()].filter(([k])=>!a.has(k)).map(([,v])=>v)};}

function financialContextChanges(scanA,scanB){
  const money=greedyPair(scanA?.money||[],scanB?.money||[],.5).pairs.map(({a,b,score})=>{const before=parseDollarAmount(a.value),after=parseDollarAmount(b.value); return {kind:'money',label:'Financial amount changed',beforeValue:a.value,afterValue:b.value,beforeAmount:before,afterAmount:after,delta:(after??0)-(before??0),beforeContext:a.context,afterContext:b.context,sourceRefV1:a.sourceRef,sourceRefV2:b.sourceRef,confidence:score};}).filter(x=>x.beforeAmount!==null&&x.afterAmount!==null&&Math.abs(x.delta)>.004);
  const pct=greedyPair(scanA?.percentages||[],scanB?.percentages||[],.5).pairs.map(({a,b,score})=>{const before=parsePercent(a.value),after=parsePercent(b.value); return {kind:'percentage',label:'Percentage changed',beforeValue:a.value,afterValue:b.value,beforeAmount:before,afterAmount:after,delta:(after??0)-(before??0),beforeContext:a.context,afterContext:b.context,sourceRefV1:a.sourceRef,sourceRefV2:b.sourceRef,confidence:score};}).filter(x=>x.beforeAmount!==null&&x.afterAmount!==null&&x.delta!==0);
  return [...money,...pct].sort((a,b)=>b.confidence-a.confidence);
}

function sensitiveTopicChanges(docA,docB){const results=[]; for(const [category,pattern] of WATCH_TERMS){const get=(doc)=>{const out=[]; for(const section of doc?.sections||[]){const text=clean(section.text); if(pattern.test(text))out.push({category,sourceRef:section.ref,context:text.slice(0,500)});} return out;}; const a=get(docA),b=get(docB); const {pairs}=greedyPair(a,b,.28); for(const p of pairs){if(clean(p.a.context).toLowerCase()===clean(p.b.context).toLowerCase())continue; results.push({category,changeType:'changed',severity:HIGH_TOPICS.has(category)?'high':'medium',before:p.a.context,after:p.b.context,sourceRefV1:p.a.sourceRef,sourceRefV2:p.b.sourceRef,confidence:p.score});} if(a.length&&!b.length)results.push({category,changeType:'removed',severity:HIGH_TOPICS.has(category)?'high':'medium',before:a[0].context,after:'',sourceRefV1:a[0].sourceRef,sourceRefV2:'',confidence:.5}); if(b.length&&!a.length)results.push({category,changeType:'added',severity:HIGH_TOPICS.has(category)?'high':'medium',before:'',after:b[0].context,sourceRefV1:'',sourceRefV2:b[0].sourceRef,confidence:.5});} return results;}

export function deterministicComparison(docA,docB,scanA,scanB){
  const financial=financialContextChanges(scanA,scanB); const sensitive=sensitiveTopicChanges(docA,docB);
  const material=[...sensitive.map(x=>({type:'sensitive',group:/AI|Likeness|Credit|Assignment|Option|Exclusivity|Publicity|Hold|MFN|Precedence|Data Retention/.test(x.category)?'rights':/Termination|Indemnity|Force Majeure|Insurance|Confidentiality|Cancellation/.test(x.category)?'termination':/Dispute|Audit/.test(x.category)?'legal':/Budget|Travel|Overtime/.test(x.category)?'budget':'other',severity:x.severity,title:`${x.category} ${x.changeType}`,before:x.before,after:x.after,impact:'Material contract language changed; review the before/after wording and source references.',sourceRefV1:x.sourceRefV1,sourceRefV2:x.sourceRefV2,confidence:x.confidence,priority:x.severity==='high'?110:80})),...financial.filter(x=>x.confidence>=.62).map(x=>({type:'financial',group:'financial',severity:Math.abs(x.delta)>=50000?'high':'medium',title:x.label,before:x.beforeValue,after:x.afterValue,impact:x.kind==='money'?`${x.delta>=0?'Increase':'Decrease'} of $${Math.abs(x.delta).toLocaleString('en-US',{maximumFractionDigits:2})}`:`${x.delta>=0?'Increase':'Decrease'} of ${Math.abs(x.delta)} percentage points`,sourceRefV1:x.sourceRefV1,sourceRefV2:x.sourceRefV2,confidence:x.confidence,priority:60}))].sort((a,b)=>(b.priority||0)-(a.priority||0));
  const groupCounts=material.reduce((acc,item)=>{acc[item.group]=(acc[item.group]||0)+1; return acc;},{});
  return {financial,sensitive,material,summary:{pairedFinancialChanges:financial.length,sensitiveTopicChanges:sensitive.length,highSensitiveChanges:sensitive.filter(x=>x.severity==='high').length,materialChanges:material.length,highMaterialChanges:material.filter(x=>x.severity==='high').length,groupCounts}};
}
