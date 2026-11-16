import React from 'react';
import {documentTypeLabel} from './documentTypes.js';

export default function DocumentViewer({viewer,url,status,zoom,onZoom,onClose,onUpload}){
 if(!viewer)return null;
 return <div className="document-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
  <section className="document-dialog" role="dialog" aria-modal="true" aria-label={viewer.name+' '+documentTypeLabel(viewer.documentType)}>
   <header className="document-header">
    <div><strong>{viewer.name}</strong><span>{documentTypeLabel(viewer.documentType)}</span></div>
    <button type="button" onClick={onClose} autoFocus>닫기</button>
   </header>
   {url?<><div className="document-tools">
    <button type="button" onClick={()=>onZoom(Math.max(100,zoom-50))} disabled={zoom<=100} aria-label="축소">−</button>
    <span>{zoom}%</span>
    <button type="button" onClick={()=>onZoom(Math.min(300,zoom+50))} disabled={zoom>=300} aria-label="확대">＋</button>
   </div><div className="document-scroll"><img src={url} alt={viewer.name+' '+documentTypeLabel(viewer.documentType)} style={{width:zoom+'%'}}/></div></>:
   <div className="document-empty"><p role="status">{status||'불러오는 중…'}</p>{!viewer.imageId&&<button type="button" className="primary" onClick={onUpload}>사진 넣기</button>}</div>}
  </section>
 </div>
}
