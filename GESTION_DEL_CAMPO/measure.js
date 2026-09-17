import {distance} from './geo.js';
const R=6371008.8,rad=Math.PI/180;
export function measureGeometry(points,mode='area'){
 let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);
 const n=points.length,closed=mode==='area'&&n>=3;
 let area=0,invalid=false;
 if(closed){
  const origin=points[0],xy=points.map(p=>[(p.lng-origin.lng)*Math.cos(origin.lat*rad),(p.lat-origin.lat)]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const on=(a,b,c)=>Math.abs(cross(a,b,c))<1e-14&&c[0]>=Math.min(a[0],b[0])-1e-12&&c[0]<=Math.max(a[0],b[0])+1e-12&&c[1]>=Math.min(a[1],b[1])-1e-12&&c[1]<=Math.max(a[1],b[1])+1e-12;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
   if(j===i+1||(i===0&&j===n-1))continue;
   const a=xy[i],b=xy[(i+1)%n],c=xy[j],d=xy[(j+1)%n];
   if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))invalid=true;
  }
  for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n];area+=(b.lng-a.lng)*rad*(Math.sin(a.lat*rad)+Math.sin(b.lat*rad));}
  area=Math.abs(area)*R*R/2;
  if(area<.01)invalid=true;
 }
 return {length,perimeter:closed?length+distance(points[n-1],points[0]):length,area:closed&&!invalid?area:null,invalid};
}
export function installMeasure(map,{button,panel,onOpen}){
 const L=window.L,by=id=>panel.querySelector('#'+id),format=n=>n.toLocaleString('es-CO',{maximumFractionDigits:2});
 let points=[],mode='area',active=false,finished=false,doubleZoom=false;
 const layer=L.layerGroup().addTo(map);
 panel.innerHTML=`<div class="measurement-head"><h2>Medir en el mapa</h2><button id="measure-close" class="icon-btn" aria-label="Cerrar medición">×</button></div>
 <label for="measure-mode">Tipo de medición</label><select id="measure-mode"><option value="area">Área · tablón o franja</option><option value="line">Distancia · línea</option></select>
 <p id="measure-hint">Toca las esquinas siguiendo el borde del área. Mínimo 3 puntos.</p>
 <div id="measure-result" role="status" aria-live="polite"></div>
 <div class="measurement-actions"><button id="measure-undo" class="secondary">Deshacer punto</button><button id="measure-finish" class="primary">Terminar</button><button id="measure-new" class="secondary">Nueva medición</button></div>
 <p class="small-info">Arrastra los puntos para ajustar el contorno. Área aproximada según los puntos marcados y la imagen del mapa; no sustituye un levantamiento topográfico.</p>`;
 function render(){
  layer.clearLayers();const result=measureGeometry(points,mode),coords=points.map(p=>[p.lat,p.lng]);
  if(coords.length>=2)(mode==='area'&&coords.length>=3?L.polygon(coords,{color:result.invalid?'#bb2438':'#ef3038',weight:3,fillOpacity:.2,interactive:false}):L.polyline(coords,{color:'#ef3038',weight:3,interactive:false})).addTo(layer);
  points.forEach((p,i)=>{
   const marker=L.marker([p.lat,p.lng],{draggable:true,keyboard:false,autoPan:true,icon:L.divIcon({className:'measurement-point',html:String(i+1),iconSize:[26,26],iconAnchor:[13,13]})}).addTo(layer);
   marker.on('click',e=>L.DomEvent.stopPropagation(e));
   marker.on('dragend',()=>{const pos=marker.getLatLng();points[i]={lat:pos.lat,lng:pos.lng};render();});
  });
  const enough=points.length>=(mode==='area'?3:2);
  by('measure-result').innerHTML=`<span>${points.length} puntos${finished?' · Medición terminada':''}</span>`+(result.invalid?'<strong class="measurement-error">El contorno se cruza o no forma un área. Ajusta los puntos.</strong>':mode==='area'?`<strong>${result.area===null?'—':format(result.area)} m²</strong><span>${result.area===null?'—':format(result.area/10000)} ha · Perímetro: ${format(result.perimeter)} m</span>`:`<strong>${format(result.length)} m</strong><span>${format(result.length/1000)} km</span>`);
  by('measure-undo').disabled=!points.length;by('measure-finish').disabled=!enough||result.invalid||finished;
  by('measure-hint').textContent=finished?'Puedes ajustar los vértices o iniciar una nueva medición.':mode==='area'?'Toca las esquinas siguiendo el borde de la franja o tablón. El último punto se une al primero.':'Toca los puntos a lo largo de la línea que quieres medir.';
 }
 function add(e){if(!active)return false;if(e.originalEvent?._measured)return true;if(e.originalEvent)e.originalEvent._measured=true;if(finished)return true;
  const p={lat:e.latlng.lat,lng:e.latlng.lng};if(points.some(x=>distance(x,p)<.1))return true;points.push(p);render();return true;
 }
 function close(){active=false;panel.hidden=true;button.classList.remove('active');button.setAttribute('aria-pressed','false');document.body.classList.remove('measuring');layer.clearLayers();if(doubleZoom)map.doubleClickZoom.enable();}
 function open(){active=true;panel.hidden=false;button.classList.add('active');button.setAttribute('aria-pressed','true');document.body.classList.add('measuring');doubleZoom=map.doubleClickZoom.enabled();map.doubleClickZoom.disable();onOpen();render();}
 button.onclick=()=>active?close():open();by('measure-close').onclick=close;by('measure-undo').onclick=()=>{points.pop();finished=false;render();};by('measure-new').onclick=()=>{points=[];finished=false;render();};by('measure-finish').onclick=()=>{finished=true;render();};by('measure-mode').onchange=e=>{mode=e.target.value;finished=false;render();};
 L.DomEvent.disableClickPropagation(panel);L.DomEvent.disableScrollPropagation(panel);map.on('click',add);
 return {add,isActive:()=>active};
}
