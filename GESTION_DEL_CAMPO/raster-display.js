export const indexResolution=name=>['NDVI','NDWI','EVI','SAVI'].includes(name)?10:20;
// Interpolation is for display only. A missing nearest cell remains missing.
// Never interpolate through a cloud/shadow/nodata neighbour.
export function displaySample(grid,width,height,x,y,smooth=true){
 const col=Math.max(0,Math.min(width-1,Math.floor(x+.5))),row=Math.max(0,Math.min(height-1,Math.floor(y+.5)));
 const center=grid[row*width+col];if(!Number.isFinite(center))return null;
 if(!smooth)return center;
 const x0=Math.floor(x),y0=Math.floor(y),dx=x-x0,dy=y-y0;
 const at=(a,b)=>grid[Math.max(0,Math.min(height-1,b))*width+Math.max(0,Math.min(width-1,a))];
 const values=[at(x0,y0),at(x0+1,y0),at(x0,y0+1),at(x0+1,y0+1)];
 if(values.some(v=>!Number.isFinite(v)))return center;
 return values[0]*(1-dx)*(1-dy)+values[1]*dx*(1-dy)+values[2]*(1-dx)*dy+values[3]*dx*dy;
}
export function nativeSample(array,xy){
 const col=Math.floor((xy[0]-array.origin[0])/array.res[0])-array.win[0];
 const row=Math.floor((xy[1]-array.origin[1])/array.res[1])-array.win[1];
 if(col<0||row<0||col>=array.width||row>=array.height)return NaN;
 return array.raw[row*array.width+col];
}
// Canvas even-odd fill preserves holes. Fill polygons separately to union overlaps.
export function polygonMask(ctx,feature,point){
 const features=feature.type==='FeatureCollection'?feature.features:[feature];
 ctx.fillStyle='#fff';
 for(const f of features){const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const polygon of polygons){ctx.beginPath();for(const ring of polygon){ring.forEach((p,i)=>{const [x,y]=point(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();}ctx.fill('evenodd');}
 }
}
