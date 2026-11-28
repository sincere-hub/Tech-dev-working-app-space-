import {createClient} from 'npm:@supabase/supabase-js@2';
import {Buffer} from 'node:buffer';
import {accessibleRepositories} from '../developer-catalog/github-repositories.ts';
import {providerAction} from '../idp-environments/adapters.mjs';
import {
 folder,detectProject,validateProject,matchingTemplate
} from './project.mjs';

const headers={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Cache-Control':'no-store'
};
const checked=async(q:any)=>{
 const {data,error}=await q;
 if(error)throw Error(error.message);
 return data;
};
const reply=(status:number,body:unknown)=>
 Response.json(body,{status,headers});
const secret=(key:string)=>Deno.env.get(key)||'';
const path=(value:string)=>
 value.split('/').map(encodeURIComponent).join('/');

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply(405,{error:'Use POST.'});

 try{
  const authorization=req.headers.get('authorization')||'';
  const user=createClient(
   secret('SUPABASE_URL'),secret('SUPABASE_ANON_KEY'),
   {
    global:{headers:{Authorization:authorization}},
    auth:{persistSession:false}
   }
  );

  const {data:auth,error}=await user.auth.getUser(
   authorization.replace(/^Bearer\s+/i,'')
  );

  if(error||!auth.user)return reply(401,{error:'Sign in again.'});
  if(!await checked(user.rpc('td_idp_allowed')))
   return reply(403,{error:'Access denied.'});

  const admin=await checked(user.rpc('td_idp_admin'));
  if(!admin&&!await checked(user.rpc('td_can_request_staging'))){
   return reply(403,{
    error:'Your account needs the existing developer staging permission '+
     'to access connected repositories. The company service catalog remains available.'
   });
  }

  const raw=await req.text();
  if(raw.length>8192)throw Error('Request is too large.');
  const body=JSON.parse(raw),action=body.action;

  const db=createClient(
   secret('SUPABASE_URL'),secret('SUPABASE_SERVICE_ROLE_KEY'),
   {auth:{persistSession:false}}
  );

  const access=await accessibleRepositories(action==='list');

  async function gh(
   endpoint:string,method='GET',payload?:unknown,missing=false
  ):Promise<any>{
   const response=await fetch('https://api.github.com'+endpoint,{
    method,
    headers:{
     'Content-Type':'application/json',
     Accept:'application/vnd.github+json',
     'X-GitHub-Api-Version':'2022-11-28',
     ...(access.token?{Authorization:'Bearer '+access.token}:{})
    },
    body:payload?JSON.stringify(payload):undefined,
    redirect:'error',
    signal:AbortSignal.timeout(15000)
   });

   if(missing&&response.status===404)return null;

   if(!response.ok){
    const e:any=Error(response.status===403
     ?'The connected GitHub App needs permission for this action: '+
      'repository Contents read and, for scaffolding, Administration write '+
      '(or Repository creation write). Check its approved repository scope.'
     :'GitHub returned HTTP '+response.status+
      '. Check repository access and the project name.');
    e.definite=[400,401,403,404,422].includes(response.status);
    throw e;
   }

   return response.status===204?null:response.json();
  }

  if(action==='list'){
   let notice='';

   if(admin&&
    !(await checked(
     user.from('td_idp_providers').select('id').limit(1)
    )).length&&secret('TD_RENDER_API_KEY')){
    try{
     let owner=secret('TD_RENDER_OWNER_ID');

     if(!owner&&
      /^srv-[a-zA-Z0-9]+$/.test(secret('TD_RENDER_SERVICE_ID'))){
      const response=await fetch(
       'https://api.render.com/v1/services/'+secret('TD_RENDER_SERVICE_ID'),
       {
        headers:{Authorization:'Bearer '+secret('TD_RENDER_API_KEY')},
        redirect:'error',signal:AbortSignal.timeout(8000)
       }
      );
      if(!response.ok)
       throw Error('Existing Render workspace could not be read.');
      owner=(await response.json()).ownerId;
     }

     if(!/^tea-[a-zA-Z0-9]+$/.test(owner))
      throw Error('Existing Render workspace ID is missing.');

     await providerAction(
      {kind:'render',owner_ref:owner},
      secret('TD_RENDER_API_KEY'),'test'
     );

     await checked(db.rpc('td_idp_adopt_render',{
      p_key:secret('TD_RENDER_API_KEY'),p_owner:owner
     }));
    }catch(e){
     notice=(e as Error).message+
      ' Existing provider controls remain available.';
    }
   }

   return reply(200,{
    repositories:access.repositories,
    policy:await checked(
     user.from('td_idp_repo_policy').select('*').single()
    ),
    providers:await checked(
     user.from('td_idp_providers').select('*').order('name')
    ),
    notice
   });
  }

  const repo=access.repositories.find(
   row=>row.slug.toLowerCase()===String(body.repo||'').toLowerCase()
  );

  if(!repo)
   throw Error('Choose a repository available to the connected GitHub App.');

  const prefix='/repos/'+repo.slug;
  const metadata=await gh(prefix);

  if(action==='template'){
   if(!admin)throw Error('Only admins can enable starter templates.');
   await gh(prefix,'PATCH',{is_template:true});
   return reply(200,{ok:true});
  }

  async function inspect(){
   const branches=[];

   for(let page=1;page<=10;page++){
    const batch=await gh(
     prefix+'/branches?per_page=100&page='+page
    );
    branches.push(...batch.map((row:any)=>row.name));
    if(batch.length<100)break;
    if(page===10)
     throw Error('Repository exceeds the 1,000-branch limit.');
   }

   const branch=body.branch||metadata.default_branch;
   if(!branches.includes(branch))
    throw Error('Choose an existing repository branch.');

   const tree=await gh(
    prefix+'/git/trees/'+encodeURIComponent(branch)+'?recursive=1'
   );

   if(tree.truncated||!Array.isArray(tree.tree)||tree.tree.length>50000)
    throw Error('Repository is too large for automatic inspection.');

   const files=new Set<string>(
    tree.tree.filter((row:any)=>
     row.type==='blob'&&
     !/(^|\/)(node_modules|vendor|dist|build)\//.test(row.path)
    ).map((row:any)=>row.path)
   );

   const roots=[...new Set(
    [...files].filter(p=>
     /(^|\/)(package.json|index.html|idp.json)$/.test(p)||
     p.endsWith('/.techdev/idp.json')
    ).map(p=>p.replace(
     /(?:^|\/)(?:\.techdev\/)?(?:package.json|index.html|idp.json)$/,''
    ))
   )].filter(p=>p.split('/').length<=6).sort();

   if(files.has('package.json')){
    roots.splice(
     0,roots.length,'',
     ...roots.filter(p=>p!==''&&!p.endsWith('/public')&&p!=='public')
    );
   }

   if(!roots.length)roots.push('');

   const root=body.root===undefined
    ?(roots.length===1?roots[0]:null)
    :folder(body.root);

   if(root!==null&&!roots.includes(root))
    throw Error('Choose one of the detected project folders.');

   async function json(file:string){
    const value=await gh(
     prefix+'/contents/'+path(file)+'?ref='+encodeURIComponent(branch),
     'GET',undefined,true
    );

    if(!value)return {};

    if(value.type!=='file'||value.encoding!=='base64'||value.size>262144)
     throw Error('Project metadata is too large or is not a regular file.');

    return JSON.parse(
     Buffer.from(value.content,'base64').toString('utf8')
    );
   }

   let config=null;

   if(root!==null){
    const base=root?root+'/':'';
    const local=new Set(
     [...files].filter(p=>p.startsWith(base)).map(p=>p.slice(base.length))
    );

    const pkg=local.has('package.json')
     ?await json(base+'package.json'):{};

    const descriptor=local.has('.techdev/idp.json')
     ?await json(base+'.techdev/idp.json')
     :local.has('idp.json')?await json(base+'idp.json'):{};

    config={...detectProject(local,pkg,descriptor),root_dir:root};
   }

   return {
    branch,branches,roots,config,
    is_template:metadata.is_template===true,name:metadata.name
   };
  }

  if(action==='inspect')return reply(200,await inspect());

  async function register(
   info:any,
   url='https://github.com/'+repo!.slug,
   name=metadata.name
  ){
   if(!info.config)throw Error('Select the project folder first.');

   const config=validateProject({
    ...info.config,
    ...Object.fromEntries(
     ['build_command','publish_dir','runtime','kind']
      .filter(k=>typeof body.settings?.[k]==='string')
      .map(k=>[k,body.settings[k]])
    )
   });

   return checked(db.rpc('td_idp_import_repo',{
    p_actor:auth.user!.id,
    p:{
     ...config,repository:url,name,
     description:metadata.description||''
    }
   }));
  }

  if(action==='import'||action==='environment'){
   const info=await inspect(),id=await register(info);

   if(action==='import')return reply(200,{service_id:id});

   const provider=await checked(
    user.from('td_idp_providers').select('*')
     .eq('id',body.provider).single()
   );

   const service=await checked(
    user.from('td_idp_services').select('*').eq('id',id).single()
   );

   if(provider.kind==='render'&&
    (service.kind!=='website'||service.runtime!=='static')){
    throw Error(
     'This project needs a server runtime. Choose a compatible webhook '+
     'provider under Providers. Render previews here support static websites.'
    );
   }

   const environment=await checked(user.rpc('td_idp_repo_environment',{
    p_key:body.key,p_service:id,
    p_provider:provider.id,p_branch:info.branch
   }));

   return reply(200,await checked(
    user.from('td_idp_environments').select('*')
     .eq('id',environment).single()
   ));
  }

  if(action==='scaffold'){
   if(!metadata.is_template){
    throw Error(
     'Choose a GitHub template repository. An admin can enable '+
     'the selected repository as a starter template.'
    );
   }

   const info=await inspect();
   if(!info.config)throw Error('Choose the project folder in the template.');
   validateProject({...info.config,...body.settings});

   if(info.branch!==metadata.default_branch)
    throw Error('Templates use their default branch. Select that branch first.');

   const job=await checked(user.rpc('td_idp_repo_job',{
    p_key:body.key,p_template:repo.slug,
    p_owner:repo.slug.split('/')[0],p_name:body.name
   }));

   if(job.status==='created')return reply(200,job);

   if(job.status==='failed'){
    throw Error(
     job.last_error||
     'This creation attempt failed. Choose a new project name.'
    );
   }

   let created;

   if(job.status==='reserved'){
    const claim=await checked(
     db.from('td_idp_repo_jobs').update({status:'creating'})
      .eq('id',job.id).eq('status','reserved')
      .select('id').maybeSingle()
    );

    if(!claim){
     throw Error(
      'Creation is already running. Keep the same name and retry '+
      'to check its result.'
     );
    }

    try{
     created=await gh(prefix+'/generate','POST',{
      owner:job.owner_name,name:job.name,
      private:true,include_all_branches:false
     });
    }catch(e){
     await db.from('td_idp_repo_jobs').update({
      status:(e as any).definite?'failed':'unknown',
      last_error:(e as Error).message
     }).eq('id',job.id).eq('status','creating');
     throw e;
    }
   }else{
    created=await gh(
     '/repos/'+job.owner_name+'/'+job.name,'GET',undefined,true
    );

    if(!matchingTemplate(created,job)){
     throw Error(
      'GitHub creation is still unconfirmed. Check GitHub and retry '+
      'with this same project name; a second repository will not be created.'
     );
    }
   }

   const id=await register(
    info,'https://github.com/'+job.owner_name+'/'+job.name,job.name
   );

   const result=await checked(
    db.from('td_idp_repo_jobs').update({
     status:'created',service_id:id,
     repository_url:'https://github.com/'+job.owner_name+'/'+job.name,
     last_error:null
    }).eq('id',job.id).select('*').single()
   );

   return reply(200,result);
  }

  throw Error('Unknown repository action.');
 }catch(error){
  return reply(400,{
   error:error instanceof Error?error.message:'Repository action failed.'
  });
 }
});
