/** Document-start integration for each WebKit frame. Captions stay OFF until a trusted user
 * explicitly changes the CC control. YouTube can apply its preference after metadata/ready,
 * so a one-shot OFF is insufficient. No preference is persisted by the app.
 */
export const FRAME_SCRIPT = String.raw`(function(){
  try {
    Object.defineProperty(window,'ManagedMediaSource',{value:undefined,configurable:true});
    Object.defineProperty(window,'MediaSource',{value:undefined,configurable:true});
  } catch(e) {}
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;
  var userCaptionChoice=false, captionMenu=false, observer;
  var observedVideos=new WeakSet();
  var parentOrigin='https://yt-mirror-loop.local';
  try { parentOrigin=new URL(document.referrer).origin; } catch(e) {}
  function releaseCaptionDefault(){
    userCaptionChoice=true;
    if(observer) observer.disconnect();
    var style=document.getElementById('ytm-default-captions');
    if(style) style.remove();
  }
  function captionsOff(){
    if(userCaptionChoice) return;
    // Hide selectable caption overlays while YouTube is still applying its saved preference.
    if(!document.getElementById('ytm-default-captions') && document.documentElement){
      var style=document.createElement('style'); style.id='ytm-default-captions';
      style.textContent='.ytp-caption-window-container,.caption-window{display:none!important}';
      (document.head||document.documentElement).appendChild(style);
    }
    var video=document.querySelector('video');
    if(video){
      for(var i=0;i<video.textTracks.length;i++) {
        var track=video.textTracks[i];
        if((track.kind==='captions'||track.kind==='subtitles') && track.mode!=='disabled') track.mode='disabled';
      }
      if(!observedVideos.has(video)){
        observedVideos.add(video);
        video.textTracks.addEventListener('addtrack',captionsOff);
        video.textTracks.addEventListener('change',captionsOff);
      }
    }
    var button=document.querySelector('.ytp-subtitles-button');
    if(button && button.getAttribute('aria-pressed')==='true') button.click();
  }
  document.addEventListener('click',function(event){
    // Our own programmatic OFF click must not be mistaken for the user's ON choice.
    if(!event.isTrusted || !(event.target instanceof Element)) return;
    if(event.target.closest('.ytp-subtitles-button')) { releaseCaptionDefault(); return; }
    if(event.target.closest('.ytp-settings-button,.ytp-panel-back-button,.ytp-panel-header')) { captionMenu=false; return; }
    var item=event.target.closest('.ytp-menuitem');
    if(!item) return;
    if(captionMenu) { releaseCaptionDefault(); captionMenu=false; return; }
    var label=item.querySelector('.ytp-menuitem-label');
    if(/subtitles|captions|자막/i.test(label ? label.textContent : item.textContent)) captionMenu=true;
  },true);
  // iOS controls can react on touch release before the synthetic click is delivered.
  document.addEventListener('pointerdown',function(event){
    if(!event.isTrusted || !(event.target instanceof Element)) return;
    if(event.target.closest('.ytp-subtitles-button') || (captionMenu && event.target.closest('.ytp-menuitem'))) releaseCaptionDefault();
  },true);
  document.addEventListener('keydown',function(event){
    if(event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]')) return;
    if(event.isTrusted && event.key && event.key.toLowerCase()==='c' && !event.ctrlKey && !event.metaKey && !event.altKey) releaseCaptionDefault();
  },true);
  function showControls(show){
    var style=document.getElementById('ytm-tv-controls');
    if(show){ if(style) style.remove(); return; }
    if(!style){
      style=document.createElement('style'); style.id='ytm-tv-controls';
      style.textContent='.ytp-chrome-top,.ytp-chrome-bottom,.ytp-settings-menu,.ytp-gradient-top,.ytp-gradient-bottom,.ytp-pause-overlay,.ytp-ce-element,.ytp-large-play-button{display:none!important}';
      if(document.head||document.documentElement) (document.head||document.documentElement).appendChild(style);
      else document.addEventListener('DOMContentLoaded',function(){showControls(false);},{once:true});
    }
  }
  if(window.__YTM_TV__) showControls(false);
  window.addEventListener('message',function(event){
    if(event.source!==parent || event.origin!==parentOrigin) return;
    if(event.data && event.data.ytm==='controls') showControls(!!event.data.show);
    if(event.data && event.data.ytm==='captions-default') captionsOff();
  });
  document.addEventListener('seeking',function(event){
    if(event.target instanceof HTMLVideoElement){
      parent.postMessage({ytm:'seek',t:event.target.currentTime},parentOrigin);
    }
  },true);
  document.addEventListener('loadedmetadata',captionsOff,true);
  observer=new MutationObserver(captionsOff);
  observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']});
  window.addEventListener('pagehide',function(){ if(observer) observer.disconnect(); },{once:true});
  captionsOff();
})();true;`;
