// ══════════════════════════════════════════════════════════════
// BACKEND — leave '' when hosted on Vercel (same domain)
// ══════════════════════════════════════════════════════════════
const BACKEND_URL = 'https://lex-ai-ashen.vercel.app/app.html';

// ── GROQ PROXY ──
async function groqFetch(payload) {
  const res = await fetch(BACKEND_URL + '/api/analyse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data;
}

// ══════════════════════════════════════════════════════════════
// AUTH STATE
// ══════════════════════════════════════════════════════════════
let currentUser = null;

// Check if user was passed from index.html via sessionStorage
function loadUserFromSession() {
  const uid   = sessionStorage.getItem('lexai_user_id');
  const email = sessionStorage.getItem('lexai_user_email');
  const name  = sessionStorage.getItem('lexai_user_name');
  if (uid) {
    currentUser = { id: uid, email, name };
    updateAuthUI(currentUser);
  }
}

// Init Clerk on app.html
window.addEventListener('load', async () => {
  // First try session (came from index.html)
  loadUserFromSession();

  if (!window.Clerk) return;

  await window.Clerk.load();

  // Clerk has the real user object — use it
  if (window.Clerk.user) {
    currentUser = window.Clerk.user;
    updateAuthUI(currentUser);
    syncSessionFromClerk(window.Clerk.user);
  }

  window.Clerk.addListener(({ user }) => {
    currentUser = user || null;
    updateAuthUI(currentUser);
    if (user) syncSessionFromClerk(user);
    // Refresh visible page
    const active = document.querySelector('.page.active');
    if (active?.id === 'historyPage')   renderHistory();
    if (active?.id === 'bookmarksPage') renderBookmarks();
  });
});

function syncSessionFromClerk(user) {
  sessionStorage.setItem('lexai_user_id',    user.id);
  sessionStorage.setItem('lexai_user_email', user.primaryEmailAddress?.emailAddress || '');
  sessionStorage.setItem('lexai_user_name',  user.firstName || '');
  // Override currentUser with full Clerk object
  currentUser = user;
}

function updateAuthUI(user) {
  const guestBadge   = document.getElementById('guestBadge');
  const topbarSignin = document.getElementById('topbarSignin');
  const userChip     = document.getElementById('userChip');
  const userAvatar   = document.getElementById('userAvatar');
  const userEmail    = document.getElementById('userEmail');

  const isLoggedIn = !!(user && (user.id || user.email));

  if (isLoggedIn) {
    if (guestBadge)   guestBadge.style.display   = 'none';
    if (topbarSignin) topbarSignin.style.display  = 'none';
    if (userChip)     userChip.style.display      = 'flex';

    const email = user.primaryEmailAddress?.emailAddress || user.email || '';
    const name  = user.firstName || user.name || email;
    if (userAvatar) userAvatar.textContent = name.charAt(0).toUpperCase();
    if (userEmail)  userEmail.textContent  = email;
  } else {
    if (guestBadge)   guestBadge.style.display   = 'flex';
    if (topbarSignin) topbarSignin.style.display  = 'flex';
    if (userChip)     userChip.style.display      = 'none';
  }
}

function handleAuth() {
  if (!window.Clerk) {
    showToast('Auth not configured. Add Clerk keys to app.html.');
    return;
  }
  window.Clerk.openSignIn({
    afterSignInUrl: window.location.href,
    afterSignUpUrl: window.location.href,
  });
}

function signOutUser() {
  sessionStorage.removeItem('lexai_user_id');
  sessionStorage.removeItem('lexai_user_email');
  sessionStorage.removeItem('lexai_user_name');
  if (window.Clerk) window.Clerk.signOut();
  currentUser = null;
  updateAuthUI(null);
  showToast('Signed out successfully.');
}

// ══════════════════════════════════════════════════════════════
// STORAGE  —  keyed per user. Guests get no persistence.
// ══════════════════════════════════════════════════════════════
function getUserId() {
  return currentUser?.id
      || currentUser?.email
      || sessionStorage.getItem('lexai_user_id')
      || null;
}

function storageKey(key) {
  const uid = getUserId();
  return uid ? uid + '_' + key : null;
}

function getStorage(key) {
  const k = storageKey(key);
  if (!k) return [];
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
}

function setStorage(key, val) {
  const k = storageKey(key);
  if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(val)); } catch {}
}

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
let selectedCourt   = 'All Courts';
let currentLang     = 'en';
let currentQuery    = '';
let currentAnalysis = null;
let stepTimer       = null;

const HISTORY_KEY   = 'lexai_history';
const BOOKMARKS_KEY = 'lexai_bookmarks';

// ── LANGUAGE DATA ──
const LANG = {
  en: {
    hero_badge:'⚖ AI Legal Intelligence · India',
    hero_title:'Know your case.<br/><em>Before the courtroom.</em>',
    hero_sub:'Describe your legal situation in plain language. LexAI auto-detects the category, analyses your chances, maps IPC sections, and guides your next steps — instantly and free.',
    placeholder:'Describe your legal situation in detail…',
    analyse_btn:'Analyse →', court_label:'Court:',
    all_courts:'All Courts', supreme:'Supreme Court', high:'High Court', district:'District Court',
    try_sample:'Try a sample query →', analysing:'Analysing…',
    loader_steps:['Detecting legal category…','Evaluating case strength…','Mapping IPC sections…','Drafting procedure steps…','Compiling full analysis…'],
    nav:['Home','History','Bookmarks','Compare','Glossary','Helplines','Toggle Theme'],
    labels:{
      case_summary:'📋 Case Summary', judgement:'⚖ Judgement Likelihood',
      improve:'💡 How to Improve Your Chances', risks:'⚠ Key Risks',
      ipc:'📖 Relevant IPC / Legal Sections', next_steps:'🗺 Next Steps / Procedure',
      court:'🏛 Recommended Court', timeline:'⏱ Timeline',
      arguments:'💬 Key Legal Arguments', documents:'📁 Documents Required',
      above_avg:'✓ Above Average', moderate:'◑ Moderate Position',
      challenging:'↓ Challenging', very_weak:'✗ Very Weak Position',
      ncrb_base:'NCRB base rate', subtype:'Sub-type',
      save:'💾 Save', pdf:'📄 PDF', print:'🖨 Print', home:'🏠 Home',
      disclaimer:'⚠ DISCLAIMER: AI-generated analysis for informational purposes only. Not legal advice. Consult a qualified advocate before taking legal action.',
      history_title:'Search History', history_sub:'Your recent legal queries — click to re-analyse',
      bookmarks_title:'Saved Cases', bookmarks_sub:'Analyses you bookmarked for reference',
      compare_title:'Compare Two Cases', compare_sub:'Enter two different legal situations and compare them side by side',
      glossary_title:'Legal Glossary', glossary_sub:'Common legal terms explained in plain language',
      glossary_search:'Search a legal term…',
      helplines_title:'Emergency Legal Helplines', helplines_sub:'Free legal aid and emergency numbers across India',
      empty_history:'No history yet. Start analysing a legal query.',
      empty_bookmarks:'No bookmarks yet. Save analyses from the results page.',
      new_query:'New legal query…', case_a:'Case A', case_b:'Case B', compare_btn:'⚡ Compare Both',
    },
  },
  ta: {
    hero_badge:'⚖ AI சட்ட நுண்ணறிவு · இந்தியா',
    hero_title:'உங்கள் வழக்கை அறியுங்கள்.<br/><em>நீதிமன்றத்திற்கு முன்பே.</em>',
    hero_sub:'உங்கள் சட்ட நிலையை எளிய மொழியில் விவரிக்கவும். LexAI தானாகவே வகையை கண்டறிந்து, வாய்ப்புகளை பகுப்பாய்வு செய்து, IPC பிரிவுகளை வரைபடமிட்டு, அடுத்த படிகளை வழிகாட்டும்.',
    placeholder:'உங்கள் சட்ட நிலையை விரிவாக விவரிக்கவும்…',
    analyse_btn:'பகுப்பாய்வு →', court_label:'நீதிமன்றம்:',
    all_courts:'அனைத்து நீதிமன்றங்கள்', supreme:'உச்ச நீதிமன்றம்', high:'உயர் நீதிமன்றம்', district:'மாவட்ட நீதிமன்றம்',
    try_sample:'மாதிரி கேள்வியை முயற்சிக்கவும் →', analysing:'பகுப்பாய்வு செய்கிறது…',
    loader_steps:['சட்ட வகையை கண்டறிகிறது…','வழக்கு வலிமையை மதிப்பீடு செய்கிறது…','IPC பிரிவுகளை வரைபடமிடுகிறது…','நடைமுறை படிகளை வரையறுக்கிறது…','முழு பகுப்பாய்வை தொகுக்கிறது…'],
    nav:['முகப்பு','வரலாறு','புக்மார்க்கள்','ஒப்பிடு','சொற்களஞ்சியம்','உதவி எண்கள்','தீம் மாற்று'],
    labels:{
      case_summary:'📋 வழக்கு சுருக்கம்', judgement:'⚖ தீர்ப்பு வாய்ப்பு',
      improve:'💡 வாய்ப்பை மேம்படுத்துவது எப்படி', risks:'⚠ முக்கிய அபாயங்கள்',
      ipc:'📖 தொடர்புடைய IPC / சட்டப் பிரிவுகள்', next_steps:'🗺 அடுத்த நடவடிக்கைகள்',
      court:'🏛 பரிந்துரைக்கப்பட்ட நீதிமன்றம்', timeline:'⏱ எதிர்பார்க்கப்படும் காலம்',
      arguments:'💬 முக்கிய சட்ட வாதங்கள்', documents:'📁 தேவையான ஆவணங்கள்',
      above_avg:'✓ சராசரிக்கு மேல்', moderate:'◑ மிதமான நிலை',
      challenging:'↓ சவாலான நிலை', very_weak:'✗ மிகவும் பலவீனமான நிலை',
      ncrb_base:'NCRB அடிப்படை விகிதம்', subtype:'துணை வகை',
      save:'💾 சேமி', pdf:'📄 PDF', print:'🖨 அச்சிடு', home:'🏠 முகப்பு',
      disclaimer:'⚠ மறுப்பு: இது AI உருவாக்கிய தகவல் மட்டுமே. சட்ட ஆலோசனை அல்ல.',
      history_title:'தேடல் வரலாறு', history_sub:'உங்கள் சமீபத்திய சட்ட கேள்விகள்',
      bookmarks_title:'சேமிக்கப்பட்ட வழக்குகள்', bookmarks_sub:'நீங்கள் புக்மார்க் செய்த பகுப்பாய்வுகள்',
      compare_title:'இரண்டு வழக்குகளை ஒப்பிடுங்கள்', compare_sub:'இரண்டு வெவ்வேறு சட்ட நிலைகளை ஒப்பிடுங்கள்',
      glossary_title:'சட்ட சொற்களஞ்சியம்', glossary_sub:'சட்ட சொற்கள் எளிய மொழியில் விளக்கப்பட்டுள்ளன',
      glossary_search:'ஒரு சட்ட சொல்லை தேடுங்கள்…',
      helplines_title:'அவசர சட்ட உதவி எண்கள்', helplines_sub:'இந்தியா முழுவதும் இலவச சட்ட உதவி',
      empty_history:'இன்னும் வரலாறு இல்லை.', empty_bookmarks:'புக்மார்க்கள் இல்லை.',
      new_query:'புதிய சட்ட கேள்வி…', case_a:'வழக்கு A', case_b:'வழக்கு B', compare_btn:'⚡ இரண்டையும் ஒப்பிடு',
    },
  },
  hi: {
    hero_badge:'⚖ AI कानूनी बुद्धिमत्ता · भारत',
    hero_title:'अपना मामला जानें।<br/><em>अदालत से पहले।</em>',
    hero_sub:'अपनी कानूनी स्थिति सरल भाषा में बताएं। LexAI स्वचालित रूप से श्रेणी पहचानता है, आपकी संभावनाओं का विश्लेषण करता है, IPC धाराएं मैप करता है।',
    placeholder:'अपनी कानूनी स्थिति विस्तार से बताएं…',
    analyse_btn:'विश्लेषण करें →', court_label:'न्यायालय:',
    all_courts:'सभी न्यायालय', supreme:'सर्वोच्च न्यायालय', high:'उच्च न्यायालय', district:'जिला न्यायालय',
    try_sample:'नमूना प्रश्न आज़माएं →', analysing:'विश्लेषण हो रहा है…',
    loader_steps:['कानूनी श्रेणी पहचान रहे हैं…','मामले की ताकत का मूल्यांकन…','IPC धाराएं मैप कर रहे हैं…','प्रक्रिया के कदम तैयार कर रहे हैं…','पूर्ण विश्लेषण तैयार कर रहे हैं…'],
    nav:['होम','इतिहास','बुकमार्क','तुलना करें','शब्दकोश','हेल्पलाइन','थीम बदलें'],
    labels:{
      case_summary:'📋 मामले का सारांश', judgement:'⚖ निर्णय की संभावना',
      improve:'💡 अपनी संभावना कैसे बढ़ाएं', risks:'⚠ मुख्य जोखिम',
      ipc:'📖 संबंधित IPC / कानूनी धाराएं', next_steps:'🗺 अगले कदम / प्रक्रिया',
      court:'🏛 अनुशंसित न्यायालय', timeline:'⏱ अपेक्षित समय-सीमा',
      arguments:'💬 मुख्य कानूनी तर्क', documents:'📁 आवश्यक दस्तावेज़',
      above_avg:'✓ औसत से ऊपर', moderate:'◑ मध्यम स्थिति',
      challenging:'↓ चुनौतीपूर्ण', very_weak:'✗ बहुत कमज़ोर स्थिति',
      ncrb_base:'NCRB आधार दर', subtype:'उप-प्रकार',
      save:'💾 सहेजें', pdf:'📄 PDF', print:'🖨 प्रिंट', home:'🏠 होम',
      disclaimer:'⚠ अस्वीकरण: यह केवल AI द्वारा उत्पन्न जानकारी है। कानूनी सलाह नहीं।',
      history_title:'खोज इतिहास', history_sub:'आपके हालिया कानूनी प्रश्न',
      bookmarks_title:'सहेजे गए मामले', bookmarks_sub:'आपके बुकमार्क किए गए विश्लेषण',
      compare_title:'दो मामलों की तुलना करें', compare_sub:'दो अलग-अलग कानूनी स्थितियां दर्ज करें',
      glossary_title:'कानूनी शब्दकोश', glossary_sub:'कानूनी शब्द सरल भाषा में समझाए गए',
      glossary_search:'कोई कानूनी शब्द खोजें…',
      helplines_title:'आपातकालीन कानूनी हेल्पलाइन', helplines_sub:'भारत भर में मुफ्त कानूनी सहायता',
      empty_history:'अभी तक कोई इतिहास नहीं।', empty_bookmarks:'कोई बुकमार्क नहीं।',
      new_query:'नया कानूनी प्रश्न…', case_a:'मामला A', case_b:'मामला B', compare_btn:'⚡ दोनों की तुलना करें',
    },
  }
};

// ── SET LANGUAGE ──
function setLang(lang) {
  currentLang = lang;
  const L = LANG[lang]; const LB = L.labels;
  document.querySelectorAll('.lang-btn[data-lang]').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));
  const els = {
    '.hero-badge': v => v && (v.textContent = L.hero_badge),
    '.hero-title': v => v && (v.innerHTML = L.hero_title),
    '.hero-sub':   v => v && (v.textContent = L.hero_sub),
  };
  Object.entries(els).forEach(([sel, fn]) => fn(document.querySelector(sel)));
  const inp = document.getElementById('homeInput'); if (inp) inp.placeholder = L.placeholder;
  const btn = document.getElementById('homeBtn');   if (btn) btn.textContent = L.analyse_btn;
  const chips = document.querySelectorAll('.court-filter .chip');
  ['all_courts','supreme','high','district'].forEach((k,i) => { if (chips[i]) chips[i].childNodes[0].textContent = L[k]; });
  const st = document.querySelector('.sample-title'); if (st) st.textContent = L.try_sample;
  document.querySelectorAll('.nav-label').forEach((el,i) => { if (L.nav[i]) el.textContent = L.nav[i]; });
  L.loader_steps.forEach((t,i) => { const el = document.getElementById('ls'+(i+1)); if (el) el.textContent = t; });
  const pages = { history:[LB.history_title,LB.history_sub], bookmarks:[LB.bookmarks_title,LB.bookmarks_sub], compare:[LB.compare_title,LB.compare_sub], glossary:[LB.glossary_title,LB.glossary_sub], helplines:[LB.helplines_title,LB.helplines_sub] };
  Object.entries(pages).forEach(([page,[t,s]]) => { const pg = document.getElementById(page+'Page'); if (!pg) return; const pt = pg.querySelector('.page-title'); if (pt) pt.textContent=t; const ps = pg.querySelector('.page-sub'); if (ps) ps.textContent=s; });
  const ti = document.getElementById('topbarInput');  if (ti) ti.placeholder = LB.new_query;
  const gi = document.getElementById('glossaryInput'); if (gi) gi.placeholder = LB.glossary_search;
  const sa = document.querySelector('#slot1 .slot-label'); if (sa) sa.textContent = LB.case_a;
  const sb = document.querySelector('#slot2 .slot-label'); if (sb) sb.textContent = LB.case_b;
  const cb = document.querySelector('#slot1 .btn-sec');    if (cb) cb.textContent = LB.compare_btn;
  if (currentQuery) retranslateAnalysis();
  localStorage.setItem('lexai_lang', lang);
}

// ── RE-TRANSLATE ──
async function retranslateAnalysis() {
  const aOut = document.getElementById('analysisOut'); if (!aOut) return;
  showPage('analysis', false);
  const langName = currentLang==='ta'?'Tamil':currentLang==='hi'?'Hindi':'English';
  const langFull = currentLang==='ta'?'Tamil language. Write everything in Tamil script (தமிழ்).':currentLang==='hi'?'Hindi language. Write everything in Devanagari script (हिंदी).':'English language.';
  aOut.style.position = 'relative';
  const ov = document.createElement('div');
  ov.id = 'translateOverlay';
  ov.style.cssText = 'position:absolute;inset:0;background:var(--bg);opacity:.9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;z-index:10;border-radius:10px;';
  ov.innerHTML = `<div style="width:36px;height:36px;border-radius:50%;border:3px solid var(--border);border-top-color:var(--gold);animation:spin .8s linear infinite;"></div><div style="font-size:.8rem;letter-spacing:1px;color:var(--gold);">Translating to ${langName}…</div>`;
  aOut.appendChild(ov);
  const SYSTEM = `You are a legal analysis AI for the Indian justice system. You MUST write ALL output text in ${langFull} JSON keys stay in English. Return ONLY raw JSON:\n{"category":"...","subtype_detected":"...","base_rate_used":0,"court_level":"...","case_summary":"...","positive_judgement_score":0,"positive_judgement_level":"high|medium|low","positive_judgement_reason":"...","ipc_sections":[{"section":"","title":"","relevance":""}],"next_steps":["..."],"key_legal_arguments":"...","risks_challenges":"...","time_frame":"...","documents_required":["..."],"recommended_court":"...","improve_chances":"..."}`;
  try {
    const data = await groqFetch({ model:'llama-3.3-70b-versatile', temperature:.2, max_tokens:1800, response_format:{type:'json_object'}, messages:[{role:'system',content:SYSTEM},{role:'user',content:'Analyse this legal situation and respond in '+langName+': '+currentQuery}] });
    const analysis = JSON.parse((data.choices?.[0]?.message?.content||'').replace(/```json|```/g,'').trim());
    const rawScore = Math.round(Number(analysis.positive_judgement_score)||analysis.base_rate_used||35);
    analysis.positive_judgement_score = clampScore(rawScore,analysis.category);
    analysis.positive_judgement_level = analysis.positive_judgement_score>55?'high':analysis.positive_judgement_score>=35?'medium':'low';
    currentAnalysis = analysis;
    document.getElementById('translateOverlay')?.remove();
    aOut.style.position = '';
    renderAnalysis(currentQuery, analysis);
  } catch(err) {
    const o = document.getElementById('translateOverlay');
    if (o) { o.innerHTML=`<div style="padding:1.5rem;color:#f87171;font-size:.82rem;">Translation failed: ${esc(err.message)}</div>`; setTimeout(()=>{o.remove();aOut.style.position='';},3000); }
  }
}

const _savedLang = localStorage.getItem('lexai_lang');
if (_savedLang && LANG[_savedLang]) setTimeout(()=>setLang(_savedLang),100);

// ── THEME ──
function toggleTheme() {
  const t = document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme = t;
  document.getElementById('themeIcon').textContent = t==='dark'?'☀':'🌙';
  localStorage.setItem('lexai_theme',t);
}
const savedTheme = localStorage.getItem('lexai_theme');
if (savedTheme) { document.documentElement.dataset.theme=savedTheme; const ti=document.getElementById('themeIcon'); if(ti) ti.textContent=savedTheme==='dark'?'☀':'🌙'; }

// ── PAGE HISTORY ──
const pageHistory=['home']; let historyIndex=0;
function updateArrows(){ const b=document.getElementById('btnBack'),f=document.getElementById('btnForward'); if(b) b.disabled=historyIndex<=0; if(f) f.disabled=historyIndex>=pageHistory.length-1; }
function goBack(){ if(historyIndex<=0) return; historyIndex--; showPage(pageHistory[historyIndex],false); }
function goForward(){ if(historyIndex>=pageHistory.length-1) return; historyIndex++; showPage(pageHistory[historyIndex],false); }

// ── NAVIGATION ──
function showPage(name, addToHistory=true) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(name+'Page').classList.add('active');
  const nav=document.getElementById('nav-'+name); if(nav) nav.classList.add('active');
  if(addToHistory){ pageHistory.splice(historyIndex+1); if(pageHistory[historyIndex]!==name){ pageHistory.push(name); historyIndex++; } }
  updateArrows();
  document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active',b.dataset.lang===currentLang));
  if(name==='history')   renderHistory();
  if(name==='bookmarks') renderBookmarks();
  if(name==='glossary')  renderGlossary();
  if(name==='helplines') renderHelplines();
}

function selectCourt(el){ document.querySelectorAll('.court-filter .chip').forEach(c=>c.classList.remove('active')); el.classList.add('active'); selectedCourt=el.dataset.v; }
function useSample(card){ document.getElementById('homeInput').value=card.querySelector('.scard-q').textContent.trim(); doAnalysis(); }
function runFromTopbar(){ const q=document.getElementById('topbarInput').value.trim(); if(!q) return; document.getElementById('homeInput').value=q; doAnalysis(); }

// ── LOADER ──
function startLoader(){ let i=1; document.querySelectorAll('.lstep').forEach(s=>s.classList.remove('on')); document.getElementById('ls1').classList.add('on'); stepTimer=setInterval(()=>{ document.querySelectorAll('.lstep').forEach(s=>s.classList.remove('on')); const el=document.getElementById('ls'+i); if(el) el.classList.add('on'); i=i<5?i+1:1; },1100); }
function stopLoader(){ if(stepTimer) clearInterval(stepTimer); }

// ── NCRB BASE RATES ──
const BASE_RATES = {
  'Criminal Law':{min:12,max:72,subtypes:{bail_bailable:70,bail_nonbailable:27,murder:42,rape:27,domestic_violence_498a:16,drug_ndps:31,false_fir_quash:15,cheating_fraud:38,default:35}},
  'Civil Law':{min:20,max:65,subtypes:{cheque_bounce_138:60,money_recovery:37,wrongful_termination:32,property_dispute:27,consumer_complaint:50,rent_deposit:33,default:35}},
  'Family Law':{min:30,max:92,subtypes:{mutual_divorce:92,contested_divorce:50,custody_mother:67,custody_father:35,maintenance_125:60,domestic_violence_dv_act:55,default:48}},
  'Corporate / Business Law':{min:20,max:55,subtypes:{contract_breach_written:45,fraud_misappropriation:31,winding_up:47,director_breach:25,default:35}},
  'Constitutional Law':{min:20,max:45,subtypes:{writ_petition:40,pil:25,property_acquisition:30,fundamental_rights:37,default:32}},
  'Intellectual Property':{min:20,max:60,subtypes:{trademark_registered:52,trademark_unregistered:25,copyright_registered:37,copyright_unregistered:22,patent:30,software_app:31,default:33}},
  'Immigration Law':{min:15,max:40,subtypes:{visa_rejection:20,citizenship:27,deportation_stay:32,default:25}},
  'Tax Law':{min:25,max:55,subtypes:{income_tax_itat:42,gst_dispute:37,advance_ruling:47,default:38}},
};
function clampScore(score,category){ const cat=BASE_RATES[category]; if(!cat) return score; if(score===42&&cat.subtypes.default!==42) return cat.subtypes.default; return Math.min(cat.max,Math.max(cat.min,score)); }

// ── MAIN ANALYSIS ──
async function doAnalysis() {
  const _ti=document.getElementById('topbarInput');
  const query=document.getElementById('homeInput').value.trim()||(_ti?_ti.value.trim():'');
  if(!query) return;
  document.getElementById('homeErr').classList.remove('show');
  currentQuery=query; currentAnalysis=null;
  showPage('analysis'); document.getElementById('nav-home').classList.remove('active');
  const loader=document.getElementById('loader'),out=document.getElementById('analysisOut'),resErr=document.getElementById('resErr');
  out.innerHTML=''; resErr.classList.remove('show'); loader.classList.add('show'); startLoader();
  document.getElementById('bookmarkBtn').classList.remove('active');
  const _tInput=document.getElementById('topbarInput'); if(_tInput) _tInput.value=query;
  const langLabel=currentLang==='ta'?'Tamil (தமிழ்)':currentLang==='hi'?'Hindi (हिंदी)':'English';
  const SYSTEM=`You are a precise legal scoring AI for the Indian justice system. Respond in ${langLabel} for all text fields. Keep IPC section numbers in English. Return ONLY raw JSON:\n{"category":"Criminal Law|Civil Law|Family Law|Corporate / Business Law|Constitutional Law|Intellectual Property|Immigration Law|Tax Law","subtype_detected":"string","base_rate_used":number,"court_level":"Supreme Court|High Court|District Court","case_summary":"string","positive_judgement_score":number,"positive_judgement_level":"high|medium|low","positive_judgement_reason":"string","ipc_sections":[{"section":"","title":"","relevance":""}],"next_steps":[""],"key_legal_arguments":"string","risks_challenges":"string","time_frame":"string","documents_required":[""],"recommended_court":"string","improve_chances":"string"}\n\nNCRB BASE RATES: bail_bailable=70%,bail_nonbailable=27%,murder=42%,rape=27%,498a=16%,ndps=31%,cheque_bounce=60%,property_dispute=27%,mutual_divorce=92%,contested_divorce=50%,custody_mother=67%,writ_petition=40%,trademark_reg=52%.\nSCORING: Use exact base rate, adjust ±5-10 for evidence strength. NEVER default to 42.`;
  try {
    const data=await groqFetch({model:'llama-3.3-70b-versatile',temperature:.3,max_tokens:1800,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM},{role:'user',content:query}]});
    const analysis=JSON.parse((data.choices?.[0]?.message?.content||'').replace(/```json|```/g,'').trim());
    const rawScore=Math.round(Number(analysis.positive_judgement_score)||analysis.base_rate_used||35);
    analysis.positive_judgement_score=clampScore(rawScore,analysis.category);
    analysis.positive_judgement_level=analysis.positive_judgement_score>55?'high':analysis.positive_judgement_score>=35?'medium':'low';
    currentAnalysis=analysis;
    stopLoader(); loader.classList.remove('show');
    renderAnalysis(query,analysis);
    saveToHistory(query,analysis.category,analysis.positive_judgement_score);
  } catch(err) {
    stopLoader(); loader.classList.remove('show');
    resErr.textContent='Error: '+err.message; resErr.classList.add('show');
  }
}

// ── RENDER ANALYSIS ──
function renderAnalysis(query,a) {
  const L=LANG[currentLang]||LANG.en; const LB=L.labels;
  const score=Math.min(100,Math.max(0,a.positive_judgement_score||30));
  const lvl=score>=56?'high':score>=36?'medium':'low';
  const lvlLabel=score>=56?LB.above_avg:score>=36?LB.moderate:score>=21?LB.challenging:LB.very_weak;
  const ipcHtml=(a.ipc_sections||[]).map(s=>`<div class="ipc-item"><div class="ipc-top"><span class="ipc-tag">${esc(s.section)}</span><span class="ipc-title">${esc(s.title)}</span></div><div class="ipc-rel">${esc(s.relevance)}</div></div>`).join('')||'<span style="color:var(--muted);font-size:.85rem;">No specific sections identified.</span>';
  const stepsHtml=(a.next_steps||[]).map((s,i)=>`<div class="step-row"><div class="step-n">${i+1}</div><div class="step-t">${esc(s)}</div></div>`).join('');
  const docsHtml=(a.documents_required||[]).map(d=>`<div class="doc-item"><span class="doc-icon">📄</span><span class="doc-name">${esc(d)}</span></div>`).join('');
  document.getElementById('analysisOut').innerHTML=`
    <div class="analysis-topbar">
      <div class="analysis-query">"${esc(query)}"</div>
      <div class="analysis-actions">
        <button class="abtn" onclick="bookmarkCurrent()" id="bookmarkBtn2">${LB.save}</button>
        <button class="abtn" onclick="downloadPDF()">${LB.pdf}</button>
        <button class="abtn" onclick="printAnalysis()">${LB.print}</button>
        <button class="abtn" onclick="showPage('home')">${LB.home}</button>
      </div>
    </div>
    <div class="badges-row"><span class="badge badge-cat">${esc(a.category)}</span><span class="badge badge-court">${esc(a.court_level)}</span></div>
    <div class="cards-grid">
      <div class="acard full" style="animation-delay:.05s"><div class="acard-label">${LB.case_summary}</div><div class="acard-body">${esc(a.case_summary)}</div></div>
      <div class="acard" style="animation-delay:.1s">
        <div class="acard-label">${LB.judgement}</div>
        <div class="verdict-wrap">
          <div class="verdict-top"><div class="verdict-pct v-${lvl}">${score}%</div><div class="verdict-info"><span class="verdict-tag vt-${lvl}">${lvlLabel}</span><span class="verdict-court">${esc(a.court_level)}</span></div></div>
          <div class="verdict-bar-bg"><div class="verdict-bar-fill vbf-${lvl}" id="vbar" style="width:0%"></div></div>
          <div class="verdict-reason">${esc(a.positive_judgement_reason)}</div>
          ${a.base_rate_used?`<div style="margin-top:.6rem;font-size:.73rem;font-family:'JetBrains Mono',monospace;color:var(--gold);opacity:.8;">${LB.ncrb_base}: ${a.base_rate_used}% &nbsp;|&nbsp; ${LB.subtype}: ${esc(a.subtype_detected||'general')}</div>`:''}
        </div>
      </div>
      <div class="acard" style="animation-delay:.15s"><div class="acard-label">${LB.improve}</div><div class="acard-body">${esc(a.improve_chances||'—')}</div><div style="margin-top:1.1rem"><div class="acard-label" style="margin-bottom:.5rem">${LB.risks}</div><div class="acard-body">${esc(a.risks_challenges)}</div></div></div>
      <div class="acard full" style="animation-delay:.2s"><div class="acard-label">${LB.ipc}</div>${ipcHtml}</div>
      <div class="acard" style="animation-delay:.25s"><div class="acard-label">${LB.next_steps}</div><div class="steps-list">${stepsHtml}</div></div>
      <div class="acard" style="animation-delay:.3s"><div class="acard-label">${LB.court}</div><div class="acard-body">${esc(a.recommended_court)}</div><div style="margin-top:1rem"><div class="acard-label" style="margin-bottom:.5rem">${LB.timeline}</div><div class="acard-body">${esc(a.time_frame)}</div></div></div>
      <div class="acard" style="animation-delay:.35s"><div class="acard-label">${LB.arguments}</div><div class="acard-body">${esc(a.key_legal_arguments)}</div></div>
      <div class="acard" style="animation-delay:.4s"><div class="acard-label">${LB.documents}</div>${docsHtml}</div>
    </div>
    <div class="disclaimer">${LB.disclaimer}</div>`;
  setTimeout(()=>{ const bar=document.getElementById('vbar'); if(bar) bar.style.width=score+'%'; },400);
}

// ── HISTORY ──
function saveToHistory(query,category,score) {
  let h=getStorage(HISTORY_KEY);
  h.unshift({query,category,score,time:Date.now(),id:Date.now()});
  setStorage(HISTORY_KEY,h.slice(0,20));
}

function renderHistory() {
  const el=document.getElementById('historyList');
  if(!getUserId()) {
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔒</div><div style="margin-bottom:1rem;">Sign in to save &amp; view your search history</div><button class="empty-signin-btn" onclick="handleAuth()">🔐 Sign In Free</button></div>`;
    return;
  }
  const h=getStorage(HISTORY_KEY);
  if(!h.length){ el.innerHTML=`<div class="empty-state"><div class="empty-icon">🕐</div><div>${(LANG[currentLang]||LANG.en).labels.empty_history}</div></div>`; return; }
  el.innerHTML=h.map(item=>`
    <div class="hitem" onclick="rerunQuery('${esc(item.query)}')">
      <span class="hitem-icon">⚖</span>
      <div class="hitem-body"><div class="hitem-q">${esc(item.query)}</div><div class="hitem-meta">${new Date(item.time).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} · Score: ${item.score}%</div></div>
      <span class="hitem-cat">${esc(item.category||'—')}</span>
      <span class="hitem-del" onclick="deleteHistory(event,${item.id})">✕</span>
    </div>`).join('');
}

function deleteHistory(e,id){ e.stopPropagation(); setStorage(HISTORY_KEY,getStorage(HISTORY_KEY).filter(x=>x.id!==id)); renderHistory(); }
function rerunQuery(q){ document.getElementById('homeInput').value=q; doAnalysis(); }

// ── BOOKMARKS ──
function bookmarkCurrent() {
  if(!currentAnalysis||!currentQuery){ showToast('No analysis to bookmark yet.'); return; }
  if(!getUserId()){ showToast('👤 Sign in to save bookmarks!'); handleAuth(); return; }
  let b=getStorage(BOOKMARKS_KEY);
  const exists=b.find(x=>x.query===currentQuery);
  if(exists){
    setStorage(BOOKMARKS_KEY,b.filter(x=>x.query!==currentQuery));
    document.getElementById('bookmarkBtn').classList.remove('active');
    showToast('Bookmark removed.');
  } else {
    b.unshift({query:currentQuery,category:currentAnalysis.category,score:currentAnalysis.positive_judgement_score,time:Date.now(),analysis:currentAnalysis});
    setStorage(BOOKMARKS_KEY,b.slice(0,30));
    document.getElementById('bookmarkBtn').classList.add('active');
    const b2=document.getElementById('bookmarkBtn2'); if(b2) b2.classList.add('bookmarked');
    showToast('✓ Case bookmarked successfully!');
  }
}

function renderBookmarks() {
  const el=document.getElementById('bookmarksList');
  if(!getUserId()) {
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔒</div><div style="margin-bottom:1rem;">Sign in to save &amp; view your bookmarks</div><button class="empty-signin-btn" onclick="handleAuth()">🔐 Sign In Free</button></div>`;
    return;
  }
  const b=getStorage(BOOKMARKS_KEY);
  if(!b.length){ el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔖</div><div>${(LANG[currentLang]||LANG.en).labels.empty_bookmarks}</div></div>`; return; }
  el.innerHTML=b.map(item=>`
    <div class="hitem" onclick="loadBookmark('${encodeURIComponent(JSON.stringify(item))}')">
      <span class="hitem-icon">🔖</span>
      <div class="hitem-body"><div class="hitem-q">${esc(item.query)}</div><div class="hitem-meta">${new Date(item.time).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · Score: ${item.score}%</div></div>
      <span class="hitem-cat">${esc(item.category||'—')}</span>
      <span class="hitem-del" onclick="deleteBookmark(event,'${esc(item.query)}')">✕</span>
    </div>`).join('');
}

function loadBookmark(encoded){ const item=JSON.parse(decodeURIComponent(encoded)); currentQuery=item.query; currentAnalysis=item.analysis; showPage('analysis'); document.getElementById('loader').classList.remove('show'); document.getElementById('topbarInput').value=item.query; renderAnalysis(item.query,item.analysis); }
function deleteBookmark(e,query){ e.stopPropagation(); setStorage(BOOKMARKS_KEY,getStorage(BOOKMARKS_KEY).filter(x=>x.query!==query)); renderBookmarks(); }

// ── COMPARE ──
async function runCompare() {
  const a=document.getElementById('caseA').value.trim(),b=document.getElementById('caseB').value.trim();
  if(!a||!b){ showToast('Please fill in both cases.'); return; }
  document.getElementById('compareTable').innerHTML='<div style="color:var(--muted);font-size:.85rem;padding:1rem 0;">Analysing both cases…</div>';
  document.getElementById('compareResult').classList.add('show');
  try {
    const [resA,resB]=await Promise.all([fetchAnalysis(a),fetchAnalysis(b)]);
    const rows=[['Category',resA.category,resB.category],['Judgement Score',(resA.positive_judgement_score||'?')+'%',(resB.positive_judgement_score||'?')+'%'],['Recommended Court',resA.recommended_court,resB.recommended_court],['Timeline',resA.time_frame,resB.time_frame],['Key Argument',resA.key_legal_arguments,resB.key_legal_arguments],['Main Risk',resA.risks_challenges,resB.risks_challenges]];
    document.getElementById('compareTable').innerHTML=`<table class="compare-table"><thead><tr><th>Field</th><th>Case A</th><th>Case B</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(String(c||''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } catch(err){ document.getElementById('compareTable').innerHTML=`<div style="color:#f87171;font-size:.85rem;">${esc(err.message)}</div>`; }
}

async function fetchAnalysis(query){
  const data=await groqFetch({model:'llama-3.3-70b-versatile',temperature:.3,max_tokens:800,response_format:{type:'json_object'},messages:[{role:'system',content:'Legal analyst. Return JSON: category,positive_judgement_score,recommended_court,time_frame,key_legal_arguments,risks_challenges. Raw JSON only.'},{role:'user',content:query}]});
  return JSON.parse(data.choices?.[0]?.message?.content||'{}');
}

// ── GLOSSARY ──
const GLOSSARY_TERMS=[
  {word:'FIR',def:'First Information Report — document filed at police station recording a cognizable offence. Starts criminal proceedings.'},
  {word:'Bail',def:'Temporary release of an accused awaiting trial, on condition they appear in court when required.'},
  {word:'Cognizable Offence',def:'An offence where police can arrest without a warrant and investigate without court permission. E.g. murder, robbery.'},
  {word:'Non-Cognizable Offence',def:'An offence where police cannot arrest without a warrant. Court permission required to investigate.'},
  {word:'Habeas Corpus',def:'A writ requiring a person under arrest to be brought before a court. Used to challenge unlawful detention.'},
  {word:'Injunction',def:'A court order requiring a party to do or cease a specific action. Can be temporary or permanent.'},
  {word:'Affidavit',def:'A written sworn statement of facts made under oath, used as evidence in legal proceedings.'},
  {word:'Prima Facie',def:'Latin for "at first sight" — sufficient evidence to proceed to trial unless disproved.'},
  {word:'Sub Judice',def:'Matter currently under judicial consideration. Restricts public discussion to avoid prejudicing the case.'},
  {word:'Acquittal',def:'Formal judgment that the accused is not guilty, resulting in release from the charge.'},
  {word:'Caveat',def:'A notice filed in court requesting that no order be passed without hearing the person filing the caveat.'},
  {word:'Decree',def:'Formal expression of the adjudication of a court resolving the issues in a civil case.'},
  {word:'Plaintiff',def:'The party who brings a civil lawsuit against another party (the defendant) in a court of law.'},
  {word:'Defendant',def:'The party against whom a civil lawsuit or criminal charge is filed in a court.'},
  {word:'Jurisdiction',def:'The official power of a court to hear a case and make legal decisions in a given territory.'},
  {word:'Contempt of Court',def:'Behaviour that disrespects or defies the authority, justice, or dignity of a court.'},
  {word:'Writ Petition',def:'Petition filed in High Court or Supreme Court seeking enforcement of fundamental rights.'},
  {word:'Charge Sheet',def:'Document filed by police in court after investigation, formally accusing a person of a specific crime.'},
  {word:'Stay Order',def:'A court order to temporarily stop legal proceedings or enforcement of a judgment.'},
  {word:'Anticipatory Bail',def:'Bail granted before arrest. Sought when a person believes they may be arrested for a non-bailable offence.'},
  {word:'Summons',def:'An order requiring a person to appear before a court on a specified date.'},
  {word:'Alimony',def:'Financial support paid by one spouse to another after separation or divorce, ordered by court.'},
];
function renderGlossary(filter=''){ const terms=filter?GLOSSARY_TERMS.filter(t=>t.word.toLowerCase().includes(filter.toLowerCase())||t.def.toLowerCase().includes(filter.toLowerCase())):GLOSSARY_TERMS; document.getElementById('glossaryGrid').innerHTML=terms.map(t=>`<div class="gterm"><div class="gterm-word">${esc(t.word)}</div><div class="gterm-def">${esc(t.def)}</div></div>`).join('')||'<div style="color:var(--muted);">No matching terms.</div>'; }
function filterGlossary(){ renderGlossary(document.getElementById('glossaryInput').value.trim()); }

// ── HELPLINES ──
const HELPLINES=[
  {icon:'🆘',name:'National Legal Services Authority',num:'15100',desc:'Free legal aid for underprivileged citizens.',badge:'24/7 Toll Free'},
  {icon:'👮',name:'Police Emergency',num:'100',desc:'Immediate police assistance for crimes or emergencies.',badge:'Emergency'},
  {icon:'👩',name:"Women's Helpline",num:'1091',desc:'National helpline for women in distress, domestic violence.',badge:'24/7 Free'},
  {icon:'👧',name:'Child Helpline (CHILDLINE)',num:'1098',desc:'Emergency services for children needing care and protection.',badge:'24/7 Free'},
  {icon:'⚖',name:'Supreme Court Legal Aid',num:'011-23388922',desc:'Legal aid services at Supreme Court of India level.',badge:'Free Aid'},
  {icon:'🧓',name:'Senior Citizen Helpline',num:'14567',desc:'Elder care helpline for abuse, neglect, and legal assistance.',badge:'24/7 Free'},
  {icon:'🏥',name:'Cyber Crime',num:'1930',desc:'Report cyber fraud, online harassment, financial scams.',badge:'Free'},
  {icon:'🔥',name:'Consumer Helpline',num:'1800-11-4000',desc:'File consumer complaints about defective products, services.',badge:'Toll Free'},
  {icon:'🏠',name:'Anti-Corruption (CBI)',num:'1800-11-2211',desc:'Report corruption by government officials.',badge:'Toll Free'},
  {icon:'📋',name:'Human Rights Commission',num:'14433',desc:'Report human rights violations, police brutality.',badge:'Free'},
  {icon:'💼',name:'Labour Helpline',num:'1800-425-1071',desc:'Complaints about labour law violations, unpaid wages.',badge:'Toll Free'},
  {icon:'🚨',name:'Anti-Human Trafficking',num:'1800-419-8588',desc:'Report trafficking, forced labour, child exploitation.',badge:'24/7 Free'},
];
function renderHelplines(){ document.getElementById('helplinesGrid').innerHTML=HELPLINES.map(h=>`<div class="hline-card"><div class="hline-icon">${h.icon}</div><div class="hline-name">${esc(h.name)}</div><div class="hline-num">${esc(h.num)}</div><div class="hline-desc">${esc(h.desc)}</div><div class="hline-badge">${esc(h.badge)}</div></div>`).join(''); }

// ── PDF / PRINT ──
function buildPrintHTML() {
  const a=currentAnalysis; if(!a) return '';
  const score=a.positive_judgement_score||0;
  const lvlLabel=score>55?'Above Average':score>=35?'Moderate':'Challenging';
  const ipcRows=(a.ipc_sections||[]).map(s=>`<tr><td><b>${s.section}</b> — ${s.title}</td><td>${s.relevance}</td></tr>`).join('');
  const steps=(a.next_steps||[]).map((s,i)=>`<div style="display:flex;gap:8px;margin-bottom:8px;"><span style="background:#1a2744;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${i+1}</span><span>${s}</span></div>`).join('');
  const docs=(a.documents_required||[]).map(d=>`<div style="padding:5px 0;border-bottom:1px solid #eee;">▸ ${d}</div>`).join('');
  const col=score>55?'#1a6b3a':score>=35?'#b8720a':'#c0392b';
  return `<div style="border-bottom:3px solid #1a2744;padding-bottom:12px;margin-bottom:20px;"><div style="font-size:11px;color:#a07828;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">LexAI Legal Analysis</div><div style="font-size:1.3rem;font-style:italic;color:#1a1a1a;">"${escH(currentQuery)}"</div><div style="margin-top:8px;font-size:11px;"><span style="background:#eef2ff;border:1px solid #bcd;padding:2px 8px;border-radius:3px;margin-right:6px;">${escH(a.category)}</span><span style="background:#fef9ec;border:1px solid #dcc;padding:2px 8px;border-radius:3px;">${escH(a.court_level)}</span></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;"><div style="border:1px solid #ddd;border-radius:6px;padding:14px;grid-column:1/-1;"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:8px;">📋 Case Summary</div><div style="font-size:13px;line-height:1.7;color:#333;">${escH(a.case_summary)}</div></div><div style="border:1px solid #ddd;border-radius:6px;padding:14px;"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:8px;">⚖ Judgement</div><div style="font-size:2.8rem;font-weight:900;color:${col};line-height:1;">${score}%</div><div style="font-size:12px;color:#555;margin-bottom:8px;">${lvlLabel}</div><div style="background:#eee;height:5px;border-radius:3px;margin-bottom:10px;"><div style="background:${col};height:5px;width:${score}%;border-radius:3px;"></div></div><div style="font-size:12px;color:#555;line-height:1.6;">${escH(a.positive_judgement_reason)}</div></div><div style="border:1px solid #ddd;border-radius:6px;padding:14px;"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:8px;">💡 Improve Chances</div><div style="font-size:13px;line-height:1.7;color:#333;">${escH(a.improve_chances||'')}</div><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin:10px 0 6px;">⚠ Risks</div><div style="font-size:13px;line-height:1.7;color:#333;">${escH(a.risks_challenges)}</div></div></div>
  <div style="border:1px solid #ddd;border-radius:6px;padding:14px;margin-bottom:12px;"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:10px;">📖 IPC / Legal Sections</div><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#1a2744;color:#fff;"><th style="padding:6px 10px;text-align:left;">Section</th><th style="padding:6px 10px;text-align:left;">Relevance</th></tr></thead><tbody>${ipcRows}</tbody></table></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;"><div style="border:1px solid #ddd;border-radius:6px;padding:14px;"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:10px;">🗺 Next Steps</div>${steps}</div><div style="border:1px solid #ddd;border-radius:6px;padding:14px;"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:10px;">📁 Documents</div>${docs}</div></div>
  <div style="border:1px solid #ddd;border-radius:6px;padding:14px;margin-bottom:12px;"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:6px;">🏛 Court &amp; Timeline</div><div style="font-size:13px;color:#333;">${escH(a.recommended_court)} — ${escH(a.time_frame)}</div></div>
  <div style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;line-height:1.6;">⚠ Not legal advice. Consult a qualified advocate.</div>`;
}

function escH(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function downloadPDF(){
  if(!currentAnalysis){ showToast('No analysis to download yet.'); return; }
  const container=document.createElement('div');
  container.innerHTML=`<div style="font-family:Georgia,serif;max-width:900px;margin:1rem auto;color:#111;font-size:13px;line-height:1.6;padding:1rem;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:2px solid #1a2744;"><div><div style="font-size:1.6rem;font-weight:900;color:#1a2744;">LexAI</div><div style="font-size:11px;color:#888;letter-spacing:1px;">AI LEGAL INTELLIGENCE</div></div><div style="text-align:right;font-size:11px;color:#888;">Generated: ${new Date().toLocaleDateString('en-IN',{dateStyle:'long'})}</div></div>${buildPrintHTML()}</div>`;
  const opt={margin:[0.5,0.5,0.5,0.5],filename:'LexAI_Analysis.pdf',image:{type:'jpeg',quality:.98},html2canvas:{scale:2},jsPDF:{unit:'in',format:'a4',orientation:'portrait'}};
  showToast('Generating PDF…');
  if(typeof html2pdf==='function'){ html2pdf().set(opt).from(container).save().then(()=>showToast('PDF downloaded!')).catch(()=>showToast('PDF failed.')); }
  else { showToast('html2pdf not loaded. Add script tag.'); }
}

function printAnalysis(){
  if(!currentAnalysis){ showToast('No analysis to print yet.'); return; }
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>LexAI</title><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Georgia,serif;max-width:900px;margin:2rem auto;color:#111;font-size:13px;line-height:1.6;padding:1rem;}@page{margin:1.5cm;}</style></head><body>${buildPrintHTML()}</body></html>`);
  win.document.close(); setTimeout(()=>{ win.focus(); win.print(); },600);
}

// ── UTILS ──
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── INIT ──
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('homeInput').addEventListener('keydown',e=>{ if(e.key==='Enter') doAnalysis(); });
  updateArrows();
});
