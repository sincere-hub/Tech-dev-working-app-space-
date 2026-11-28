import {useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase.js';

async function call(action,body={},fn='idp-repositories'){
 const {data,error}=await supabase.functions.invoke(fn,{body:{action,...body}});
 if(error){
  const detail=await error.context?.json?.().catch(()=>null);
  throw Error(detail?.error||error.message);
 }
 return data;
}

export default function IdpRepoWorkflow({mode,userId,admin,onDone}){
 const [list,setList]=useState(null);
 const [repo,setRepo]=useState('');
 const [branch,setBranch]=useState('');
 const [root,setRoot]=useState(null);
 const [info,setInfo]=useState(null);
 const [settings,setSettings]=useState({});
 const [provider,setProvider]=useState('');
 const [name,setName]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [reload,setReload]=useState(0);
 const locked=useRef(false),keys=useRef(new Map());

 useEffect(()=>{
  let active=true;
  setList(null);setError('');
  call('list').then(data=>{
   if(active){
    setList(data);
    setProvider(
     data.policy.default_provider||
     data.providers.find(p=>p.tested_at)?.id||''
    );
   }
  }).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[userId,reload]);

 useEffect(()=>{
  let active=true;
  setInfo(null);setSettings({});
  if(!repo)return()=>{active=false;};
  setLoading(true);setError('');
  call('inspect',{
   repo,
   ...(branch?{branch}:{}),
   ...(root!==null?{root}:{})
  }).then(data=>{
   if(active){
    setInfo(data);
    setSettings(data.config||{});
   }
  }).catch(e=>{
   if(active)setError(e.message);
  }).finally(()=>{
   if(active)setLoading(false);
  });
  return()=>{active=false;};
 },[repo,branch,root,reload]);

 function keyFor(body){
  const slot='td-idp-repo:'+userId+':'+mode+':'+JSON.stringify(body);
  let key=keys.current.get(slot);
  try{key||=sessionStorage.getItem(slot);}catch{}
  if(!key){
   key=crypto.randomUUID();
   try{sessionStorage.setItem(slot,key);}catch{}
  }
  keys.current.set(slot,key);
  return key;
 }

 async function submit(event){
  event.preventDefault();
  if(locked.current)return;
  locked.current=true;setBusy(true);setError('');
  try{
   const payload={
    repo,branch:info.branch,root:settings.root_dir,settings,
    ...(mode==='environment'?{provider}:{}),
    ...(mode==='scaffold'?{name}:{})
   };
   const result=await call(
    mode==='catalog'?'import':mode,
    {...payload,key:keyFor(payload)}
   );
   let message=mode==='catalog'
    ?'Repository registered in the service catalog.'
    :mode==='scaffold'
     ?'Private GitHub repository created and registered: '+result.repository_url
     :'Environment request saved.';

   if(mode==='environment'){
    if(result.status==='approved'){
     try{
      const env=await call('create',{id:result.id},'idp-environments');
      message='Environment '+env.status+
       '. Use its card below to check status and open it when ready.';
     }catch(e){
      message='Request saved. '+e.message+
       ' Use its environment card below to check or continue provisioning.';
     }
    }else if(result.status==='pending'){
     message='Environment request saved. An admin must approve it before provisioning.';
    }else{
     message='Existing request: '+result.status+
      '. Use its environment card below.';
    }
   }
   onDone(message);
  }catch(e){
   setError(e.message);
  }finally{
   locked.current=false;setBusy(false);
  }
 }

 async function template(){
  if(!window.confirm(
   'Enable '+repo+' as a reusable GitHub template? '+
   'This changes that repository’s template setting.'
  ))return;
  if(locked.current)return;
  locked.current=true;setBusy(true);setError('');
  try{
   await call('template',{repo});
   setReload(v=>v+1);
  }catch(e){
   setError(e.message);
  }finally{
   locked.current=false;setBusy(false);
  }
 }

 const tested=list?.providers.filter(p=>p.tested_at)||[];
 const complete=info?.config&&settings.build_command&&settings.publish_dir;
 const server=mode==='environment'&&
  tested.find(p=>p.id===provider)?.kind==='render'&&
  (settings.runtime!=='static'||settings.kind!=='website');

 return <form
  className="td-idp-v2-card td-idp-v2-form"
  onSubmit={submit}
  aria-label="Repository workflow"
 >
  <h2>{
   mode==='catalog'?'Import an existing repository':
   mode==='environment'?'Create a test environment':
   'Create a project in GitHub'
  }</h2>

  <p className="td-idp-v2-wide">{
   mode==='scaffold'
    ?'Choose a connected starter template and name your new private repository.'
    :'Choose a connected repository. Its service entry and detected build settings are filled automatically.'
  }</p>

  {!list&&!error&&<p role="status">Loading connected repositories…</p>}

  {error&&<p role="alert" className="td-idp-v2-wide">
   {error}{' '}
   <button type="button" disabled={busy}
    onClick={()=>setReload(v=>v+1)}>
    Retry connection
   </button>
  </p>}

  {list?.notice&&<p role="status" className="td-idp-v2-wide">
   {list.notice}
  </p>}

  {list&&<>
   <label>
    <span>{mode==='scaffold'?'Starter repository':'GitHub repository'}</span>
    <select required value={repo} disabled={busy}
     onChange={e=>{
      setRepo(e.target.value);setBranch('');setRoot(null);
     }}>
     <option value="">Select repository</option>
     {list.repositories.map(p=>
      <option key={p.slug} value={p.slug}>{p.slug}</option>
     )}
    </select>
   </label>

   {info&&<label>
    <span>Branch</span>
    <select value={info.branch} disabled={busy||mode==='scaffold'}
     onChange={e=>{setBranch(e.target.value);setRoot(null);}}>
     {info.branches.map(b=><option key={b}>{b}</option>)}
    </select>
   </label>}

   {info&&info.roots.length>1&&<label>
    <span>Project folder</span>
    <select required disabled={busy}
     value={root??info.config?.root_dir??'__choose__'}
     onChange={e=>setRoot(e.target.value)}>
     <option value="__choose__" disabled>Select project folder</option>
     {info.roots.map(p=>
      <option key={p} value={p}>{p||'Repository root'}</option>
     )}
    </select>
   </label>}

   {loading&&<p role="status">Inspecting project settings…</p>}

   {mode==='environment'&&tested.length>1&&<label>
    <span>Provider</span>
    <select required value={provider} disabled={busy}
     onChange={e=>setProvider(e.target.value)}>
     <option value="">Select connection</option>
     {tested.map(p=>
      <option key={p.id} value={p.id}>{p.name}</option>
     )}
    </select>
   </label>}

   {mode==='environment'&&tested.length===1&&
    <p>Provider: <strong>{tested[0].name}</strong></p>
   }

   {mode==='environment'&&!tested.length&&<p role="status">
    No tested provider is available. An admin can check the existing
    connection under Providers.
   </p>}

   {mode==='scaffold'&&!admin&&!list.policy.allow_scaffolding&&
    <p role="status">
     An admin must enable repository creation under Providers before
     developers can create projects.
    </p>
   }

   {mode==='scaffold'&&<label>
    <span>New repository name</span>
    <input value={name} onChange={e=>setName(e.target.value)}
     required pattern="[a-z][a-z0-9-]{2,47}" maxLength={48}
     placeholder="my-test-site" disabled={busy}/>
   </label>}

   {mode==='scaffold'&&info&&!info.is_template&&
    <p className="td-idp-v2-wide">
     This repository is not a starter template.{' '}
     {admin
      ?<button type="button" onClick={template} disabled={busy}>
        Enable as starter template
       </button>
      :'Ask an admin to enable it as a GitHub template.'
     }
    </p>
   }

   {info?.config&&<details className="td-idp-v2-wide"
    open={!complete||undefined}>
    <summary>
     Advanced settings · {settings.root_dir||'Repository root'}
     {' · '}{settings.runtime}
    </summary>
    <p>
     Review detected settings before creating resources.
     Existing catalog entries keep their registered build settings.
    </p>
    <label>
     <span>Build command</span>
     <input value={settings.build_command||''} maxLength={500}
      disabled={busy}
      onChange={e=>setSettings(v=>({...v,build_command:e.target.value}))}/>
    </label>
    <label>
     <span>Publish directory (use . for a server provider)</span>
     <input value={settings.publish_dir||''} maxLength={120}
      disabled={busy}
      onChange={e=>setSettings(v=>({...v,publish_dir:e.target.value}))}/>
    </label>
    <label>
     <span>Runtime</span>
     <select value={settings.runtime} disabled={busy}
      onChange={e=>setSettings(v=>({
       ...v,runtime:e.target.value,
       kind:e.target.value==='static'?'website':'api'
      }))}>
      <option value="static">Static website</option>
      <option value="server">Server / API</option>
     </select>
    </label>
   </details>}

   {server&&<p role="status" className="td-idp-v2-wide">
    This project needs a compatible server provider. Choose its webhook
    connection; this Render adapter creates static previews.
   </p>}

   <button type="submit" disabled={
    busy||loading||!complete||Boolean(server)||
    (mode==='environment'&&!tested.some(p=>p.id===provider))||
    (mode==='scaffold'&&(
     !info?.is_template||(!admin&&!list.policy.allow_scaffolding)
    ))
   }>
    {busy?'Working…':
     mode==='catalog'?'Import service':
     mode==='environment'?'Create test environment':
     'Create private repository'}
   </button>
  </>}
 </form>;
}

export function IdpRepoPolicy(){
 const [data,setData]=useState(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 useEffect(()=>{
  let live=true;
  call('list').then(value=>{
   if(live)setData(value);
  }).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};
 },[]);

 async function save(e){
  e.preventDefault();
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  const form=new FormData(e.currentTarget);
  try{
   const {error}=await supabase.rpc('td_idp_repo_settings',{
    p_provider:form.get('provider')||null,
    p_auto:form.get('auto')==='yes',
    p_scaffold:form.get('scaffold')==='yes'
   });
   if(error)throw error;
   setMessage('Repository workflow settings saved.');
  }catch(e){
   setError(e.message);
  }finally{
   setBusy(false);
  }
 }

 return <form onSubmit={save}
  className="td-idp-v2-card td-idp-v2-form">
  <h2>Repository workflow settings</h2>
  {error&&<p role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
  {data&&<>
   <label>
    <span>Default preview provider</span>
    <select name="provider" defaultValue={data.policy.default_provider||''}>
     <option value="">Choose automatically</option>
     {data.providers.filter(p=>p.tested_at).map(p=>
      <option key={p.id} value={p.id}>{p.name}</option>
     )}
    </select>
   </label>
   <label>
    <span>Automatically approve developer staging requests</span>
    <select name="auto" defaultValue={data.policy.auto_nonprod?'yes':''}>
     <option value="">Require approval</option>
     <option value="yes">Approve non-production requests</option>
    </select>
   </label>
   <label>
    <span>Allow developers to create repositories</span>
    <select name="scaffold"
     defaultValue={data.policy.allow_scaffolding?'yes':''}>
     <option value="">Admins only</option>
     <option value="yes">Allow authorised developers</option>
    </select>
   </label>
   <button disabled={busy}>Save workflow settings</button>
  </>}
 </form>;
}
