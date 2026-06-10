/* CGN Whole-Page Dynamic Translation v10.4.0 Alpha
   English remains the only stored and canonical article edition. */
(function(){
  "use strict";
  const ALL={en:["English","en","en"],fr:["Français","fr","fr"],es:["Español","es","es"],de:["Deutsch","de","de"],it:["Italiano","it","it"],pt:["Português","pt","pt-PT"],"pt-br":["Português (Brasil)","pt","pt-BR"],pl:["Polski","pl","pl"],ro:["Română","ro","ro"],nl:["Nederlands","nl","nl"],uk:["Українська","uk","uk"],"zh-hant":["繁體中文","zh-TW","zh-Hant"],"zh-hans":["简体中文","zh-CN","zh-Hans"],fil:["Filipino","tl","fil"],ceb:["Cebuano","ceb","ceb"],hi:["हिन्दी","hi","hi"],mr:["मराठी","mr","mr"]};
  const HOSTS={
    "london.cgnnews.net":["en","fr","es","de","it","pt","pl","ro","nl","uk"],
    "sydney.cgnnews.net":["en"],
    "rio.cgnnews.net":["en","es","pt-br","pt"],
    "hongkong.cgnnews.net":["en","zh-hant","zh-hans"],
    "manila.cgnnews.net":["en","fil","es","ceb"],
    "mumbai.cgnnews.net":["en","hi","mr"]
  };
  const hostname=location.hostname.toLowerCase();
  const supported=HOSTS[hostname]||Object.keys(ALL);
  const key="cgn_dynamic_language";
  const cookie="googtrans";
  const engineId="google_translate_element";
  const isBureau=!!HOSTS[hostname];
  const originalLang=document.documentElement.lang||"en";
  const params=new URLSearchParams(location.search);
  function valid(v){v=String(v||"").toLowerCase().replace(/_/g,"-");return supported.includes(v)?v:"";}
  let active=valid(params.get("lang"))||valid(localStorage.getItem(key))||"en";
  function setCookie(value,expired){
    const base=`${cookie}=${value};path=/;SameSite=Lax${location.protocol==="https:"?";Secure":""}${expired?`;expires=${expired}`:";max-age=31536000"}`;
    document.cookie=base;
    if(hostname==="cgnnews.net"||hostname.endsWith(".cgnnews.net")) document.cookie=base+";domain=.cgnnews.net";
  }
  function clearCookie(){setCookie("","Thu, 01 Jan 1970 00:00:00 GMT");}
  function canonicalEnglishUrl(){const u=new URL(location.href);u.searchParams.delete("lang");return u.pathname+u.search+u.hash;}
  function writeState(lang){
    const u=new URL(location.href);
    if(lang==="en") u.searchParams.delete("lang"); else u.searchParams.set("lang",lang);
    history.replaceState({},"",u.pathname+u.search+u.hash);
  }
  function choose(lang){
    lang=valid(lang)||"en";
    if(lang==="en"){
      localStorage.removeItem(key); clearCookie(); writeState("en");
      if(active!=="en") location.replace(canonicalEnglishUrl());
      else {document.documentElement.lang=originalLang; updateUi("en","English edition.");}
      return;
    }
    active=lang; localStorage.setItem(key,lang); writeState(lang); startTranslation();
  }
  function languageFromLink(a){
    const direct=valid(a.dataset.cgnLanguageLink||a.dataset.language||a.dataset.lang||a.getAttribute("lang"));
    if(direct) return direct;
    try{const p=new URL(a.href,location.href).pathname.split("/").filter(Boolean)[0];return valid(p);}catch(e){return "";}
  }
  function bindExistingControls(){
    document.addEventListener("click",function(e){
      const a=e.target.closest("[data-cgn-language-link],[data-language],[data-lang],.language-switcher a,.language-box a,.language-bar a");
      if(!a) return; const lang=languageFromLink(a); if(!lang) return;
      e.preventDefault(); choose(lang);
    },true);
    document.addEventListener("change",function(e){
      const el=e.target;if(!el.matches("select[data-cgn-language],#cgn-language-select,#cgn-legal-language-selector select")) return;
      choose(el.value);
    },true);
  }
  function addBar(){
    if(isBureau||document.getElementById("cgn-dynamic-language-bar")) return;
    const bar=document.createElement("section");bar.id="cgn-dynamic-language-bar";bar.className="notranslate";bar.setAttribute("translate","no");
    bar.innerHTML=`<strong>Language:</strong><select id="cgn-language-select" data-cgn-language aria-label="Translate this page">${supported.map(c=>`<option value="${c}"${c===active?" selected":""}>${ALL[c][0]}</option>`).join("")}</select><span>English is the canonical edition.</span><span id="cgn-translation-status" aria-live="polite"></span><div id="${engineId}" aria-hidden="true"></div>`;
    const style=document.createElement("style");style.textContent="#cgn-dynamic-language-bar{box-sizing:border-box;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 18px;background:#eef3f9;border-bottom:1px solid #c7d2e2;color:#07172f;font:700 13px Arial,sans-serif}#cgn-dynamic-language-bar select{padding:7px;border:1px solid #9aa9bd;background:#fff}#cgn-translation-status{font-weight:500;color:#475467}.goog-te-banner-frame.skiptranslate,.goog-te-banner-frame{display:none!important}body{top:0!important}.goog-logo-link,.goog-te-gadget span{display:none!important}";
    document.head.appendChild(style);
    const host=document.getElementById("cgn-site-header")||document.querySelector("header");
    if(host) host.insertAdjacentElement("afterend",bar); else document.body.insertAdjacentElement("afterbegin",bar);
  }
  function updateUi(lang,msg){
    document.querySelectorAll("[data-cgn-language-link]").forEach(a=>a.setAttribute("aria-current",languageFromLink(a)===lang?"page":"false"));
    const sel=document.getElementById("cgn-language-select");if(sel) sel.value=lang;
    const st=document.getElementById("cgn-translation-status");if(st) st.textContent=msg||"";
  }
  function applyCombo(){
    const combo=document.querySelector("select.goog-te-combo");
    if(!combo) return false;
    const code=ALL[active][1]; if(combo.value!==code){combo.value=code;combo.dispatchEvent(new Event("change",{bubbles:true}));}
    updateUi(active,`Translated to ${ALL[active][0]}.`);return true;
  }
  function startTranslation(){
    if(active==="en"){clearCookie();document.documentElement.lang=originalLang;updateUi("en","English edition.");return;}
    setCookie(`/en/${ALL[active][1]}`);document.documentElement.lang=ALL[active][2];updateUi(active,`Translating to ${ALL[active][0]}…`);
    window.googleTranslateElementInit=function(){new google.translate.TranslateElement({pageLanguage:"en",includedLanguages:[...new Set(supported.filter(x=>x!=="en").map(x=>ALL[x][1]))].join(","),autoDisplay:false,multilanguagePage:false},engineId);let n=0;const t=setInterval(()=>{if(applyCombo()||++n>120)clearInterval(t);},100);};
    if(window.google&&window.google.translate){window.googleTranslateElementInit();return;}
    if(!document.querySelector("script[data-cgn-google-translate]")){const s=document.createElement("script");s.async=true;s.defer=true;s.dataset.cgnGoogleTranslate="1";s.src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";document.head.appendChild(s);}
  }
  function observeDynamicContent(){
    let timer=0;new MutationObserver(()=>{if(active==="en")return;clearTimeout(timer);timer=setTimeout(applyCombo,250);}).observe(document.documentElement,{childList:true,subtree:true});
  }
  function init(){bindExistingControls();addBar();startTranslation();observeDynamicContent();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
