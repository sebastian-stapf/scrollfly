'use strict';
// The public server receives no feed or frames. An installed companion renders
// the connected dashboard in its own, isolated extension-origin document.
const extensionOrigin='chrome-extension://nfcmgmlnmhomgmcghdifhkiiolkppfmd';
const companion=document.createElement('iframe');
companion.src=extensionOrigin+'/index.html';companion.title='Your private Scrollfly TikTok companion';
companion.allow='camera; microphone; display-capture; autoplay';companion.hidden=true;
window.addEventListener('message',event=>{
  if(event.origin!==extensionOrigin || event.source!==companion.contentWindow || event.data?.scrollflyLiveReady!==true)return;
  companion.hidden=false;companion.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:100';
  for(const child of [...document.body.children])if(child!==companion)child.remove();
});
document.body.append(companion);
document.getElementById('connect').addEventListener('click',()=>{location.href='SETUP.html';});
document.getElementById('status').textContent='Install the companion, open your TikTok For You tab, and click Scrollfly in Chrome. Your live feed appears here.';
FlyComic.create(document.getElementById('fly')).then(view=>view.draw(0,{fraction:0,anticipation:0,after:1,liked:false,reach:0,cheer:0,swipeProgress:1})).catch(()=>{});
const anatomy=new FlyBrain.BrainView(document.getElementById('brain-canvas'));
fetch('brain-geometry.json').then(r=>r.json()).then(data=>anatomy.setGeometry(data)).catch(()=>{});
