(() => {
  const WATCH_KEY='bbWatcherEnabled';
  let watchTimer=null;
  let watchBaseline='';
  let watchUrl='';

  const clean = v => String(v||'').replace(/\s+/g,' ').trim();
  const priceOf = text => { const m=clean(text).match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/); return m?Number(m[1].replace(/,/g,'')):null; };
  const reviewOf = text => { const m=clean(text).match(/([\d,]+)\s*(?:reviews?|ratings?)/i); return m?Number(m[1].replace(/,/g,'')):0; };
  const ratingOf = text => { const m=clean(text).match(/\b([1-5](?:\.\d)?)\s*(?:stars?|\/5)\b/i); return m?Number(m[1]):null; };
  const fingerprint = () => {
    const main=document.querySelector('main')||document.body;
    return btoa(unescape(encodeURIComponent(clean(main.innerText).slice(0,20000)))).slice(0,160);
  };
  function toast(msg){let e=document.getElementById('bb-tools-toast');if(!e){e=document.createElement('div');e.id='bb-tools-toast';Object.assign(e.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:'#14141f',color:'#e7e7f0',border:'1px solid #7c5cfc',borderRadius:'12px',padding:'12px 15px',font:'600 13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',boxShadow:'0 8px 30px rgba(0,0,0,.35)',maxWidth:'360px'});document.documentElement.appendChild(e)}e.textContent=msg;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',5000)}

  function context(){
    const title=clean(document.querySelector('h1')?.innerText||document.title);
    const desc=clean([...document.querySelectorAll('textarea,[contenteditable="true"],p')].map(x=>x.innerText||x.value).filter(Boolean).join(' ')).slice(0,12000);
    const prices=[...document.querySelectorAll('body *')].map(x=>priceOf(x.innerText)).filter(Number.isFinite);
    const price=prices.length?Math.min(...prices):null;
    return {url:location.href,title,description:desc,price,fingerprint:fingerprint()};
  }
  function scan(){
    const els=[...document.querySelectorAll('a[href*="/gigs/"],article,li')]; const seen=new Set(); const gigs=[];
    for(const el of els){const text=clean(el.innerText);if(!text||text.length<20)continue;const link=el.querySelector('a[href*="/gigs/"]')||el;if(!link.href?.includes('/gigs/'))continue;const title=clean((el.querySelector('h2,h3,h4')||link).innerText).slice(0,180);if(title.length<8||seen.has(title))continue;seen.add(title);const price=priceOf(text),reviews=reviewOf(text),rating=ratingOf(text);let score=50;if(price!=null)score+=price<=50?12:price<=150?7:2;if(reviews<20)score+=18;else if(reviews<100)score+=10;else if(reviews<500)score+=3;if(rating)score+=Math.round((rating-3)*6);if(title.length>=35&&title.length<=110)score+=7;if(/shopify|wordpress|automation|ai|chatbot|seo|video|design|python|app/i.test(title))score+=5;gigs.push({title,price,reviews,rating,score:Math.max(1,Math.min(100,score)),url:link.href});if(gigs.length>=40)break}
    return gigs.sort((a,b)=>b.score-a.score);
  }
  function health(){
    const c=context(), text=clean(document.body.innerText); const hasTitle=c.title.length>=20&&c.title.length<=80;const desc=c.description.length>=300;const tags=[...document.querySelectorAll('input,button,[role="option"]')].filter(x=>/tag/i.test(x.getAttribute('aria-label')||'')||/tag/i.test(x.className||''));let titleScore=hasTitle?90:45,descScore=desc?90:Math.min(80,Math.round(c.description.length/4));let tagScore=tags.length?85:55,mediaScore=document.images.length>=2?90:50,clarity=/\$\s?\d/.test(text)?80:55;return{score:Math.round((titleScore+descScore+tagScore+mediaScore+clarity)/5),breakdown:[{name:'Title',score:titleScore,note:hasTitle?'Clear length and structure':'Aim for a specific buyer outcome in a concise title.'},{name:'Description',score:descScore,note:desc?'Enough visible copy to evaluate':'Add at least 300 characters of useful, specific copy.'},{name:'Tags',score:tagScore,note:tags.length?'Tag controls detected':'Open the gig editor tag section for a stronger check.'},{name:'Media',score:mediaScore,note:document.images.length>=2?'Multiple images detected':'Consider stronger visual proof and examples.'},{name:'Pricing signal',score:clarity,note:/\$\s?\d/.test(text)?'Price visible':'Make package positioning easy to understand.'}]};}

  function fields(){return [...document.querySelectorAll('input:not([type="password"]),textarea,select,[contenteditable="true"]')].filter(el=>el.offsetParent!==null).map((el,i)=>({i,tag:el.tagName,type:el.type||'',name:el.name||'',id:el.id||'',placeholder:el.placeholder||'',value:el.value!==undefined?el.value:el.innerText}));}
  function applyDraft(draft){let count=0;const els=[...document.querySelectorAll('input:not([type="password"]),textarea,select,[contenteditable="true"]')].filter(el=>el.offsetParent!==null);for(const item of draft||[]){const el=els[item.i];if(!el)continue;const val=item.value??'';if(el.tagName==='SELECT'){el.value=val}else if(el.isContentEditable){el.innerText=val}else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(el,val);else el.value=val}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));count++}return count;}

  async function startWatcher(){
    clearInterval(watchTimer);watchTimer=null;const s=await chrome.storage.local.get(['bbWatcherEnabled','bbWatchInterval','bbStopOnChange']);if(!s.bbWatcherEnabled)return;watchUrl=location.href;watchBaseline=fingerprint();const every=Math.max(30,Number(s.bbWatchInterval)||60)*1000;watchTimer=setInterval(async()=>{const now=location.href;const changed=now!==watchUrl||fingerprint()!==watchBaseline;if(changed&&s.bbStopOnChange){clearInterval(watchTimer);watchTimer=null;await chrome.storage.local.set({bbWatcherEnabled:false});toast('Brainbox watcher: Fiverr page changed, watcher stopped.');return}location.reload()},every);}
  startWatcher();
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&['bbWatcherEnabled','bbWatchInterval','bbStopOnChange'].some(k=>changes[k]))startWatcher()});

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    (async()=>{try{
      if(msg.type==='BB_WATCH_CONFIG'){await startWatcher();return sendResponse({ok:true})}
      if(msg.type==='BB_SCAN_PAGE')return sendResponse({gigs:scan()});
      if(msg.type==='BB_GIG_HEALTH')return sendResponse(health());
      if(msg.type==='BB_PAGE_CONTEXT')return sendResponse(context());
      if(msg.type==='BB_SAVE_DRAFT'){const draft=fields();await chrome.storage.local.set({bbDraft:{url:location.href,savedAt:Date.now(),fields:draft}});return sendResponse({count:draft.length})}
      if(msg.type==='BB_RESTORE_DRAFT'){const d=await chrome.storage.local.get('bbDraft');if(!d.bbDraft?.fields?.length)throw new Error('No saved draft found.');return sendResponse({count:applyDraft(d.bbDraft.fields)})}
    }catch(e){sendResponse({error:e.message})}})();return true;
  });
})();