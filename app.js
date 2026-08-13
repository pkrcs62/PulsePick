const $=id=>document.getElementById(id);

const RELOAD_FLAG="pulsepick-force-reload-v5";

async function forceFreshApp(){
  try{
    // Remove only caches created by PulsePick; do not touch other site/app caches.
    if("caches" in window){
      const keys=await caches.keys();
      await Promise.all(
        keys
          .filter(k=>k.startsWith("pulsepick-") && k!=="pulsepick-v5")
          .map(k=>caches.delete(k))
      );
    }

    if("serviceWorker" in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      const own=regs.find(r=>r.scope.includes("/pulsepick"));
      if(own){
        own.addEventListener("updatefound",()=>{
          const worker=own.installing;
          if(worker) worker.addEventListener("statechange",()=>{
            if(worker.state==="installed" && navigator.serviceWorker.controller){
              worker.postMessage({type:"FORCE_UPDATE"});
            }
          });
        });
        await own.update();
      }
    }
  }catch(e){
    console.warn("PulsePick update check failed",e);
  }
}

if("serviceWorker" in navigator){
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(sessionStorage.getItem(RELOAD_FLAG)!=="1"){
      sessionStorage.setItem(RELOAD_FLAG,"1");
      window.location.reload();
    }
  });
}
const APP_VERSION="V9";const STORE="pulsepick-settings-v1",LOCAL="pulsepick-state-v1";const BACKEND_URL="https://pulsepick-backend.onrender.com";
const INDEXES=[{symbol:"NIFTY",name:"Nifty 50",sector:"Index"},{symbol:"BANKNIFTY",name:"Nifty Bank",sector:"Index"}];
let UNIVERSE=[];
const FALL={NIFTY:[24471.7,-.46,0,0],BANKNIFTY:[57000,0,0,0],RELIANCE:[1330.5,.55,-8.97,-4.24],BHARTIARTL:[1959.9,2.13,-3.84,1.94],HDFCBANK:[731,-12.75,-22.01,-26.73],ICICIBANK:[1453.5,1.62,1.77,.39],SBIN:[1097,5.13,-4.28,36.25],TCS:[2455,19.18,-16.73,-19.43],BAJFINANCE:[1078,-5.9,9.81,22.97],LT:[4056,.44,-1.4,11.38],INFY:[1175.1,11.81,-21.51,-18.22],SUNPHARMA:[1941.7,1.78,13.91,21.48],TITAN:[4940,9.05,16.02,44.63],"M&M":[3502,9,-2.98,9.06],HCLTECH:[1356.6,19,-15.32,-8.06],AXISBANK:[1255.5,-1.05,-5.6,15.02],MARUTI:[14037,-3.11,-6.28,11.12],ITC:[286.1,-.87,-11.37,-30.83]};
let state={budget:5000,profitTarget:500,days:30,quotes:{},news:[],picks:[],cart:[],portfolio:[],history:[]};
const DEFAULT_WEIGHTS={m1W:.45,m6W:.2,y1W:.15,trendW:1.7,volBonusW:2,newsW:3,adapted:0};
const WBOUNDS={m1W:[.1,1],m6W:[.05,.6],y1W:[.02,.5],trendW:[.5,4],volBonusW:[0,5],newsW:[0,6]};
const fmt=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0}),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function save(){localStorage.setItem(LOCAL,JSON.stringify(state))}
function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(LOCAL)||"{}"))}catch{}state.weights={...DEFAULT_WEIGHTS,...(state.weights||{})};$("budgetInput").value=state.budget;$("profitInput").value=state.profitTarget;$("daysInput").value=state.days;render()}
function setGoal(){state.budget=+$("budgetInput").value||5000;state.profitTarget=+$("profitInput").value||500;state.days=+$("daysInput").value||30;save();$("targetPct").textContent=(state.profitTarget/state.budget*100).toFixed(1)+"%"}
async function online(body){
  const u=BACKEND_URL;
  const ctrl=new AbortController();
  const timeout=setTimeout(()=>ctrl.abort(),300000); // 5 min hard cap — full scan is slow but must not hang forever
  try{
    const r=await fetch(u+"/api/snapshot",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
      signal:ctrl.signal
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw Error(j.error||"Render data service error");
    return j;
  }catch(e){
    if(e.name==="AbortError") throw Error("Scan timed out after 5 minutes. The backend may be slow to wake up (Render free tier) — try again.");
    throw e;
  }finally{
    clearTimeout(timeout);
  }
}
function merge(){
  return UNIVERSE.map(s=>{
    const q=state.quotes[s.symbol];
    if(!q || !Number.isFinite(Number(q.price)) || Number(q.price)<=0) return null;
    const h=state.historyFeatures?.[s.symbol]?.history||{};
    return {
      ...s,
      price:Number(q.price),
      m1:Number(h.m1 ?? q.changePct ?? 0),
      m6:Number(h.m6 ?? 0),
      y1:Number(h.y1 ?? 0),
      m3:Number(h.m3 ?? 0),
      volume:Number(h.volRatio ?? 1),
      changePct:Number(q.changePct ?? 0),
      bid:Number(q.bid ?? 0),
      ask:Number(q.ask ?? 0)
    };
  }).filter(Boolean);
}
function newsScore(sym,sector){let s=0;for(const n of state.news||[]){const t=(n.title+" "+n.description).toUpperCase();if(t.includes(sym)||t.includes(sector.toUpperCase().split(" ")[0])){const l=t.toLowerCase();if(/profit|growth|upgrade|strong|orders|beats|recovery|bullish/.test(l))s++;if(/loss|downgrade|weak|risk|slump|fall|drop|war|tariff|miss/.test(l))s--}}return clamp(s,-3,3)}
async function checkOutcomes(){
  const now=Date.now();
  const open=(state.history||[]).filter(h=>!h.outcome&&h.symbol&&(now-new Date(h.date).getTime())/86400000>=1);
  if(!open.length) return;
  const seen=new Set();
  const instruments=open.filter(h=>{if(seen.has(h.symbol))return false;seen.add(h.symbol);return true})
    .map(h=>({symbol:h.symbol}));
  let quotes={};
  try{
    const r=await fetch(BACKEND_URL+"/api/quotes",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({instruments})
    });
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.ok) quotes=j.quotes||{};
  }catch(e){console.warn("checkOutcomes: quote fetch failed",e);return}
  for(const h of open){
    const cur=Number(quotes[h.symbol]?.price||0);
    if(!cur) continue;
    const ageDays=Math.floor((now-new Date(h.date).getTime())/86400000);
    if(cur>=h.target){h.outcome="hit";h.outcomeDay=ageDays}
    else if(cur<=h.stop){h.outcome="stopped";h.outcomeDay=ageDays}
    else if(ageDays>=(h.hx||30)){h.outcome="expired";h.outcomeDay=ageDays}
    // else: still pending, leave outcome null and check again next time
  }
  adaptWeights();
  save();
}
function adaptWeights(){
  const w=state.weights=state.weights||{...DEFAULT_WEIGHTS};
  const lr=.015;
  const untrained=(state.history||[]).filter(h=>h.outcome&&!h.trained&&Number.isFinite(h.m1));
  if(!untrained.length) return;
  for(const h of untrained){
    const trend=h.m1*w.m1W+h.m6*w.m6W+h.y1*w.y1W;
    const raw=50+trend*w.trendW+(h.volBonus||0)*w.volBonusW+(h.newsScore||0)*w.newsW
      +(h.m1>0?2:0)+(h.m6>0?2:0)+(h.y1>0?1:0);
    const p=clamp(raw/100,0,1);
    const y=h.outcome==="hit"?1:0;
    const err=y-p;
    // Gradient descent on the linear scorer: nudge each weight toward what would have
    // predicted this outcome correctly, using the same features stored at prediction time.
    w.trendW=clamp(w.trendW+lr*err*trend/10,...WBOUNDS.trendW);
    w.volBonusW=clamp(w.volBonusW+lr*err*(h.volBonus||0)*10,...WBOUNDS.volBonusW);
    w.newsW=clamp(w.newsW+lr*err*(h.newsScore||0)*10,...WBOUNDS.newsW);
    w.m1W=clamp(w.m1W+lr*err*w.trendW*h.m1/50,...WBOUNDS.m1W);
    w.m6W=clamp(w.m6W+lr*err*w.trendW*h.m6/50,...WBOUNDS.m6W);
    w.y1W=clamp(w.y1W+lr*err*w.trendW*h.y1/50,...WBOUNDS.y1W);
    h.trained=true;
  }
  w.adapted=(w.adapted||0)+untrained.length;
}
function accuracyFor(bucketDays){
  const now=Date.now();
  const eligible=(state.history||[]).filter(h=>h.target&&h.stop&&(now-new Date(h.date).getTime())/86400000>=bucketDays);
  if(!eligible.length) return null;
  const hits=eligible.filter(h=>h.outcome==="hit"&&h.outcomeDay<=bucketDays).length;
  return {hits,total:eligible.length,pct:Math.round(hits/eligible.length*100)};
}
function calculate(){const w=state.weights||DEFAULT_WEIGHTS;const target=state.profitTarget/state.budget*100;const merged=merge();const arr=merged.map(s=>{const ns=newsScore(s.symbol,s.sector),volBonus=s.volume>1?1:0,trend=s.m1*w.m1W+s.m6*w.m6W+s.y1*w.y1W,raw=50+trend*w.trendW+volBonus*w.volBonusW+ns*w.newsW+(s.m1>0?2:0)+(s.m6>0?2:0)+(s.y1>0?1:0),exp=clamp((raw-50)/4+target*.35,-12,18),down=Math.max(0,7-(s.m1*.12+s.m6*.04)),positive=exp>0&&exp>=target*.55&&down<=7&&s.price<=state.budget,hm=Math.max(4,Math.round(state.days*(.35+Math.min(1,Math.max(0,exp/10))*.2))),hx=Math.max(hm+2,Math.round(state.days*(.7+Math.min(1,Math.max(0,exp/12))*.35)));return {...s,score:clamp(raw,0,100),expected:exp,down,positive,hm,hx,trend,volBonus,newsScore:ns,target:s.price*(1+Math.max(exp,target*.7)/100),stop:s.price*(1-Math.min(6,Math.max(3,down))/100)}});const positives=arr.filter(x=>x.positive).sort((a,b)=>b.score-a.score);state.picks=positives;state.diag={universeCount:UNIVERSE.length,quotedCount:merged.length,requiredExpected:+(target*.55).toFixed(1),bestExpected:arr.length?+Math.max(...arr.map(x=>x.expected)).toFixed(1):null,nearMiss:arr.length?[...arr].sort((a,b)=>b.expected-a.expected).slice(0,3):[]};let rem=state.budget,rows=[];for(const p of positives){if(rem<p.price)continue;const q=Math.min(2,Math.floor(rem/p.price));if(!q)continue;rem-=q*p.price;rows.push({...p,qty:q,invest:q*p.price,profitMin:q*p.price*p.expected*.5/100,profitMax:q*p.price*p.expected/100});if(rows.length===4)break}state.plan={rows,invest:rows.reduce((a,r)=>a+r.invest,0),cash:rem}}
function render(){setGoal();calculate();$("pickCount").textContent=state.snapshot?(state.picks.length+" picks"):"Scan first";$("picks").innerHTML=state.picks.length?state.picks.map(p=>`<div class="pick"><div class="pick-top"><div><div class="stock-symbol">${p.symbol}</div><div class="stock-name">${p.name} · ${p.sector}</div></div><div class="stock-price">${fmt(p.price)}</div></div><div class="pick-tags"><span class="tag good">BUY</span><span class="tag good">${p.expected.toFixed(1)}% expected</span><span class="tag">${p.hm}–${p.hx} days</span></div><div class="pick-body"><div class="mini-metric"><span>Buy around</span><strong>${fmt(p.price)}</strong></div><div class="mini-metric"><span>Target</span><strong>${fmt(p.target)}</strong></div><div class="mini-metric"><span>Protection</span><strong>${fmt(p.stop)}</strong></div></div><div class="newsMeta">Possible profit at the model's upper estimate: ${fmt(p.price*p.expected/100)} per share.</div></div>`).join(""):(()=>{const d=state.diag||{};if(!d.quotedCount)return `<div class="soft-note">No live prices were returned by the last scan (0 of ${d.universeCount||"?"} stocks had a price). This is a data issue, not a filter issue — try Refresh again, or check Settings → Connect/Test.</div>`;let miss="";if(d.nearMiss&&d.nearMiss.length)miss=`<br><br>Closest misses: `+d.nearMiss.map(m=>`${m.symbol} (${m.expected.toFixed(1)}% expected)`).join(", ");return `<div class="soft-note">0 of ${d.quotedCount} priced stocks met your rules right now. Best expected return found was ${d.bestExpected}%, but your goal needs ≥${d.requiredExpected}% given this budget/profit target. Try a lower profit target, a longer hold window, or a higher budget.${miss}</div>`})();const pl=state.plan||{rows:[],invest:0,cash:state.budget};$("mixTitle").textContent=pl.rows.length?"Your recommended basket":"No basket yet";$("mixRows").innerHTML=pl.rows.map(r=>`<div class="mix-row"><div><strong>${r.symbol} × ${r.qty}</strong><span>${r.hm}–${r.hx} days · target ${fmt(r.target)}</span></div><strong>${fmt(r.invest)}</strong></div>`).join("");$("mixInvest").textContent=fmt(pl.invest);$("mixCash").textContent=fmt(pl.cash);$("mixProfit").textContent=fmt(pl.rows.reduce((a,r)=>a+r.profitMin,0))+"–"+fmt(pl.rows.reduce((a,r)=>a+r.profitMax,0));$("cart").innerHTML=state.cart.length?state.cart.map((r,i)=>`<div class="pick"><div class="pick-top"><div><div class="stock-symbol">${r.symbol} × ${r.qty}</div><div class="stock-name">Paper cart · buy ${fmt(r.buyPrice)}</div></div><button class="small-btn cartBought" data-i="${i}">I've bought</button></div></div>`).join(""):`<div class="soft-note">Cart is empty.</div>`;document.querySelectorAll(".cartBought").forEach(b=>b.onclick=()=>{const r=state.cart.splice(+b.dataset.i,1)[0];state.portfolio.push(r);save();render()});$("sellWatch").innerHTML=state.portfolio.length?state.portfolio.map(r=>{const cur=state.quotes[r.symbol]?.price||r.buyPrice,pnl=(cur-r.buyPrice)*r.qty,hit=cur>=r.target,stop=cur<=r.stop;return `<div class="pick"><div class="pick-top"><div><div class="stock-symbol">${r.symbol}</div><div class="stock-name">${r.qty} shares · bought ${fmt(r.buyPrice)}</div></div><div class="stock-price">${pnl>=0?"+":""}${fmt(pnl)}</div></div><div class="pick-tags"><span class="tag ${hit?"good":"warn"}">${hit?"TARGET REACHED":"WATCH"}</span>${stop?'<span class="tag bad">PROTECTION HIT</span>':""}</div><div class="newsMeta">Current ${fmt(cur)} · Target ${fmt(r.target)} · Protection ${fmt(r.stop)} · Expected hold ${r.hm}–${r.hx} days.</div></div>`}).join(""):`<div class="soft-note">Buy from Groww manually, then tap “I’ve bought” to start tracking.</div>`;$("newsValue").textContent=state.news.length||0;$("news").innerHTML=state.news.length?state.news.slice(0,8).map(n=>`<div class="newsItem"><div class="newsTitle">${esc(n.title)}</div><div class="newsMeta">${esc(n.source||"Market news")}</div></div>`).join(""):`<div class="soft-note">No live news loaded. Demo mode still works.</div>`;$("historyNote").textContent=state.history.length?`${state.history.length} prediction records stored · model adapted ${(state.weights?.adapted)||0}× from outcomes.`:"Every refresh can be recorded for later 7/15/30-day checks.";const a7=accuracyFor(7),a15=accuracyFor(15),a30=accuracyFor(30);$("acc7").textContent=a7?`${a7.pct}% (${a7.hits}/${a7.total})`:"—";$("acc15").textContent=a15?`${a15.pct}% (${a15.hits}/${a15.total})`:"—";$("acc30").textContent=a30?`${a30.pct}% (${a30.hits}/${a30.total})`:"—";$("snapshotTitle").textContent=state.snapshot?new Date(state.snapshot).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"No snapshot yet";if(state.snapshot)$("marketStatus").textContent=state.snapshotDemo?"Demo data":"Updated "+new Date(state.snapshot).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function loadUniverse(){
  const r=await fetch(BACKEND_URL+"/api/universe",{cache:"no-store"});
  if(!r.ok) throw Error("Stock universe unavailable");
  const j=await r.json();
  if(!Array.isArray(j.symbols)||!j.symbols.length) throw Error("No Indian equity symbols returned");
  UNIVERSE=j.symbols.map(x=>({symbol:x,name:x,sector:"Indian Equity"}));
  return UNIVERSE.length;
}

async function connectTest(){
  $("connectionState").textContent="Checking…";
  $("connectionDetail").textContent="Checking the live data connection.";
  try{
    const h=await fetch(BACKEND_URL+"/health",{cache:"no-store"});
    if(!h.ok) throw Error("Render service is not responding");
    const u=await fetch(BACKEND_URL+"/api/symbol-check",{cache:"no-store"});
    const uj=await u.json().catch(()=>({}));
    if(!u.ok || !uj.ok) throw Error(uj.error||"Market-data check failed");
    $("connectionState").textContent="Connected ✓";
    $("connectionDetail").textContent=`Connected. ${Number(uj.universeCount||0).toLocaleString("en-IN")} NSE equities available; ${uj.samplePrices||0}/${uj.sampleChecked||0} sample prices received.`;
    $("marketStatus").textContent=`Online · ${Number(uj.universeCount||0).toLocaleString("en-IN")} equities`;
    return true;
  }catch(e){
    $("connectionState").textContent="Connection failed";
    $("connectionDetail").textContent=e.message||"Unable to connect";
    $("marketStatus").textContent="Connection failed";
    return false;
  }
}

let refreshTimerHandle=null;
function beginRefreshUI(){
  document.body.classList.add("refreshing");
  $("mainContent").inert=true;
  document.querySelector(".bottom-nav").inert=true;
  $("refreshOverlay").hidden=false;
  $("refreshOverlay").style.display="flex";
  const statuses=["Connecting to live data…","Loading the NSE stock list…","Fetching live prices…","Checking momentum history…","Scoring today's candidates…","Almost there…"];
  let statusIdx=0,startedAt=Date.now();
  $("refreshStatus").textContent=statuses[0];
  refreshTimerHandle=setInterval(()=>{
    const secs=Math.floor((Date.now()-startedAt)/1000);
    $("refreshTimer").textContent=Math.floor(secs/60)+":"+String(secs%60).padStart(2,"0");
    if(secs>0&&secs%12===0&&statusIdx<statuses.length-1){statusIdx++;$("refreshStatus").textContent=statuses[statusIdx]}
  },1000);
}
function endRefreshUI(){
  if(refreshTimerHandle){clearInterval(refreshTimerHandle);refreshTimerHandle=null}
  document.body.classList.remove("refreshing");
  $("mainContent").inert=false;
  document.querySelector(".bottom-nav").inert=false;
  $("refreshOverlay").hidden=true;
  $("refreshOverlay").style.display="none";
}
async function refresh(){
  setGoal();
  beginRefreshUI();
  $("marketStatus").textContent="Scanning Indian equities…";
  try{
    if(!await connectTest()) return;
    const j=await online({fullScan:true});
    state.quotes=j.quotes||{};
    state.historyFeatures=j.history||{};
    state.news=j.news||[];
    state.indexes=j.indexes||{};
    state.snapshot=new Date().toISOString();
    state.snapshotDemo=false;
    state.history=state.history||[];
    calculate();
    state.history.push(...state.picks.slice(0,10).map(p=>({
      date:new Date().toISOString(),symbol:p.symbol,
      price:p.price,expected:p.expected,target:p.target,stop:p.stop,hx:p.hx,
      m1:p.m1,m6:p.m6,y1:p.y1,volBonus:p.volBonus,newsScore:p.newsScore,
      outcome:null,outcomeDay:null,trained:false
    })));
    state.history=state.history.slice(-500);
    save();
    await checkOutcomes();
    render();
    $("marketStatus").textContent=`Updated ${new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} · ${Number(j.universeCount||0).toLocaleString("en-IN")} equities scanned`;
  }catch(e){
    console.error(e);
    $("marketStatus").textContent="Scan failed";
    $("connectionState")&&($("connectionState").textContent="Scan failed");
    $("connectionDetail")&&($("connectionDetail").textContent=e.message||"Unable to scan");
    render();
  }finally{
    endRefreshUI();
  }
}

$("budgetInput").oninput=render;$("profitInput").oninput=render;$("daysInput").onchange=render;$("refreshBtn").onclick=refresh;$("findBtn").onclick=()=>{save();calculate();render();$("picks").scrollIntoView({behavior:"smooth"})};$("cartBtn").onclick=()=>{state.cart.push(...state.plan.rows.map(r=>({symbol:r.symbol,qty:r.qty,buyPrice:r.price,target:r.target,stop:r.stop,hm:r.hm,hx:r.hx})));save();render();$("cart").scrollIntoView({behavior:"smooth"})};$("clearCartBtn").onclick=()=>{state.cart=[];save();render()};$("newsRefreshBtn").onclick=refresh;
$("settingsBtn").onclick=()=>{
  $("settingsModal").showModal();
  $("connectionState").textContent="Not checked";
  $("connectionDetail").textContent="Tap Connect / Test connection.";
};
$("closeSettings").onclick=()=>$("settingsModal").close();
$("saveSettings").onclick=()=>$("settingsModal").close();
$("connectBtn").onclick=connectTest;
document.querySelectorAll(".bottom-nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".bottom-nav button").forEach(x=>x.classList.remove("active"));b.classList.add("active");const id=b.dataset.tab==="home"?"picks":b.dataset.tab==="cart"?"cart":b.dataset.tab==="portfolio"?"sellWatch":"historyNote";document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"})});if("serviceWorker"in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
      await reg.update();
    }catch(e){
      console.warn("Service worker registration failed",e);
    }
    forceFreshApp();
  });
}
load()
checkOutcomes().then(()=>render()).catch(()=>{})
