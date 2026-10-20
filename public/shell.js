const nav=document.querySelector('.app-nav');
nav?.addEventListener('focusin',event=>{
  const link=event.target.closest('a');
  if(!link||nav.scrollWidth<=nav.clientWidth)return;
  // Fully expose a focused destination in the small-screen navigation rail.
  // Some browsers otherwise leave a partly visible link clipped at an edge.
  link.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
});
function mainPath(path){return path.endsWith('/')||path.endsWith('/index.html');}
function updateNavigation(context){
  if(!nav)return;
  const page=location.pathname.split('/').pop();
  const current=page==='capital.html'?'Capital Studio':page==='casebook.html'?'Casebook':page==='thesis.html'?'Thesis Lab':page==='horizon.html'?'Value Horizon':context||(/^#(?:sources|source-)/.test(location.hash)?'Evidence':/^#(?:workspace|scenario=|inspect=|financing|methodology)/.test(location.hash)?'Model':'Overview');
  for(const link of nav.querySelectorAll('a')){
    if(link.textContent.trim()===current)link.setAttribute('aria-current',mainPath(location.pathname)?'location':'page');else link.removeAttribute('aria-current');
  }
}
nav?.addEventListener('click',event=>{
  const link=event.target.closest('a');if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const target=new URL(link.href);
  if(target.origin===location.origin&&mainPath(target.pathname)&&mainPath(location.pathname)){
    event.preventDefault();
    if(location.hash===target.hash)window.dispatchEvent(new CustomEvent('workspace:navigate',{detail:{hash:target.hash}}));else location.hash=target.hash;
  }
});
window.addEventListener('hashchange',()=>updateNavigation());
window.addEventListener('workspace:context',event=>updateNavigation(event.detail?.section));
updateNavigation();
