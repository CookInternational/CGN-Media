(function(){
  "use strict";

  // CGN Media Shell v1.0.0
  // 07 June 2026
  // Derived from CGN Shell v8.3.3-Alpha for subdomain-safe absolute navigation.
  const CGN_MAIN_SITE = "https://www.cgnnews.net";
  const CGN_DEFAULT_API_BASE = "https://script.google.com/macros/s/AKfycbx41mQg-Ine3XZ-VrMI_SaQn4_K6cDQHA0cBFyGPgupu_edNFoNRjSLv2hoSe_bOytt/exec";
  const CGN_BUREAU_ROTATION_MS = 7000;
  const CGN_BUREAU_WEATHER_REFRESH_MS = 10 * 60 * 1000;

  const CGN_BUREAU_CITIES = [
    {name:"Indianapolis",latitude:39.7684,longitude:-86.1581,timeZone:"America/Indiana/Indianapolis"},
    {name:"Chicago",latitude:41.8781,longitude:-87.6298,timeZone:"America/Chicago"},
    {name:"London",latitude:51.5072,longitude:-0.1276,timeZone:"Europe/London"},
    {name:"Sydney",latitude:-33.8688,longitude:151.2093,timeZone:"Australia/Sydney"},
    {name:"Hong Kong",latitude:22.3193,longitude:114.1694,timeZone:"Asia/Hong_Kong"},
    {name:"Rio de Janeiro",latitude:-22.9068,longitude:-43.1729,timeZone:"America/Sao_Paulo"},
    {name:"Manila",latitude:14.5995,longitude:120.9842,timeZone:"Asia/Manila"},
    {name:"Mumbai",latitude:19.0760,longitude:72.8777,timeZone:"Asia/Kolkata"}
  ];

  let bureauIndex = 0;
  let clockTimer = null;
  let rotationTimer = null;
  let weatherTimer = null;
  let headlineTimer = null;
  const weatherCache = {};

  function main(path){
    const value = String(path || "/");
    return CGN_MAIN_SITE + (value.startsWith("/") ? value : "/" + value);
  }

  function normalizeApiBase(value){
    return String(value || "").trim().replace(/\?+$/, "");
  }

  function getApiBase(){
    const meta = document.querySelector('meta[name="cgn-api-base"]');
    const metaValue = meta ? meta.getAttribute("content") : "";
    const stored = localStorage.getItem("cgn_api_base") || "";
    const windowValue = window.CGN_API_BASE || "";
    return normalizeApiBase(windowValue || metaValue || stored || CGN_DEFAULT_API_BASE);
  }

  const CGN_API_BASE = getApiBase();
  const CGN_ARTICLES_URL = CGN_API_BASE + "?action=articles";
  window.CGN_API_BASE = CGN_API_BASE;
  window.CGN_API_URL = CGN_API_BASE;
  window.CGN_CONFIG = Object.assign(window.CGN_CONFIG || {}, {
    apiBase:CGN_API_BASE,
    apiUrl:CGN_API_BASE,
    googleAppsScriptWebAppUrl:CGN_API_BASE,
    mainSite:CGN_MAIN_SITE
  });

  function safeText(value){
    return String(value || "").replace(/[&<>"']/g, function(char){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char];
    });
  }

  function getUser(){
    return localStorage.getItem("user_id") || "";
  }

  function updateAccountUI(){
    const button = document.getElementById("account-btn");
    if(!button) return;
    button.textContent = getUser() ? "Account" : "Login";
    button.setAttribute("aria-label", getUser() ? "CGN News account" : "Login or create CGN News account");
  }

  function logoutUser(){
    localStorage.removeItem("user_id");
    localStorage.removeItem("subscriber");
    const menu = document.getElementById("account-menu");
    if(menu) menu.classList.remove("open");
    updateAccountUI();
  }

  function setLoginMessage(message){
    const element = document.getElementById("cgn-shell-login-message");
    if(element) element.textContent = message || "";
  }

  function renderLoginModal(){
    let modal = document.getElementById("login-modal");
    if(modal) return modal;

    modal = document.createElement("div");
    modal.id = "login-modal";
    modal.className = "cgn-shell-login-modal cgn-shell-login-closed";
    modal.hidden = true;
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-labelledby","cgn-shell-login-title");
    modal.setAttribute("aria-hidden","true");
    modal.innerHTML = `
      <div class="cgn-shell-login-card">
        <h3 id="cgn-shell-login-title">Account Access</h3>
        <p class="cgn-shell-login-note">Create a free account to unlock 6 free articles. Subscribers get unlimited access.</p>
        <label class="sr-only" for="login-email">Email</label>
        <input id="login-email" class="cgn-shell-login-input" type="email" placeholder="Email" autocomplete="email">
        <label class="sr-only" for="login-password">Password</label>
        <input id="login-password" class="cgn-shell-login-input" type="password" placeholder="Password" autocomplete="current-password">
        <div id="cgn-shell-login-message" class="cgn-shell-login-message" aria-live="polite"></div>
        <div class="cgn-shell-login-actions">
          <button type="button" id="cgn-login-submit">Login</button>
          <button type="button" id="cgn-signup-submit">Create Account</button>
        </div>
        <p class="cgn-shell-login-reset"><a href="${main("/reset-password/")}">Forgot Password?</a></p>
        <button type="button" class="cgn-shell-login-close" id="cgn-login-close">Close</button>
      </div>`;

    modal.addEventListener("click", function(event){
      if(event.target === modal) closeLogin();
    });
    document.body.appendChild(modal);
    document.getElementById("cgn-login-submit").addEventListener("click", loginUser);
    document.getElementById("cgn-signup-submit").addEventListener("click", signupUser);
    document.getElementById("cgn-login-close").addEventListener("click", closeLogin);
    return modal;
  }

  function openLogin(){
    const modal = renderLoginModal();
    modal.hidden = false;
    modal.classList.remove("cgn-shell-login-closed");
    modal.classList.add("cgn-shell-login-open");
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("cgn-shell-login-is-open");
    setLoginMessage("");
    const email = document.getElementById("login-email");
    if(email) setTimeout(function(){email.focus();},50);
  }

  function closeLogin(){
    const modal = document.getElementById("login-modal");
    if(!modal) return;
    modal.classList.remove("cgn-shell-login-open");
    modal.classList.add("cgn-shell-login-closed");
    modal.setAttribute("aria-hidden","true");
    modal.hidden = true;
    document.body.classList.remove("cgn-shell-login-is-open");
  }

  async function authRequest(action){
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    if(!email || !password){
      setLoginMessage("Enter email and password.");
      return;
    }

    setLoginMessage(action === "login" ? "Logging in..." : "Creating account...");
    try{
      const response = await fetch(`${CGN_API_BASE}?action=${action}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`);
      const data = await response.json();
      if(data && data.success){
        const userId = data.user_id || data.userId || (data.user && (data.user.user_id || data.user.id)) || "";
        if(userId) localStorage.setItem("user_id",userId);
        if(data.subscriber || (data.user && data.user.subscriber)) localStorage.setItem("subscriber","true");
        else localStorage.removeItem("subscriber");
        closeLogin();
        updateAccountUI();
        document.dispatchEvent(new CustomEvent(action === "login" ? "cgn:login" : "cgn:signup",{detail:data}));
        return;
      }
      setLoginMessage((data && (data.error || data.message)) || (action === "login" ? "Login failed." : "Signup failed."));
    }catch(error){
      console.error("CGN account error:",error);
      setLoginMessage("Unable to complete the request right now.");
    }
  }

  function loginUser(){return authRequest("login");}
  function signupUser(){return authRequest("signup");}
  window.openLogin = openLogin;
  window.closeLogin = closeLogin;
  window.loginUser = loginUser;
  window.signupUser = signupUser;
  window.CGN_OPEN_LOGIN = openLogin;

  function weatherInfo(code){
    const value = Number(code);
    if(value === 0) return {icon:"☀️",text:"Clear"};
    if([1,2,3].includes(value)) return {icon:"🌤",text:"Partly Cloudy"};
    if([45,48].includes(value)) return {icon:"🌫",text:"Fog"};
    if([51,53,55,56,57].includes(value)) return {icon:"🌦",text:"Drizzle"};
    if([61,63,65,66,67,80,81,82].includes(value)) return {icon:"🌧",text:"Rain"};
    if([71,73,75,77,85,86].includes(value)) return {icon:"❄️",text:"Snow"};
    if([95,96,99].includes(value)) return {icon:"⛈",text:"Storm"};
    return {icon:"🌤",text:"Weather"};
  }

  function normalizeZone(city,label){
    const raw = String(label || "").trim();
    if(city.timeZone === "America/Indiana/Indianapolis") return raw.includes("-4") ? "EDT" : raw.includes("-5") ? "EST" : (raw || "ET");
    if(city.timeZone === "America/Chicago") return raw.includes("-5") ? "CDT" : raw.includes("-6") ? "CST" : (raw || "CT");
    if(city.timeZone === "Europe/London") return raw.includes("+1") ? "BST" : "GMT";
    if(city.timeZone === "Australia/Sydney") return raw.includes("+11") ? "AEDT" : "AEST";
    if(city.timeZone === "Asia/Hong_Kong") return "HKT";
    if(city.timeZone === "America/Sao_Paulo") return "BRT";
    if(city.timeZone === "Asia/Manila") return "PHT";
    if(city.timeZone === "Asia/Kolkata") return "IST";
    return raw;
  }

  function localParts(city){
    const parts = new Intl.DateTimeFormat("en-US",{
      day:"2-digit",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",
      hour12:true,timeZone:city.timeZone,timeZoneName:"short"
    }).formatToParts(new Date());
    const map = {};
    parts.forEach(function(part){map[part.type]=part.value;});
    const zone = normalizeZone(city,map.timeZoneName);
    return {
      date:`${map.day} ${map.month} ${map.year}`,
      clock:`${map.hour}:${map.minute}:${map.second} ${map.dayPeriod || ""} ${zone}`.replace(/\s+/g," ").trim()
    };
  }

  function activeCity(){return CGN_BUREAU_CITIES[bureauIndex] || CGN_BUREAU_CITIES[0];}

  function updateDateTime(){
    const city = activeCity();
    const time = localParts(city);
    const weather = weatherCache[city.name];
    const weatherText = weather && !weather.error ? `${weather.icon} ${weather.tempF}°F · ${weather.text}` : "🌤 --°F · Weather updating";
    const compact = weather && !weather.error ? `${weather.icon} ${weather.tempF}°` : "🌤 --°";

    const timeElement = document.getElementById("cgn-bureau-time");
    const weatherElement = document.getElementById("cgn-bureau-weather");
    const locationElement = document.getElementById("cgn-bureau-location");
    const mobileLine = document.getElementById("cgn-bureau-mobile-line");
    const mobileWeather = document.getElementById("cgn-mobile-weather-compact");

    if(timeElement) timeElement.innerHTML = `${safeText(time.date)}<br>${safeText(time.clock)}`;
    if(weatherElement) weatherElement.textContent = weatherText;
    if(locationElement) locationElement.textContent = city.name;
    if(mobileWeather) mobileWeather.textContent = compact;
    if(mobileLine) mobileLine.innerHTML = `<span>${safeText(time.date)}</span><span>${safeText(time.clock)}</span><span>${safeText(city.name)}</span>`;
  }

  async function loadWeather(city){
    try{
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(city.latitude)}&longitude=${encodeURIComponent(city.longitude)}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`;
      const response = await fetch(url,{cache:"no-store"});
      if(!response.ok) throw new Error("Weather response " + response.status);
      const data = await response.json();
      const current = data && data.current;
      if(!current || current.temperature_2m === undefined) throw new Error("Missing weather");
      const info = weatherInfo(current.weather_code);
      weatherCache[city.name] = {tempF:Math.round(Number(current.temperature_2m)),icon:info.icon,text:info.text,error:false,fetchedAt:Date.now()};
    }catch(error){
      weatherCache[city.name] = {tempF:"--",icon:"🌤",text:"Weather updating",error:true,fetchedAt:Date.now()};
    }
    if(city.name === activeCity().name) updateDateTime();
  }

  function loadAllWeather(){CGN_BUREAU_CITIES.forEach(loadWeather);}
  function rotateCity(){
    bureauIndex = (bureauIndex + 1) % CGN_BUREAU_CITIES.length;
    updateDateTime();
    const city = activeCity();
    const weather = weatherCache[city.name];
    if(!weather || Date.now() - Number(weather.fetchedAt || 0) > CGN_BUREAU_WEATHER_REFRESH_MS) loadWeather(city);
  }

  function initWeather(){
    if(clockTimer) clearInterval(clockTimer);
    if(rotationTimer) clearInterval(rotationTimer);
    if(weatherTimer) clearInterval(weatherTimer);
    updateDateTime();
    loadAllWeather();
    clockTimer = setInterval(updateDateTime,1000);
    rotationTimer = setInterval(rotateCity,CGN_BUREAU_ROTATION_MS);
    weatherTimer = setInterval(loadAllWeather,CGN_BUREAU_WEATHER_REFRESH_MS);
  }

  function articleTime(article){
    const raw = article && (article.published_at || article.updated_at || article.date || article.created_at);
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function articleUrl(article){
    const existing = String((article && article.url) || "").trim();
    if(existing) return existing.startsWith("http") ? existing : main(existing.startsWith("/") ? existing : "/" + existing);
    const slug = String((article && article.slug) || "cgn-news-update").trim();
    const date = articleTime(article) ? new Date(articleTime(article)) : new Date();
    return main(`/news/${date.getUTCFullYear()}/${String(date.getUTCMonth()+1).padStart(2,"0")}/${String(date.getUTCDate()).padStart(2,"0")}/${slug}/`);
  }

  function startTicker(articles){
    const ticker = document.getElementById("cgn-shell-ticker");
    if(!ticker) return;
    const list = Array.isArray(articles) ? articles.slice().sort(function(a,b){return articleTime(b)-articleTime(a);}) : [];
    if(!list.length){
      ticker.innerHTML = `<a href="${main("/news/")}">BREAKING: CGN News</a>`;
      return;
    }
    let index = 0;
    function show(){
      const article = list[index];
      ticker.innerHTML = `<a href="${articleUrl(article)}">BREAKING: ${safeText(article.title || "CGN News")}</a>`;
      index = (index + 1) % list.length;
    }
    if(headlineTimer) clearInterval(headlineTimer);
    show();
    headlineTimer = setInterval(show,5000);
  }

  async function loadTicker(){
    try{
      const response = await fetch(CGN_ARTICLES_URL);
      const data = await response.json();
      startTicker(data);
    }catch(error){
      startTicker([]);
    }
  }

  function socialIcon(type){
    if(type === "instagram") return '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2C4.243 2 2 4.243 2 7v10c0 2.757 2.243 5 5 5h10c2.757 0 5-2.243 5-5V7c0-2.757-2.243-5-5-5H7zm0 2h10c1.654 0 3 1.346 3 3v10c0 1.654-1.346 3-3 3H7c-1.654 0-3-1.346-3-3V7c0-1.654 1.346-3 3-3zm5 2.8A5.2 5.2 0 006.8 12 5.2 5.2 0 0012 17.2 5.2 5.2 0 0017.2 12 5.2 5.2 0 0012 6.8zm0 2A3.2 3.2 0 0115.2 12 3.2 3.2 0 0112 15.2 3.2 3.2 0 018.8 12 3.2 3.2 0 0112 8.8zm4.5-2.3a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z"/></svg>';
    if(type === "x") return '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2H21l-6.56 7.5L22 22h-6.828l-5.35-7.01L3.5 22H1l7.03-8.03L2 2h6.914l4.83 6.37L18.244 2zM17.15 20h1.52L7.03 4H5.4l11.75 16z"/></svg>';
    return '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.376.505A3.016 3.016 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.376-.505a3.016 3.016 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.75 15.568V8.432L15.818 12 9.75 15.568z"/></svg>';
  }

  function renderHeader(){
    const mount = document.getElementById("cgn-site-header");
    if(!mount) return;
    mount.innerHTML = `
      <header class="top-bar">
        <a href="${main("/")}" class="brand-link" aria-label="CGN News homepage">
          <img src="${main("/CGNNewsLogo01.png")}" class="logo" alt="CGN News" width="300" height="130">
          <span class="network-name">Cook Global News Network</span>
        </a>

        <nav class="nav" aria-label="Main Navigation">
          <a href="${main("/category/world/")}">World</a>
          <a href="${main("/category/politics/")}">Politics</a>
          <a href="${main("/category/business/")}">Business</a>
          <a href="${main("/category/markets/")}">Markets</a>
          <a href="${main("/category/technology/")}">Technology</a>
          <span class="nav-more">
            <button class="nav-more-button" type="button" aria-label="More CGN News categories" aria-haspopup="true" aria-expanded="false">▾</button>
            <span class="nav-dropdown" role="menu">
              <a href="${main("/category/entertainment/")}">Entertainment</a>
              <a href="${main("/category/environment/")}">Environment</a>
              <a href="${main("/category/energy/")}">Energy</a>
              <a href="${main("/category/opinion/")}">Opinion</a>
              <a href="${main("/category/local/")}">Local</a>
              <a href="${main("/investigations/")}">Investigations</a>
              <a href="${main("/special-reports/")}">Special Reports</a>
              <a href="${main("/category/religion-and-spirituality/")}">Religion &amp; Spirituality</a>
              <a href="${main("/news/")}">View All News</a>
            </span>
          </span>
        </nav>

        <div class="right-tools">
          <span class="account-wrap">
            <a href="#" id="account-btn">Login</a>
            <span id="account-menu" class="account-menu" aria-label="Account menu">
              <a href="${main("/account/")}">Account</a>
              <button type="button" id="account-logout-btn">Logout</button>
            </span>
          </span>

          <a id="cgn-bureau-weather-time" class="cgn-bureau-weather-time" href="${main("/weather/")}" aria-label="Open CGN Weather">
            <span id="cgn-bureau-mobile-line" class="cgn-bureau-mobile-line"><span>Loading date...</span><span>Loading time...</span><span>Indianapolis</span></span>
            <span id="cgn-bureau-time" class="cgn-bureau-time">Loading local time...</span>
            <span id="cgn-bureau-weather" class="cgn-bureau-weather">🌤 Loading weather...</span>
            <span id="cgn-bureau-location" class="cgn-bureau-location">Indianapolis</span>
          </a>

          <a id="cgn-mobile-weather-mini" class="cgn-mobile-weather-mini" href="${main("/weather/")}" aria-label="Open CGN Weather">
            <span id="cgn-mobile-weather-compact">🌤 --°F</span>
          </a>

          <a class="news-directory-link" href="${main("/news/")}" aria-label="CGN News directory">
            <span class="news-directory-icon" aria-hidden="true"><strong>NEWS</strong><span>▤</span></span>
          </a>

          <a class="sports-center-link" href="${main("/sports/")}" aria-label="CGN Sports Center">
            <img src="${main("/CGNSportsCenterIcon01.png")}" alt="" width="30" height="30">
            <span>Sports</span>
          </a>

          <a href="${main("/support/")}" class="cgn-help-link" aria-label="Open CGN Technical Support"><strong>?</strong><span>Help?</span></a>
          <a href="https://instagram.com/cookglobalnews" target="_blank" rel="noopener" aria-label="CGN News on Instagram">${socialIcon("instagram")}</a>
          <a href="https://x.com/CookGlobalNews" target="_blank" rel="noopener" aria-label="CGN News on X">${socialIcon("x")}</a>
          <a href="https://youtube.com/@CookGlobalNews" target="_blank" rel="noopener" aria-label="CGN News on YouTube">${socialIcon("youtube")}</a>
          <a href="${main("/editor/")}" class="editor-portal-link" aria-label="Open CGN Editor Portal"><span aria-hidden="true">✎</span></a>
        </div>
      </header>

      <div class="ticker" id="cgn-shell-ticker"><a href="${main("/news/")}">Loading headlines...</a></div>

      <section class="market-ticker-wrap" aria-label="CGN Market Watch live stock ticker">
        <a class="market-ticker-click" href="${main("/category/markets/market-watch/")}" aria-label="Open CGN Market Watch">Open CGN Market Watch</a>
        <div class="market-ticker-live">
          <span class="market-ticker-label">Market Watch</span>
          <div class="market-tv-ticker cgn-shell-market-tv" aria-hidden="true">
            <div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div>
          </div>
        </div>
      </section>`;

    const accountButton = document.getElementById("account-btn");
    if(accountButton) accountButton.addEventListener("click",function(event){
      event.preventDefault();
      if(!getUser()){openLogin();return;}
      const menu = document.getElementById("account-menu");
      if(menu) menu.classList.toggle("open");
    });

    const logoutButton = document.getElementById("account-logout-btn");
    if(logoutButton) logoutButton.addEventListener("click",logoutUser);

    const moreButton = mount.querySelector(".nav-more-button");
    if(moreButton) moreButton.addEventListener("click",function(event){
      event.preventDefault();
      event.stopPropagation();
      const wrapper = event.currentTarget.closest(".nav-more");
      const open = wrapper && wrapper.classList.toggle("open");
      event.currentTarget.setAttribute("aria-expanded",open ? "true" : "false");
    });

    updateAccountUI();
    initWeather();
    loadTicker();
    renderMarketTicker();
  }

  function renderMarketTicker(){
    const container = document.querySelector(".cgn-shell-market-tv .tradingview-widget-container");
    if(!container || container.querySelector("script")) return;
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.text = JSON.stringify({
      symbols:[
        {description:"Apple",proName:"NASDAQ:AAPL"},{description:"Microsoft",proName:"NASDAQ:MSFT"},
        {description:"Nvidia",proName:"NASDAQ:NVDA"},{description:"Amazon",proName:"NASDAQ:AMZN"},
        {description:"Alphabet",proName:"NASDAQ:GOOGL"},{description:"Meta",proName:"NASDAQ:META"},
        {description:"Tesla",proName:"NASDAQ:TSLA"},{description:"JPMorgan",proName:"NYSE:JPM"},
        {description:"Walmart",proName:"NYSE:WMT"},{description:"Exxon Mobil",proName:"NYSE:XOM"}
      ],
      showSymbolLogo:true,isTransparent:true,displayMode:"regular",colorTheme:"dark",locale:"en"
    });
    container.appendChild(script);
  }

  function footerSocial(){
    return `<div class="footer-social">
      <a href="https://instagram.com/cookglobalnews" target="_blank" rel="noopener" aria-label="CGN News on Instagram">${socialIcon("instagram")}</a>
      <a href="https://x.com/CookGlobalNews" target="_blank" rel="noopener" aria-label="CGN News on X">${socialIcon("x")}</a>
      <a href="https://youtube.com/@CookGlobalNews" target="_blank" rel="noopener" aria-label="CGN News on YouTube">${socialIcon("youtube")}</a>
    </div>`;
  }

  function renderFooter(){
    const mount = document.getElementById("cgn-site-footer");
    if(!mount) return;
    mount.innerHTML = `
      <footer class="footer">
        <div class="footer-container">
          <div>
            <a href="${main("/")}"><img src="${main("/CGNNewsLogo01.png")}" class="footer-logo" alt="CGN News" width="300" height="130"></a>
            <p>Real-Time News.<br>Global Perspective.</p>
          </div>

          <div>
            <h4><a href="${main("/news/")}">News</a></h4>
            <a href="${main("/category/world/")}">World</a><br>
            <a href="${main("/category/politics/")}">Politics</a><br>
            <a href="${main("/category/business/")}">Business</a><br>
            <a href="${main("/category/markets/")}">Markets</a><br>
            <a href="${main("/category/technology/")}">Technology</a><br>
            <a href="${main("/investigations/")}">Investigations</a><br>
            <a href="${main("/weather/")}">Weather</a><br>
            <a href="${main("/category/religion-and-spirituality/")}">Religion &amp; Spirituality</a>
          </div>

          <div>
            <h4><a href="${main("/reporters/")}">Reporters</a></h4>
            <a href="${main("/special-reports/")}">Special Reports</a><br>
            <a href="${main("/category/entertainment/")}">Entertainment</a><br>
            <a href="${main("/category/environment/")}">Environment</a><br>
            <a href="${main("/category/energy/")}">Energy</a><br>
            <a href="${main("/category/opinion/")}">Opinion</a><br>
            <a href="${main("/category/local/")}">Local</a><br>
            <a href="${main("/sports/")}">Sports</a><br>
            <a href="${main("/")}">CGN News</a><br>
            <a href="${main("/archives/")}">Archives</a>
          </div>

          <div>
            <h4><a href="${main("/editorial-standards/")}">Editorial Standards</a></h4>
            <a href="${main("/about.html")}">About Us</a><br>
            <a href="${main("/contact")}">Contact Us</a><br>
            <a href="${main("/terms-of-service.html")}">Terms of Service</a><br>
            <a href="${main("/privacy-policy.html")}">Privacy Policy</a><br>
            <a href="mailto:tips@cgnnews.net?subject=RE%3A%20Tip">Submit a Tip</a><br>
            <a href="${main("/write-for-us/")}">Write For Us</a><br>
            <a href="${main("/advertise/")}">Advertise With Us</a><br>
            <a href="${main("/copyright/")}">Copyright</a>
          </div>

          <div class="footer-bureau">
            <h4><a href="${main("/bureaus/")}">Bureaus</a></h4>
            <p class="footer-bureau-name">Cook Global News Network</p>
            <p>151 N. Delaware Street<br>Suite 122<br>Indianapolis, IN 46204</p>
            <p><a href="mailto:tips@cgnnews.net">tips@cgnnews.net</a><br>+1 (317) 442-1437</p>
            ${footerSocial()}
          </div>
        </div>

        <div class="footer-eo-block" aria-label="Equal Opportunity Employer notice">
          <p class="footer-eo-title"><a href="${main("/equal-opportunity/")}">EQUAL OPPORTUNITY EMPLOYER</a></p>
          <div class="footer-eo-copy">
            <p>CGN News is an equal opportunity employer, and does not discriminate on the basis of race, sex, religion, color, national origin, gender identity, pregnancy status, disability status, veteran status or any other protected category as defined by law, and in accordance with the Civil Rights Act of 1964, as amended, Americans with Disabilities Act of 1990, as amended, the Vietnam Era Veterans’ Readjustment Assistance Act of 1974, as amended, Uniformed Services Employment &amp; Reemployment Rights Act of 1994, as amended, and the Rehabilitation Act of 1973, as amended.</p>
            <p class="footer-eo-reporting">If you believe you have experienced discrimination in the employment process, you may contact the Equal Employment Opportunity Commission by visiting <a href="https://www.eeoc.gov" target="_blank" rel="noopener">www.eeoc.gov</a> or by mail at: 131 M Street, NE, Washington, D.C., 20507 or, for IN, KY, and MI applicants and employees: 115 W. Washington Street, South Tower, Suite 600, Indianapolis, IN 46204.</p>
          </div>
          <p class="footer-veteran-owned">VETERAN OWNED BUSINESS</p>
        </div>

        <div class="footer-utility-links"><p><a href="${main("/unsubscribe/")}">Unsubscribe From Newsletter</a></p></div>
        <div class="footer-bottom"><a href="${main("/copyright/")}">Copyright © 2026 | CGN News — All Rights Reserved</a></div>
      </footer>`;
  }

  function injectStyles(){
    if(document.getElementById("cgn-shell-styles")) return;
    const style = document.createElement("style");
    style.id = "cgn-shell-styles";
    style.textContent = `
      .sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      #cgn-site-header{position:relative;z-index:60;isolation:isolate;font-family:Arial,Helvetica,sans-serif}
      .top-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;border-bottom:1px solid #ddd;gap:20px;background:#fff;color:#111}
      .brand-link{display:flex;flex-direction:column;align-items:center;text-decoration:none;color:#111;line-height:1;flex-shrink:0}
      .logo{height:95px;width:auto;object-fit:contain}
      .network-name{margin-top:3px;font-family:Arial Black,Arial,Helvetica,sans-serif;font-weight:900;font-size:10px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
      .nav{display:flex;gap:20px;font-weight:600;align-items:center;white-space:nowrap}
      .nav a{color:#111;text-decoration:none;font-size:14px}.nav a:hover{text-decoration:underline}
      .nav-more{position:relative;display:inline-flex;align-items:center}
      .nav-more-button{border:0;background:transparent;color:#111;cursor:pointer;font-weight:800;font-size:14px;padding:4px}
      .nav-dropdown{display:none;position:absolute;top:100%;right:0;min-width:190px;background:#fff;border:1px solid #ddd;box-shadow:0 12px 30px rgba(0,0,0,.12);z-index:80;padding:8px 0}
      .nav-more:hover .nav-dropdown,.nav-more:focus-within .nav-dropdown,.nav-more.open .nav-dropdown{display:block}
      .nav-dropdown a{display:block;padding:9px 14px;white-space:nowrap}
      .right-tools{display:flex;gap:13px;align-items:center;font-size:13px;white-space:nowrap}
      #account-btn{display:inline-flex;padding:7px 12px;border:1px solid #111;border-radius:999px;color:#111;text-decoration:none;font-weight:700;background:#fff}
      #account-btn:hover{background:#111;color:#fff}
      .account-wrap{position:relative;display:inline-flex}
      .account-menu{display:none;position:absolute;top:calc(100% + 8px);right:0;min-width:150px;padding:8px 0;background:#fff;border:1px solid #ddd;box-shadow:0 12px 30px rgba(0,0,0,.12);z-index:90}
      .account-menu.open{display:block}.account-menu a,.account-menu button{display:block;width:100%;padding:9px 14px;background:#fff;border:0;color:#111;text-align:left;text-decoration:none;font-size:13px;cursor:pointer}
      .account-menu a:hover,.account-menu button:hover{background:#f4f4f4}
      .cgn-bureau-weather-time{display:inline-flex;flex-direction:column;align-items:flex-end;justify-content:center;min-width:148px;max-width:210px;color:#111;text-decoration:none;font-weight:800;line-height:1.12;text-align:right}
      .cgn-bureau-time,.cgn-bureau-weather,.cgn-bureau-location{display:block}.cgn-bureau-time,.cgn-bureau-weather{font-size:12px}.cgn-bureau-weather{margin-top:2px}.cgn-bureau-location{margin-top:1px;font-size:10px;font-weight:500;color:#555}
      .cgn-bureau-mobile-line,.cgn-mobile-weather-mini{display:none}
      .news-directory-link,.sports-center-link,.cgn-help-link,.editor-portal-link{display:inline-flex;align-items:center;justify-content:center;color:#111;text-decoration:none}
      .news-directory-icon{display:flex;flex-direction:column;align-items:center;font-size:9px;line-height:1}.news-directory-icon span{font-size:25px;line-height:.7}
      .sports-center-link{gap:4px;font-weight:800}.sports-center-link img{width:28px;height:28px;object-fit:contain}
      .cgn-help-link{flex-direction:column;line-height:.8}.cgn-help-link strong{display:flex;width:17px;height:17px;border:2px solid #111;border-radius:50%;align-items:center;justify-content:center}.cgn-help-link span{font-size:7px;font-weight:900}
      .editor-portal-link{font-size:24px;width:24px;height:24px}
      .social-icon{width:20px;height:20px;fill:#111;display:block}
      .ticker{position:relative;background:#000;color:#fff;padding:9px 20px;font-size:13px;font-weight:700;contain:layout paint;overflow:hidden}
      .ticker a{color:#fff;text-decoration:none}.ticker a:hover{text-decoration:underline}
      .market-ticker-wrap{position:relative;background:#020711;border-top:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12);height:46px;overflow:hidden;contain:layout paint}
      .market-ticker-click{position:absolute;inset:0;z-index:3;text-indent:-9999px;overflow:hidden}
      .market-ticker-live{max-width:1180px;margin:0 auto;padding:0 20px;height:46px;display:flex;align-items:center;gap:10px}
      .market-ticker-label{flex:0 0 auto;padding:5px 8px;border:1px solid rgba(214,178,94,.48);border-radius:999px;background:rgba(7,17,31,.92);color:#f2d990;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .market-tv-ticker{flex:1 1 auto;min-width:0;height:46px;overflow:hidden;pointer-events:none}.market-tv-ticker *{pointer-events:none}
      .cgn-shell-login-modal{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:99999;font-family:Arial,Helvetica,sans-serif;color:#111;align-items:flex-start;justify-content:center}
      .cgn-shell-login-modal.cgn-shell-login-closed,.cgn-shell-login-modal[hidden]{display:none!important}.cgn-shell-login-modal.cgn-shell-login-open{display:flex!important}
      body.cgn-shell-login-is-open{overflow:hidden}.cgn-shell-login-card{box-sizing:border-box;background:#fff;padding:25px;max-width:420px;width:calc(100% - 30px);margin:100px auto;text-align:center;border-radius:8px;box-shadow:0 20px 55px rgba(0,0,0,.28)}
      .cgn-shell-login-card h3{margin:0 0 10px}.cgn-shell-login-note{font-size:13px;color:#666;line-height:1.45}
      .cgn-shell-login-input{box-sizing:border-box;width:100%;margin:7px 0;padding:11px;border:1px solid #bbb;font-size:14px}
      .cgn-shell-login-message{min-height:18px;margin:6px 0 8px;color:#555;font-size:12px}
      .cgn-shell-login-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.cgn-shell-login-actions button,.cgn-shell-login-close{padding:10px 13px;border:1px solid #111;background:#111;color:#fff;font-weight:800;cursor:pointer}
      .cgn-shell-login-actions button:nth-child(2),.cgn-shell-login-close{background:#fff;color:#111}.cgn-shell-login-reset{font-size:12px}
      .footer{background:#0a0a0a;color:#fff;padding:40px 20px;font-family:Arial,Helvetica,sans-serif}
      .footer-container{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr 1.25fr;max-width:1180px;margin:auto;gap:28px;align-items:start}
      .footer h4{margin:0 0 10px}.footer p{line-height:1.45}.footer a{color:#ccc;text-decoration:none}.footer a:hover{text-decoration:underline}
      .footer-logo{width:180px;height:auto}.footer-bureau p{margin:4px 0;color:#ccc}.footer-bureau-name{color:#fff!important;font-weight:800}
      .footer-social{display:flex;gap:12px;margin-top:10px}.footer .social-icon{fill:#fff}
      .footer-eo-block{max-width:1100px;margin:28px auto 0;padding:20px 18px 0;border-top:1px solid #333;text-align:center;color:#bdbdbd;font-size:12px;line-height:1.55}
      .footer-eo-title{font-size:13px;font-weight:900;letter-spacing:.08em}.footer-eo-copy{max-width:980px;margin:auto}.footer-eo-reporting{padding-top:6px;border-top:1px solid rgba(255,255,255,.1)}
      .footer-veteran-owned{color:#fff!important;font-weight:900;letter-spacing:.08em}.footer-utility-links{max-width:1100px;margin:18px auto 0;padding-top:18px;border-top:1px solid #333;text-align:center}
      .footer-bottom{text-align:center;margin-top:20px;color:#aaa}
      @media(max-width:1050px){.top-bar{flex-direction:column;text-align:center}.nav{flex-wrap:wrap;justify-content:center}.right-tools{width:100%;max-width:620px;flex-wrap:wrap;justify-content:center}.footer-container{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:650px){
        .logo{height:82px}.top-bar{padding:10px 14px}.nav{gap:10px}.right-tools{max-width:430px;justify-content:space-between;gap:9px 6px}
        .account-wrap{order:1;flex:0 0 100%;justify-content:center}.cgn-bureau-weather-time{order:2;flex:0 0 100%;max-width:none;align-items:center;text-align:center}
        .cgn-bureau-mobile-line{display:flex;flex-direction:column;align-items:center;font-size:15px;font-weight:900}.cgn-bureau-time,.cgn-bureau-weather,.cgn-bureau-location{display:none}
        .cgn-mobile-weather-mini{display:inline-flex;font-size:20px;font-weight:900}.sports-center-link span{display:none}
        .nav-dropdown{left:50%;right:auto;transform:translateX(-50%);max-width:calc(100vw - 30px)}
        .footer-container{grid-template-columns:1fr;text-align:center}.footer-social{justify-content:center}.market-ticker-live{padding:0 10px}.market-ticker-label{font-size:8px}
      }`;
    document.head.appendChild(style);
  }

  document.addEventListener("click",function(event){
    const accountWrap = document.querySelector(".account-wrap");
    const accountMenu = document.getElementById("account-menu");
    if(accountWrap && accountMenu && !accountWrap.contains(event.target)) accountMenu.classList.remove("open");
    const navMore = document.querySelector(".nav-more");
    if(navMore && !navMore.contains(event.target)){
      navMore.classList.remove("open");
      const button = navMore.querySelector(".nav-more-button");
      if(button) button.setAttribute("aria-expanded","false");
    }
  });

  document.addEventListener("keydown",function(event){
    if(event.key === "Escape"){
      closeLogin();
      const accountMenu = document.getElementById("account-menu");
      if(accountMenu) accountMenu.classList.remove("open");
      const navMore = document.querySelector(".nav-more");
      if(navMore) navMore.classList.remove("open");
    }
  });

  function init(){
    injectStyles();
    renderHeader();
    renderFooter();
    renderLoginModal();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",init);
  else init();
})();
