import {isoDate,norm} from './data-model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function todayColombia(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function harvestAlerts(p,r,today=todayColombia()){
 const issues=[];if(!r)return {issues:['Fuera de la Ruta de sacarosa actual'],days:null,weakest:[]};
 const date=isoDate(r.date),cut=isoDate(p.cosecha),now=isoDate(today);
 const days=date&&now?Math.round((Date.parse(now)-Date.parse(date))/86400000):null;
 if(days===null)issues.push('Evaluación sin fecha válida');else if(days<0)issues.push('Fecha de evaluación futura');
 if(cut&&date&&cut>date)issues.push('Último corte posterior a la evaluación: revisar ciclo');
 if(!Number.isFinite(r.preharvest)||r.preharvest<=0)issues.push('Sin Pol de precosecha positivo');
 const components=[['Tiempo térmico',r.thermal],['Maduración',r.maturityScore],['Precosecha',r.preharvestScore],['Transitabilidad',r.transitScore]];
 const valid=components.filter(x=>Number.isFinite(x[1])&&x[1]>=1&&x[1]<=5);
 if(valid.length<4)issues.push('Componentes sin calificación válida');
 if(!Number.isFinite(r.score)||r.score<1||r.score>5)issues.push('Calificación final no válida');
 if(r.transitScore===1||norm(r.transitability).includes('no transitable'))issues.push('Acceso desfavorable según el archivo');
 if(!(Number.isFinite(p.area)&&p.area>0&&Number.isFinite(p.tch)&&p.tch>0))issues.push('Sin área o TCH positivo para toneladas históricas');
 const min=valid.length?Math.min(...valid.map(x=>x[1])):null;
 return {issues,days,weakest:valid.filter(x=>x[1]===min)};
}
export function harvestAlertHtml(p,r){
 const a=harvestAlerts(p,r);
 return `<div class="harvest-auto"><b>Revisión automática</b><p>${a.days===null?'Sin antigüedad calculable':a.days<0?'Evaluación futura':'Evaluación de hace '+a.days+' días'} · fecha actual de Colombia</p>${a.weakest.length?'<p>Menor calificación: '+a.weakest.map(x=>esc(x[0])+' ('+x[1]+'/5)').join(', ')+'.</p>':''}${a.issues.length?'<ul>'+a.issues.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p>Sin faltantes ni alertas de ciclo/acceso detectadas. No confirma las condiciones actuales del lote.</p>'}</div>`;
}
