// Rotate the complete Leaflet viewport and invert pointer coordinates, keeping
// the original geographic map and measurement geometry unchanged.
export function installRotation(map,button,panel){
 const L=window.L,el=map.getContainer(),wrap=el.parentElement;
 let angle=0,side=0,applying=false;const wasDragging=map.dragging.enabled();map.dragging.disable();
 const inverse=(x,y)=>{const a=-angle*Math.PI/180;return {x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)};};
 const center=()=>{const r=wrap.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
 const transformEvent=e=>{
  const c=center(),pos=p=>{const v=inverse(p.clientX-c.x,p.clientY-c.y);return {clientX:c.x+v.x,clientY:c.y+v.y,screenX:p.screenX,screenY:p.screenY,identifier:p.identifier,target:p.target};};
  const v=pos(e);return {type:e.type,target:e.target,button:e.button,buttons:e.buttons,which:e.which,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,altKey:e.altKey,...v,touches:e.touches?Array.from(e.touches,pos):undefined,changedTouches:e.changedTouches?Array.from(e.changedTouches,pos):undefined,preventDefault:()=>e.preventDefault(),stopPropagation:()=>e.stopPropagation(),originalEvent:e};
 };
 // Draggable computes deltas in screen coordinates. Convert both endpoints.
 const proto=L.Draggable.prototype,down=proto._onDown,move=proto._onMove,scale=L.DomUtil.getScale;
 proto._onDown=function(e){this._campoRotate=el.contains(this._element);const result=down.call(this,this._campoRotate?transformEvent(e):e);if(this._campoRotate)this._parentScale={x:1,y:1};return result;};
 proto._onMove=function(e){return move.call(this,this._campoRotate?transformEvent(e):e);};
 L.DomUtil.getScale=function(target){if(el.contains(target))return {x:1,y:1,boundingClientRect:target.getBoundingClientRect()};return scale(target);};
 map.mouseEventToContainerPoint=function(e){const c=center(),p=inverse(e.clientX-c.x,e.clientY-c.y);return L.point(p.x+side/2,p.y+side/2);};
 if(wasDragging)map.dragging.enable();
 const controls=el.querySelector('.leaflet-control-container');wrap.appendChild(controls);controls.classList.add('rotation-controls');
 panel.hidden=true;panel.replaceChildren();
 button.title='Restablecer norte · gira el mapa con dos dedos';button.setAttribute('aria-label','Restablecer norte');button.removeAttribute('aria-expanded');
 function set(a){angle=((Number(a)%360)+360)%360;el.style.transform=`rotate(${angle}deg)`;wrap.style.setProperty('--map-bearing',`${-angle}deg`);button.textContent=Math.abs(angle)<.05?'N ↑':'↻ '+Math.round(angle)+'°';map.fire('rotate');}
 function resize(){if(applying||!wrap.clientWidth||!wrap.clientHeight)return;applying=true;const c=map.getCenter();side=Math.ceil(Math.hypot(wrap.clientWidth,wrap.clientHeight));Object.assign(el.style,{width:side+'px',height:side+'px',position:'absolute',left:(wrap.clientWidth-side)/2+'px',top:(wrap.clientHeight-side)/2+'px',transformOrigin:'50% 50%'});map.invalidateSize({pan:false});map.setView(c,map.getZoom(),{animate:false});applying=false;}
 // fitBounds must fit the visible rectangle, not the oversized render square.
 const fit=map.fitBounds;
 map.fitBounds=function(bounds,options={}){const b=L.latLngBounds(bounds),z=map.getZoom(),sw=map.project(b.getSouthWest(),z),ne=map.project(b.getNorthEast(),z),a=angle*Math.PI/180,w=Math.abs(ne.x-sw.x),h=Math.abs(ne.y-sw.y),rw=Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a)),rh=Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a));const pad=options.padding||[30,60],p1=options.paddingTopLeft||pad,p2=options.paddingBottomRight||pad;const availW=Math.max(80,wrap.clientWidth-p1[0]-p2[0]),availH=Math.max(80,wrap.clientHeight-p1[1]-p2[1]);const target=Math.floor(z+Math.log2(Math.min(availW/Math.max(rw,1),availH/Math.max(rh,1))));return map.setView(b.getCenter(),Math.min(options.maxZoom??Infinity,target),{animate:options.animate??false});};
 const observer=new ResizeObserver(resize);observer.observe(wrap);resize();set(0);
 button.onclick=()=>set(0);
 // Own the two-finger gesture so Leaflet's pinch handler cannot compete with
 // rotation. Anchor the same geographic point under the moving midpoint.
 map.touchZoom?.disable();el.style.touchAction='none';
 let gesture=null,blocked=false,frame=0,pending=null,restoreDrag=false,suppressClick=0;
 const midpoint=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
 const distance=t=>Math.hypot(t[1].clientX-t[0].clientX,t[1].clientY-t[0].clientY);
 const direction=t=>Math.atan2(t[1].clientY-t[0].clientY,t[1].clientX-t[0].clientX)*180/Math.PI;
 const stop=e=>{if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();};
 function apply(t,finish=false){
  if(!gesture)return;
  const mid=midpoint(t),delta=((direction(t)-gesture.direction+540)%360)-180;
  const min=map.getMinZoom(),max=map.getMaxZoom();let zoom=Math.max(min,Math.min(max,gesture.zoom+Math.log2(Math.max(1,distance(t))/gesture.distance)));
  if(finish&&gesture.snap)zoom=Math.max(min,Math.min(max,Math.round(zoom/gesture.snap)*gesture.snap));
  set(gesture.angle+delta);const c=center(),offset=inverse(mid.x-c.x,mid.y-c.y),anchor=map.project(gesture.anchor,zoom);
  map.setView(map.unproject(L.point(anchor.x-offset.x,anchor.y-offset.y),zoom),zoom,{animate:false});
 }
 function start(e){
  if(e.touches.length!==2||blocked)return;
  stop(e);map.stop();restoreDrag=map.dragging.enabled();map.dragging.disable();
  const t=Array.from(e.touches),mid=midpoint(t);
  gesture={angle,zoom:map.getZoom(),distance:Math.max(1,distance(t)),direction:direction(t),anchor:map.containerPointToLatLng(map.mouseEventToContainerPoint({clientX:mid.x,clientY:mid.y})),snap:map.options.zoomSnap};
  map.options.zoomSnap=0;pending=t;blocked=true;
 }
 function moving(e){if(!blocked)return;stop(e);if(!gesture||e.touches.length!==2)return;pending=Array.from(e.touches);if(!frame)frame=requestAnimationFrame(()=>{frame=0;apply(pending);});}
 function ending(e){
  if(!blocked)return;stop(e);
  if(e.touches.length<2&&gesture){if(frame)cancelAnimationFrame(frame);frame=0;apply(pending,true);map.options.zoomSnap=gesture.snap;gesture=null;suppressClick=Date.now()+400;}
  if(!e.touches.length){blocked=false;pending=null;if(restoreDrag)map.dragging.enable();}
 }
 el.addEventListener('touchstart',start,{capture:true,passive:false});
 document.addEventListener('touchmove',moving,{capture:true,passive:false});
 document.addEventListener('touchend',ending,{capture:true,passive:false});
 document.addEventListener('touchcancel',ending,{capture:true,passive:false});
 el.addEventListener('click',e=>{if(blocked||Date.now()<suppressClick)stop(e);},{capture:true});
 return {setBearing:set,getBearing:()=>angle};
}
