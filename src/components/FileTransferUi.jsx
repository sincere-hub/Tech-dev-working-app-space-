import {useEffect,useState} from 'react';
import {
 File,FileText,Table2,Presentation,Archive,
 Image as ImageIcon,Film,Music,Code2,Download
} from 'lucide-react';
import {
 fileExtension,formatFileSize,downloadStoredFile
} from '../lib/fileTransfers.js';
import './files-workspace.css';

export function FileTypeIcon({name=''}){
 const ext=fileExtension(name);
 let Icon=File,tone='generic';
 if(ext==='pdf'){Icon=FileText;tone='pdf';}
 else if(/^(docx?|odt|rtf|txt|md)$/.test(ext)){Icon=FileText;tone='word';}
 else if(/^(xlsx?|ods|csv)$/.test(ext)){Icon=Table2;tone='sheet';}
 else if(/^(pptx?|odp)$/.test(ext)){Icon=Presentation;tone='slides';}
 else if(/^(zip|rar|7z|tar|gz|bz2)$/.test(ext)){Icon=Archive;tone='archive';}
 else if(/^(png|jpe?g|webp|gif|svg|heic|avif|bmp|tiff?)$/.test(ext)){
  Icon=ImageIcon;tone='image';
 }else if(/^(mp4|webm|mov|mkv|avi)$/.test(ext)){Icon=Film;tone='video';}
 else if(/^(mp3|wav|ogg|m4a|flac|aac)$/.test(ext)){Icon=Music;tone='audio';}
 else if(/^(js|jsx|ts|tsx|json|html|css|py|java|sql|xml|yml|yaml)$/.test(ext)){
  Icon=Code2;tone='code';
 }
 return <span className="td-file-type-icon" data-tone={tone} aria-hidden="true">
  <Icon size={28} strokeWidth={1.6}/>
  <small>{ext==='bin'?'FILE':ext.slice(0,6).toUpperCase()}</small>
 </span>;
}

export function TransferProgress({userId}){
 const [transfer,setTransfer]=useState(null);
 useEffect(()=>{
  const receive=event=>{
   if(event.detail?.actor===userId)setTransfer(event.detail);
  };
  window.addEventListener('td-file-transfer',receive);
  return()=>window.removeEventListener('td-file-transfer',receive);
 },[userId]);
 if(!transfer||transfer.actor!==userId)return null;
 const percent=Math.min(100,Math.max(0,
  transfer.sent/transfer.total*100
 ));
 return <div className="td-transfer-progress" role="status">
  <strong>{transfer.name}</strong>
  <span>{
   transfer.state==='complete'?'Upload complete':
   transfer.state==='error'?'Upload interrupted — use Retry to continue':
   'Uploading · '+Math.floor(percent)+'%'
  }</span>
  <progress value={percent} max="100" aria-label="File upload progress"/>
 </div>;
}

export function ChatFileMessage({attachment,userId}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const name=attachment.file_name||'File attachment';
 return <div className="td-chat-file-card">
  <FileTypeIcon name={name}/>
  <div className="td-chat-file-copy">
   <strong>{name}</strong>
   <small>{formatFileSize(attachment.bytes)}</small>
   <button type="button" disabled={busy} onClick={async()=>{
    setBusy(true);setError('');
    try{
     await downloadStoredFile(
      'td-chat-media',attachment.path,name,userId
     );
    }catch(error){setError(error.message);}
    finally{setBusy(false);}
   }}>
    <Download size={15}/>{busy?'Preparing…':'Download file'}
   </button>
   {error&&<p role="alert">{error}</p>}
  </div>
 </div>;
}
