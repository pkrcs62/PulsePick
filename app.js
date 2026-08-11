const $=id=>document.getElementById(id);

const APP_VERSION="v5";
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
const STORE="pulsepick-settings-v1",LOCAL="pulsepick-state-v1";const BACKEND_URL="https://pulsepick-backend.onrender.com";
const UNIVERSE=[["RELIANCE","Reliance Industries","Oil & Gas"],["BHARTIARTL","Bharti Airtel","Telecom"],["HDFCBANK","HDFC Bank","Private Bank"],["ICICIBANK","ICICI Bank","Private Bank"],["SBIN","State Bank of India","Public Bank"],["TCS","Tata Consultancy Services","IT Services"],["BAJFINANCE","Bajaj Finance","Finance"],["LT","Larsen & Toubro","Construction"],["INFY","Infosys","IT Services"],["SUNPHARMA","Sun Pharma","Pharma"],["TITAN","Titan Company","Consumer"],["M&M","Mahindra & Mahindra","Auto"],["HCLTECH","HCL Technologies","IT Services"],["AXISBANK","Axis Bank","Private Bank"],["MARUTI","Maruti Suzuki","Auto"],["ITC","ITC","FMCG"]].map(x=>({symbol:x[0],name:x[1],sector:x[2]}));
const FALL={RELIANCE:[1330.5,.55,-8.97,-4.24],BHARTIARTL:[1959.9,2.13,-3.84,1.94],HDFCBANK:[731,-12.75,-22.01,-26.73],ICICIBANK:[1453.5,1.62,1.77,.39],SBIN:[1097,5.13,-4.28,36.25],TCS:[2455,19.18,-16.73,-19.43],BAJFINANCE:[1078,-5.9,9.81,22.97],LT:[4056,.44,-1.4,11.38],INFY:[1175.1,11.81,-21.51,-18.22],SUNPHARMA:[1941.7,1.78,13.91,21.48],TITAN:[4940,9.05,16.02,44.63],"M&M":[3502,9,-2.98,9.06],HCLTECH:[1356.6,19,-15.32,-8.06],AXISBANK:[1255.5,-1.05,-5.6,15.02],MARUTI:[14037,-3.11,-6.28,11.12],ITC:[286.1,-.87,-11.37,-30.83]};
let state={budget:5000,profitTarget:500,days:30,quotes:{},news:[],picks:[],cart:[],portfolio:[],history:[]};
const fmt=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0}),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function save(){localStorage.setItem(LOCAL,JSON.stringify(state))}
function load(){try{Object.assign(state,JSON.parse(localStorage.getItem(LOCAL)||"{}"))}catch{}$("budgetInput").value=state.budget;$("profitInput").value=state.profitTarget;$("daysInput").value=state.days;render()}
function setGoal(){state.budget=+$("budgetInput").value||5000;state.profitTarget=+$("profitInput").value||500;state.days=+$("daysInput").value||30;save();$("targetPct").textContent=(state.profitTarget/state.budget*100).toFixed(1)+"%"}
async function online(body){
  const u=BACKEND_URL;
  const r=await fetch(u+"/api/snapshot",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw Error(j.error||"Render data service error");
  return j;
}
function merge(){return UNIVERSE.map(s=>{const f=FALL[s.symbol]||[1000,0,0,0],q=state.quotes[s.symbol]||{};return {...s,price:q.price??f[0],m1:q.m1??f[1],m6:q.m6??f[2],y1:q.y1??f[3],volume:q.volume??1}})}
function newsScore(sym,sector){let s=0;for(const n of state.news||[]){const t=(n.title+" "+n.description).toUpperCase();if(t.includes(sym)||t.includes(sector.toUpperCase().split(" ")[0])){const l=t.toLowerCase();if(/profit|growth|upgrade|strong|orders|beats|recovery|bullish/.test(l))s++;if(/loss|downgrade|weak|risk|slump|fall|drop|war|tariff|miss/.test(l))s--}}return clamp(s,-3,3)}
function calculate(){const target=state.profitTarget/state.budget*100;const arr=merge().map(s=>{const ns=newsScore(s.symbol,s.sector),trend=s.m1*.45+s.m6*.2+s.y1*.15,raw=50+trend*1.7+(s.volume>1?2:0)+ns*3+(s.m1>0?2:0)+(s.m6>0?2:0)+(s.y1>0?1:0),exp=clamp((raw-50)/4+target*.35,-12,18),down=Math.max(0,7-(s.m1*.12+s.m6*.04)),positive=exp>0&&exp>=target*.55&&down<=7&&s.price<=state.budget,hm=Math.max(4,Math.round(state.days*(.35+Math.min(1,Math.max(0,exp/10))*.2))),hx=Math.max(hm+2,Math.round(state.days*(.7+Math.min(1,Math.max(0,exp/12))*.35)));return {...s,score:clamp(raw,0,100),expected:exp,down,positive,hm,hx,target:s.price*(1+Math.max(exp,target*.7)/100),stop:s.price*(1-Math.min(6,Math.max(3,down))/100)}}).filter(x=>x.positive).sort((a,b)=>b.score-a.score);state.picks=arr;let rem=state.budget,rows=[];for(const p of arr){if(rem<p.price)continue;const q=Math.min(2,Math.floor(rem/p.price));if(!q)continue;rem-=q*p.price;rows.push({...p,qty:q,invest:q*p.price,profitMin:q*p.price*p.expected*.5/100,profitMax:q*p.price*p.expected/100});if(rows.length===4)break}state.plan={rows,invest:rows.reduce((a,r)=>a+r.invest,0),cash:rem}}
function render(){setGoal();calculate();$("pickCount").textContent=state.picks.length+" picks";$("picks").innerHTML=state.picks.length?state.picks.map(p=>`<div class="pick"><div class="pick-top"><div><div class="stock-symbol">${p.symbol}</div><div class="stock-name">${p.name} · ${p.sector}</div></div><div class="stock-price">${fmt(p.price)}</div></div><div class="pick-tags"><span class="tag good">BUY</span><span class="tag good">${p.expected.toFixed(1)}% expected</span><span class="tag">${p.hm}–${p.hx} days</span></div><div class="pick-body"><div class="mini-metric"><span>Buy around</span><strong>${fmt(p.price)}</strong></div><div class="mini-metric"><span>Target</span><strong>${fmt(p.target)}</strong></div><div class="mini-metric"><span>Protection</span><strong>${fmt(p.stop)}</strong></div></div><div class="newsMeta">Possible profit at the model's upper estimate: ${fmt(p.price*p.expected/100)} per share.</div></div>`).join(""):`<div class="soft-note">WAIT — no stock currently meets your profit and downside rules.</div>`;const pl=state.plan||{rows:[],invest:0,cash:state.budget};$("mixTitle").textContent=pl.rows.length?"Your recommended basket":"No basket yet";$("mixRows").innerHTML=pl.rows.map(r=>`<div class="mix-row"><div><strong>${r.symbol} × ${r.qty}</strong><span>${r.hm}–${r.hx} days · target ${fmt(r.target)}</span></div><strong>${fmt(r.invest)}</strong></div>`).join("");$("mixInvest").textContent=fmt(pl.invest);$("mixCash").textContent=fmt(pl.cash);$("mixProfit").textContent=fmt(pl.rows.reduce((a,r)=>a+r.profitMin,0))+"–"+fmt(pl.rows.reduce((a,r)=>a+r.profitMax,0));$("cart").innerHTML=state.cart.length?state.cart.map((r,i)=>`<div class="pick"><div class="pick-top"><div><div class="stock-symbol">${r.symbol} × ${r.qty}</div><div class="stock-name">Paper cart · buy ${fmt(r.buyPrice)}</div></div><button class="small-btn cartBought" data-i="${i}">I've bought</button></div></div>`).join(""):`<div class="soft-note">Cart is empty.</div>`;document.querySelectorAll(".cartBought").forEach(b=>b.onclick=()=>{const r=state.cart.splice(+b.dataset.i,1)[0];state.portfolio.push(r);save();render()});$("sellWatch").innerHTML=state.portfolio.length?state.portfolio.map(r=>{const cur=state.quotes[r.symbol]?.price||r.buyPrice,pnl=(cur-r.buyPrice)*r.qty,hit=cur>=r.target,stop=cur<=r.stop;return `<div class="pick"><div class="pick-top"><div><div class="stock-symbol">${r.symbol}</div><div class="stock-name">${r.qty} shares · bought ${fmt(r.buyPrice)}</div></div><div class="stock-price">${pnl>=0?"+":""}${fmt(pnl)}</div></div><div class="pick-tags"><span class="tag ${hit?"good":"warn"}">${hit?"TARGET REACHED":"WATCH"}</span>${stop?'<span class="tag bad">PROTECTION HIT</span>':""}</div><div class="newsMeta">Current ${fmt(cur)} · Target ${fmt(r.target)} · Protection ${fmt(r.stop)} · Expected hold ${r.hm}–${r.hx} days.</div></div>`}).join(""):`<div class="soft-note">Buy from Groww manually, then tap “I’ve bought” to start tracking.</div>`;$("newsValue").textContent=state.news.length||0;$("news").innerHTML=state.news.length?state.news.slice(0,8).map(n=>`<div class="newsItem"><div class="newsTitle">${esc(n.title)}</div><div class="newsMeta">${esc(n.source||"Market news")}</div></div>`).join(""):`<div class="soft-note">No live news loaded. Demo mode still works.</div>`;$("historyNote").textContent=state.history.length?`${state.history.length} prediction records stored.`:"Every refresh can be recorded for later 7/15/30-day checks.";$("acc7").textContent=state.history.length?"Tracking":"—";$("acc15").textContent=state.history.length?"Tracking":"—";$("acc30").textContent=state.history.length?"Tracking":"—";$("snapshotTitle").textContent=state.snapshot?new Date(state.snapshot).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"No snapshot yet";if(state.snapshot)$("marketStatus").textContent=state.snapshotDemo?"Demo data":"Updated "+new Date(state.snapshot).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function connectTest(){
  $("connectionState").textContent="Checking…";
  $("connectionDetail").textContent="Waking/checking the Render service and requesting live sample data.";
  try{
    const health=await fetch(BACKEND_URL+"/health",{cache:"no-store"});
    if(!health.ok) throw Error("Render service is not responding");
    const j=await online({symbols:["RELIANCE","HCLTECH"],days:30});
    const count=Object.keys(j.quotes||{}).length;
    $("connectionState").textContent=count>0?"Connected ✓":"Backend reachable, but no quotes returned";
    $("connectionDetail").textContent=count>0
      ? `${count} market prices received successfully. You can use Refresh today.`
      : "The service answered, but no market prices were returned.";
    $("marketStatus").textContent=count>0?"Online data connected":"Backend online";
    return count>0;
  }catch(e){
    $("connectionState").textContent="Connection failed";
    $("connectionDetail").textContent=e.message||"Unable to connect";
    $("marketStatus").textContent="Offline / connection failed";
    return false;
  }
}
async function refresh(){setGoal();$("marketStatus").textContent="Refreshing…";if(!await connectTest())return;try{const j=await online({symbols:UNIVERSE.map(s=>s.symbol),days:90});state.quotes=j.quotes||{};state.news=j.news||[];state.snapshot=new Date().toISOString();state.snapshotDemo=false}catch{state.quotes={};state.news=[];state.snapshot=new Date().toISOString();state.snapshotDemo=true}$("niftyValue").textContent=state.quotes.NIFTY?.price?fmt(state.quotes.NIFTY.price):"—";$("bankValue").textContent=state.quotes.BANKNIFTY?.price?fmt(state.quotes.BANKNIFTY.price):"—";state.history.push(...state.picks.slice(0,5).map(p=>({date:new Date().toISOString(),symbol:p.symbol,price:p.price,expected:p.expected})));state.history=state.history.slice(-200);save();render()}
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
