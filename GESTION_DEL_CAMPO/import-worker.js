importScripts('./vendor/xlsx-0.20.3.min.js');
self.onmessage=async e=>{try{
 const {file,type,current,asOf}=e.data;
 if(!/\.(xlsx|csv)$/i.test(file.name))throw Error('Usa un archivo .xlsx o .csv.');
 if(type==='fichas'&&!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw Error('Indica la fecha de corte del Excel de suertes.');
 if(file.size>60e6)throw Error('El Excel supera 60 MB. Divide el reporte por período.');
 self.postMessage({progress:'Leyendo Excel…'});
 const data=await file.arrayBuffer();if(/\.xlsx$/i.test(file.name)){const view=new DataView(data);let total=0;for(let i=0;i+46<data.byteLength;i++){if(view.getUint32(i,true)===0x02014b50){total+=view.getUint32(i+24,true);i+=45+view.getUint16(i+28,true)+view.getUint16(i+30,true)+view.getUint16(i+32,true);}}if(total>350e6)throw Error('El Excel descomprimido supera 350 MB. Divide el reporte.');}const workbook=XLSX.read(data,{type:'array',cellDates:false,sheetRows:300002});
 const {buildImport,norm}=await import('./data-model.js');let rows=null;
 for(const name of workbook.SheetNames){const candidate=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:true,defval:null,blankrows:false});const h=candidate[0]?.map(norm)||[];if(h.includes(norm(({labores:'Nombre Labor',fichas:'Nombre Grupo de Abonos',sacarosa:'Calificacion_Final',combustibles:'Mes',lara:'Rango'})[type]))){rows=candidate;break;}}
 if(!rows)throw Error('No se encontró una hoja con los encabezados esperados.');
 if(rows.length>300001)throw Error('El archivo supera 300.000 filas. Divide el período.');
 self.postMessage({progress:'Cruzando haciendas y suertes…'});
 const {buildSucrose,buildFuels}=await import('./cosecha-model.js');const {buildLara}=await import('./lara.js');const result=type==='lara'?buildLara(rows,current,file.name):type==='sacarosa'?buildSucrose(rows,current,file.name):type==='combustibles'?buildFuels(rows,file.name):buildImport(rows,type,current,asOf,file.name);self.postMessage({result});
 }catch(error){self.postMessage({error:error.message||'No se pudo leer el archivo.'});}};
