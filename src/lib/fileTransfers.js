import {TdSmartUpload, tdUploadSession, tdStorageEndpoint, tdUploadAuthError, tdUploadRetry} from './smartStorageUpload.js';
import {Upload} from 'tus-js-client';
import {supabase} from './supabase.js';

const types={
 pdf:'application/pdf',
 docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 txt:'text/plain',csv:'text/csv',
 jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',
 webp:'image/webp',gif:'image/gif',
 mp4:'video/mp4',webm:'video/webm',
 mp3:'audio/mpeg',wav:'audio/wav'
};

export function fileExtension(name){
 return String(name||'').toLowerCase()
  .match(/\.([a-z0-9]{1,20})$/)?.[1]||'bin';
}

export function fileMime(value){
 const name=typeof value==='string'?value:value?.name;
 return types[fileExtension(name)]||'application/octet-stream';
}

export function validateTransferFile(file){
 if(!file||!Number.isSafeInteger(file.size)||file.size<1)
  throw Error('Choose a non-empty file.');
 if(!file.name||file.name.length>200||
    /[/\\\x00-\x1f\x7f]/.test(file.name))
  throw Error('Use a filename of up to 200 characters without path characters.');
}

export function formatFileSize(value){
 const bytes=Number(value);
 if(!Number.isFinite(bytes)||bytes<0)return 'Unknown size';
 if(!bytes)return '0 B';
 const units=['B','KB','MB','GB','TB'];
 const unit=Math.min(units.length-1,Math.floor(Math.log(bytes)/Math.log(1024)));
 return (bytes/1024**unit).toLocaleString('en-ZA',{
  maximumFractionDigits:unit?1:0
 })+' '+units[unit];
}

async function sessionFor(expected){
 const {data,error}=await supabase.auth.getSession();
 const session=data.session;
 if(error||!session||(expected&&session.user.id!==expected))
  throw Error('Your account changed. Sign in again before continuing.');
 return session;
}

export async function uploadStoredFile(bucket,path,file,userId){
 let tdUploadNeedsRefresh = false, tdUploadAuthRetried = false;

 try{
  validateTransferFile(file);
  const session=await sessionFor(userId);
  const actor=session.user.id;
  const endpoint=new URL(import.meta.env.VITE_SUPABASE_URL);
  if(/^[a-z0-9]+\.supabase\.co$/.test(endpoint.hostname))
   endpoint.hostname=endpoint.hostname.replace(
    '.supabase.co','.storage.supabase.co'
   );
  endpoint.pathname='/storage/v1/upload/resumable';
  endpoint.search='';endpoint.hash='';

  const notify=(state,sent=0)=>window.dispatchEvent(
   new CustomEvent('td-file-transfer',{
    detail:{actor,path,name:file.name,total:file.size,sent,state}
   })
  );

  notify('uploading');

  return await new Promise(resolve=>{
   const upload=new TdSmartUpload(file,{
metadata:{
     bucketName:bucket,
     objectName:path,
     contentType:fileMime(file),
     cacheControl:'0'
    },
onProgress:sent=>notify('uploading',sent),
onSuccess:()=>{
     notify('complete',file.size);
     resolve({data:{path},error:null});
    },
onError:error=>{
     notify('error');
     const status=error.originalResponse?.getStatus?.();
     const message=status===413
      ?'This file exceeds the workspace Storage limit. Check Supabase Storage settings.'
      :error.message||'Upload interrupted. Select the same file and retry.';
     resolve({data:null,error:{message,statusCode:status}});
    },
endpoint: tdStorageEndpoint(),
headers: {'x-upsert': 'false'},
chunkSize: 6 * 1024 * 1024,
parallelUploads: 1,
uploadDataDuringCreation: true,
removeFingerprintOnSuccess: true,
retryDelays: [0, 1000, 2500, 5000],
fingerprint: async () => JSON.stringify([
      'td-upload-jwt-v3',
      userId,
      bucket,
      path,
      file.name,
      file.size,
      file.lastModified || 0
    ]),
onBeforeRequest: async request => {
      const session = await tdUploadSession(
        userId, tdUploadNeedsRefresh
      );

      tdUploadNeedsRefresh = false;

      request.setHeader(
        'Authorization',
        'Bearer ' + session.access_token
      );

      const key = String(
        import.meta.env.VITE_SUPABASE_ANON_KEY ||
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        ''
      ).trim();

      if (key) request.setHeader('apikey', key);
    },
onShouldRetry: error => {
      if (tdUploadAuthError(error)) {
        if (tdUploadAuthRetried) return false;
        tdUploadAuthRetried = true;
        tdUploadNeedsRefresh = true;
        return true;
      }

      return tdUploadRetry(error);
    }
});

   upload.findPreviousUploads().then(previous=>{
    if(previous.length)upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
   }).catch(error=>{
    notify('error');
    resolve({data:null,error:{message:error.message}});
   });
  });
 }catch(error){
  return {data:null,error:{message:error.message}};
 }
}

export async function downloadStoredFile(bucket,path,name,userId){
 const session=await sessionFor(userId);
 const filename=String(name||'attachment')
  .replace(/[/\\\x00-\x1f\x7f]/g,'_');
 const {data,error}=await supabase.storage.from(bucket)
  .createSignedUrl(path,300,{download:filename});
 if(error)throw error;
 await sessionFor(session.user.id);
 const link=document.createElement('a');
 link.href=data.signedUrl;
 link.download=filename;
 link.rel='noopener';
 document.body.appendChild(link);
 link.click();
 link.remove();
}
