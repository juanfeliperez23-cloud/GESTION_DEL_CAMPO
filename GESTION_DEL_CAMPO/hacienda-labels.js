// Area-weighted planar centroid in WGS84 coordinates. A constant local
// equirectangular scale cancels in the centroid calculation for these fields.
export function haciendaCenters(features){
 const groups=new Map();
 for(const f of features){
  const p=f.properties,id=p.codHacienda;
  if(!groups.has(id))groups.set(id,{id,name:p.hacienda,area:0,x:0,y:0});
  const g=groups.get(id),polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
  for(const rings of polygons)for(const [index,ring] of rings.entries()){
   if(ring.length<3)continue;
   const [ox,oy]=ring[0];let twice=0,mx=0,my=0;
   for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],x=a[0]-ox,y=a[1]-oy,u=b[0]-ox,v=b[1]-oy,c=x*v-u*y;
    twice+=c;mx+=(x+u)*c;my+=(y+v)*c;
   }
   if(Math.abs(twice)<1e-18)continue;
   const area=Math.abs(twice)/2*(index===0?1:-1);
   g.area+=area;g.x+=(ox+mx/(3*twice))*area;g.y+=(oy+my/(3*twice))*area;
  }
 }
 return [...groups.values()].filter(g=>g.area>0).map(g=>({...g,lng:g.x/g.area,lat:g.y/g.area}));
}
export function installHaciendaLabels(map,features,button){
 const L=window.L,centers=haciendaCenters(features),pane=map.createPane('haciendaNames');pane.style.zIndex='450';pane.style.pointerEvents='none';
 const layer=L.layerGroup().addTo(map),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 ctx.font='600 12px sans-serif';let visibleIds=new Set(),visibleLots=new Set(),enabled=true;
 for(const g of centers){const span=document.createElement('span');span.className='hacienda-name';span.textContent=g.name;g.width=ctx.measureText(g.name).width+12;g.marker=L.marker([g.lat,g.lng],{pane:'haciendaNames',interactive:false,keyboard:false,icon:L.divIcon({className:'hacienda-name-anchor',html:span,iconSize:[0,0],iconAnchor:[0,0]})});}
 const lots=haciendaCenters(features.map(f=>({...f,properties:{...f.properties,codHacienda:f.id,hacienda:f.properties.suerte}})));
 for(const g of lots){const span=document.createElement('span');span.className='suerte-name';span.textContent=g.name;g.width=ctx.measureText(g.name).width+10;g.marker=L.marker([g.lat,g.lng],{pane:'haciendaNames',interactive:false,keyboard:false,icon:L.divIcon({className:'hacienda-name-anchor',html:span,iconSize:[0,0],iconAnchor:[0,0]})});}
 function draw(){
  layer.clearLayers();if(!enabled)return;
  const size=map.getSize(),occupied=[];
  for(const g of centers.filter(g=>visibleIds.has(g.id)).sort((a,b)=>b.area-a.area||a.id.localeCompare(b.id))){
   const pt=map.latLngToContainerPoint([g.lat,g.lng]);
   const box={l:pt.x-g.width/2,r:pt.x+g.width/2,t:pt.y-10,b:pt.y+10};
   if(box.r<0||box.l>size.x||box.b<0||box.t>size.y)continue;
   if(occupied.some(o=>box.l<o.r+5&&box.r>o.l-5&&box.t<o.b+4&&box.b>o.t-4))continue;
   occupied.push(box);layer.addLayer(g.marker);
  }
  // Numbers sit just below each lot centroid; reserve farm names first.
  if(map.getZoom()>=15)for(const g of lots.filter(g=>visibleLots.has(g.id)).sort((a,b)=>b.area-a.area||a.id.localeCompare(b.id))){
   const pt=map.latLngToContainerPoint([g.lat,g.lng]);
   const box={l:pt.x-g.width/2,r:pt.x+g.width/2,t:pt.y+16,b:pt.y+34};
   if(box.r<0||box.l>size.x||box.b<0||box.t>size.y)continue;
   if(occupied.some(o=>box.l<o.r+3&&box.r>o.l-3&&box.t<o.b+3&&box.b>o.t-3))continue;
   occupied.push(box);layer.addLayer(g.marker);
  }
 }
 map.on('moveend zoomend resize rotate',draw);
 button.onclick=()=>{enabled=!enabled;button.setAttribute('aria-pressed',String(enabled));button.classList.toggle('active',enabled);draw();};
 return current=>{visibleLots=new Set(current.map(f=>f.id));visibleIds=new Set(current.map(f=>f.properties.codHacienda));draw();};
}
