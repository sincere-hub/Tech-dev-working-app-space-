import IdpRepoWorkflow,{IdpRepoPolicy} from './IdpRepoWorkflow.jsx';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase.js';
import {safeExternalUrl} from '../lib/reporting.js';
import {scaffold,starters,downloadProject} from '../lib/idpScaffolding.js';
import DeveloperCatalog from './DeveloperCatalog.jsx';
import './idp-self-service.css';
import IdpDeleteButton,{IdpGuide} from "./IdpDeleteControls.jsx";
import "../idp-layout-cleanup.css";
import './idp-professional.css';

const text=(values,key)=>String(values.get(key)||'').trim();
const label=value=>String(value||'').replaceAll('_',' ');

async function checked(query){
  const {data,error}=await query;
  if(error)throw error;
  return data;
}

async function invoke(action,id){
  const {data,error}=await supabase.functions.invoke(
    'idp-environments',{body:{action,id}}
  );
  if(error){
    const detail=await error.context?.json?.().catch(()=>null);
    throw Error(detail?.error||error.message);
  }
  return data;
}

function Link({href,children}){
  const safe=safeExternalUrl(href);
  return safe
    ?<a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>
    :null;
}

function Field({name,label:caption,defaultValue='',...props}){
  return <label>
    <span>{caption}</span>
    <input name={name} defaultValue={defaultValue} {...props}/>
  </label>;
}

export default function IdpSelfService({userId,employees=[],legacy}) {
  const [repoNotice,setRepoNotice]=useState('');
 const [tab,setTab]=useState('services');
  const [query,setQuery]=useState('');
  const [version,setVersion]=useState(0);
  const [data,setData]=useState(null);
  const [loadError,setLoadError]=useState('');
  const [actionError,setActionError]=useState('');
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState(null);
  const [providerEdit,setProviderEdit]=useState(null);
  const [generated,setGenerated]=useState(null);

  useEffect(()=>{
    const controller=new AbortController();
    setData(null);
    setLoadError('');

    async function read(table){
      const rows=[];
      for(let offset=0;offset<=5000;offset+=500){
        const page=await checked(
          supabase.from(table).select('*').order('id')
            .range(offset,offset+499).abortSignal(controller.signal)
        );
        if(!Array.isArray(page)||rows.length+page.length>5000)
          throw Error('This list exceeds the current 5,000-record limit.');
        rows.push(...page);
        if(page.length<500)return rows;
      }
      throw Error('The list could not be loaded completely.');
    }

    async function load(){
      try{
        const {data:auth,error}=await supabase.auth.getSession();
        if(error)throw error;
        if(auth.session?.user.id!==userId)
          throw Error('Sign in again to open the developer platform.');

        const [admin,services,providers,environments,runs]=await Promise.all([
          checked(supabase.rpc('td_idp_admin').abortSignal(controller.signal)),
          ...[
            'td_idp_services','td_idp_providers',
            'td_idp_environments','td_idp_scaffold_runs'
          ].map(read)
        ]);

        if(!controller.signal.aborted)
          setData({admin,services,providers,environments,runs});
      }catch(error){
        if(!controller.signal.aborted)
          setLoadError(error.message||'Could not load the developer platform.');
      }
    }

    load();
    return()=>controller.abort();
  },[userId,version]);

  async function run(job){
    if(busy)return false;
    setBusy(true);
    setActionError('');
    try{
      await job();
      return true;
    }catch(error){
      setActionError(error.message||'Action failed.');
      return false;
    }finally{
      setBusy(false);
      setVersion(value=>value+1);
    }
  }

  async function saveService(event){
    event.preventDefault();
    const form=event.currentTarget;
    const p=Object.fromEntries(new FormData(form));
    if(editing)p.id=editing.id;

    if(await run(()=>checked(supabase.rpc('td_idp_save_service',{p})))){
      form.reset();
      setEditing(null);
    }
  }

  async function saveProvider(event){
    event.preventDefault();
    const form=event.currentTarget,v=new FormData(form);

    if(await run(async()=>{
      const id=await checked(supabase.rpc('td_idp_save_provider',{
        p_name:text(v,'name'),
        p_kind:text(v,'kind'),
        p_endpoint:text(v,'endpoint'),
        p_owner:text(v,'owner_ref'),
        p_key:text(v,'key'),
        p_id:providerEdit?.id||null
      }));
      await invoke('test',id);
    })){
      form.reset();
      setProviderEdit(null);
    }
  }

  async function requestEnvironment(event){
    event.preventDefault();
    const form=event.currentTarget,v=new FormData(form);

    if(await run(()=>checked(supabase.rpc('td_idp_request',{
      p_service:text(v,'service'),
      p_provider:text(v,'provider'),
      p_tier:text(v,'tier'),
      p_branch:text(v,'branch'),
      p_reason:text(v,'reason')
    }))))form.reset();
  }

  async function generate(event){
    event.preventDefault();
    const v=new FormData(event.currentTarget);
    const slug=text(v,'slug');
    const template=text(v,'template');
    const description=text(v,'description');

    await run(async()=>{
      const files=scaffold(slug,template,description);
      files['catalog-info.yaml']=files['catalog-info.yaml']
        .replace('replace-with-owner',userId);

      await checked(supabase.rpc('td_idp_scaffold',{
        p_slug:slug,p_template:template,p_description:description
      }));

      setGenerated({slug,files});
      downloadProject(slug,files);
    });
  }

  const services=data?.services?.filter(row=>!row.removed_at)||[];
  const providers=data?.providers||[];
  const environments=data?.environments?.filter(row=>!row.removed_at)||[];

  const serviceName=id=>(data?.services||[]).find(row=>row.id===id)?.title||'Previous service';

  const ownerName=id=>
    employees.find(row=>row.id===id)?.display_name||'Previous employee';

  const matches=value=>
    value.toLowerCase().includes(query.trim().toLowerCase());

  const tabs=[
    ['services','Service catalog'],
    ['environments','Self-service environments'],
    ['scaffolding','Scaffolding'],
    ...(data?.admin?[['providers','Providers']]:[])
  ];

  return <section className="td-idp-v2" aria-label="Internal developer platform">
    <header className="td-idp-v2-hero">
      <div>
        <p>TECHDEV · DEVELOPER PLATFORM</p>
        <h1>Build, discover and provision</h1>
        <p>Services, reusable starters and environment requests in one workspace.</p>
      </div>
      <button type="button" disabled={busy}
        onClick={()=>setVersion(value=>value+1)}>Refresh</button>
    </header>

    <nav className="td-idp-v2-tabs" aria-label="Developer platform sections">
      {tabs.map(([id,name])=>
        <button type="button" key={id} aria-pressed={tab===id}
          onClick={()=>{setTab(id);setQuery('');}}>{name}</button>
      )}
    </nav>
<IdpGuide/>

    {loadError&&<p role="alert">
      {loadError} Run the developer-platform SQL migration if the tables
      or functions are missing.
    </p>}
    {repoNotice&&<p role="status">{repoNotice}</p>}
  {actionError&&<p role="alert">{actionError}</p>}
    {!data&&!loadError&&<p role="status">Loading developer platform…</p>}

    {data&&<>
      <label className="td-idp-v2-search">
        <span>Search {label(tab)}</span>
        <input type="search" value={query}
          onChange={event=>setQuery(event.target.value)}
          placeholder="Search names, owners or status"/>
      </label>

      <fieldset className="td-idp-v2-controls" disabled={busy}>
        {tab==='services'&&<><IdpRepoWorkflow mode="catalog" userId={userId} admin={data.admin} onDone={message=>{setRepoNotice(message);setVersion(v=>v+1);}}/>
          <div className="td-idp-v2-grid">
            {services.filter(row=>matches([
              row.title,row.slug,row.kind,row.lifecycle,ownerName(row.owner_id)
            ].join(' '))).map(row=>
              <article className="td-idp-v2-card" key={row.id}>
                <h2>{row.title}</h2>
                <span className="td-idp-v2-badge">
                  {row.kind} · {row.lifecycle}
                </span>
                <p>{row.description||'No description yet.'}</p>
                <p>Owner: <strong>{ownerName(row.owner_id)}</strong></p>
                <code>{row.slug}</code>
                <div className="td-idp-v2-actions">
                  <Link href={row.repository}>Repository</Link>
                  <Link href={row.docs}>Documentation</Link>
                  {data.admin&&<button type="button"
                    onClick={()=>setEditing(row)}>Edit service</button>}{(data.admin||row.owner_id===userId)&&<IdpDeleteButton kind="service" id={row.id} name={row.title} onDeleted={()=>{if(editing?.id===row.id)setEditing(null);if(generated?.slug===row.slug)setGenerated(null);setVersion(value=>value+1);}}/>}
                </div>
              </article>
            )}
          </div>

          {!services.length&&<p>No registered services yet.</p>}

          <details open={editing?true:undefined} className="td-idp-v2-card"><summary>Advanced · manual service registration</summary>{data.admin&&
            <form className="td-idp-v2-card td-idp-v2-form"
              key={editing?.id||'new-service'} onSubmit={saveService}>
              <h2>{editing?'Edit service':'Register a service'}</h2>

              <Field name="slug" label="Service slug"
                defaultValue={editing?.slug} required
                pattern="[a-z][a-z0-9-]{2,47}" maxLength={48}/>

              <Field name="title" label="Display name"
                defaultValue={editing?.title} required maxLength={180}/>

              <label>
                <span>Owner</span>
                <select name="owner_id" defaultValue={editing?.owner_id||userId}>
                  {employees.filter(row=>!row.is_banned).map(row=>
                    <option key={row.id} value={row.id}>{row.display_name}</option>
                  )}
                </select>
              </label>

              <label>
                <span>Service type</span>
                <select name="kind" defaultValue={editing?.kind||'website'}>
                  <option value="website">Website</option>
                  <option value="api">API</option>
                  <option value="worker">Worker</option>
                </select>
              </label>

              <label>
                <span>Lifecycle</span>
                <select name="lifecycle"
                  defaultValue={editing?.lifecycle||'development'}>
                  {['development','production','deprecated'].map(value=>
                    <option key={value}>{value}</option>
                  )}
                </select>
              </label>

              <Field name="repository" label="GitHub repository URL"
                type="url" defaultValue={editing?.repository}
                placeholder="https://github.com/company/project"/>

              <Field name="docs" label="Documentation URL"
                type="url" defaultValue={editing?.docs}/>

              <Field name="build_command" label="Preview build command"
                defaultValue={editing?.build_command||'npm ci && npm run build'}
                required maxLength={500}/>

              <Field name="publish_dir" label="Static publish directory"
                defaultValue={editing?.publish_dir||'dist'}
                required maxLength={120}/>

              <label className="td-idp-v2-wide">
                <span>Description</span>
                <textarea name="description"
                  defaultValue={editing?.description} maxLength={3000}/>
              </label>

              <div className="td-idp-v2-actions">
                <button type="submit">Save service</button>
                {editing&&<button type="button"
                  onClick={()=>setEditing(null)}>Cancel edit</button>}
              </div>
            </form>
          }</details>
        </>}

        {tab==='environments'&&<>
          <IdpRepoWorkflow mode="environment" userId={userId} admin={data.admin} onDone={message=>{setRepoNotice(message);setVersion(v=>v+1);}}/><details className="td-idp-v2-card"><summary>Advanced · request a registered service</summary><form className="td-idp-v2-card td-idp-v2-form"
            onSubmit={requestEnvironment}>
            <h2>Request a development or staging environment</h2>

            <label>
              <span>Service</span>
              <select name="service" required defaultValue="">
                <option value="" disabled>Select a service</option>
                {services.filter(row=>
                  row.repository&&row.lifecycle!=='deprecated'
                ).map(row=>
                  <option key={row.id} value={row.id}>{row.title}</option>
                )}
              </select>
            </label>

            <label>
              <span>Provider</span>
              <select name="provider" required defaultValue="">
                <option value="" disabled>Select a tested connection</option>
                {providers.filter(row=>row.tested_at).map(row=>
                  <option key={row.id} value={row.id}>{row.name}</option>
                )}
              </select>
            </label>

            <label>
              <span>Environment type</span>
              <select name="tier">
                <option value="development">Development</option>
                <option value="staging">Staging</option>
              </select>
            </label>

            <Field name="branch" label="Git branch"
              defaultValue="main" required maxLength={150}/>

            <label className="td-idp-v2-wide">
              <span>What do you need to test?</span>
              <textarea name="reason" required maxLength={2000}/>
            </label>

            <button type="submit">Submit for approval</button>

            <p className="td-idp-v2-wide">
              An approved request can be provisioned using its saved blueprint.
              Render creates a separate static-site preview; APIs and workers
              use a compatible webhook provider. Delete environments when finished.
            </p>
          </form></details>

          <div className="td-idp-v2-grid">
            {environments.filter(row=>matches([
              serviceName(row.service_id),row.status,row.tier,row.branch
            ].join(' '))).map(row=>
              <article className="td-idp-v2-card" key={row.id}>
                <h2>{serviceName(row.service_id)}</h2>
                <span className="td-idp-v2-badge">{label(row.status)}</span>
                <p>
                  {row.tier} · {row.branch} ·{' '}
                  {providers.find(p=>p.id===row.provider_id)?.name}
                </p>
                <p>{row.reason}</p>
                <p>Requested by {ownerName(row.requested_by)}</p>

                {row.last_error&&<p role="alert">{row.last_error}</p>}

                <div className="td-idp-v2-actions">
                  {data.admin&&row.status==='pending'&&<>
                    <button type="button" onClick={()=>run(()=>checked(
                      supabase.rpc('td_idp_review',{p_id:row.id,p_approve:true})
                    ))}>Approve</button>

                    <button type="button" onClick={()=>run(()=>checked(
                      supabase.rpc('td_idp_review',{p_id:row.id,p_approve:false})
                    ))}>Reject</button>
                  </>}

                  {row.status==='approved'&&
                    <button type="button"
                      onClick={()=>run(()=>invoke('create',row.id))}>
                      Provision environment
                    </button>
                  }

                  {((!row.external_id&&["pending","approved","failed"].includes(row.status))||["rejected","deleted"].includes(row.status))&&<IdpDeleteButton kind="environment" id={row.id} name={serviceName(row.service_id)} onDeleted={()=>setVersion(value=>value+1)}/>}

                  {!['pending','approved','rejected','deleted'].includes(row.status)&&
                    <button type="button"
                      onClick={()=>run(()=>invoke('status',row.id))}>
                      Check status
                    </button>
                  }

                  {row.status==='ready'&&
                    <Link href={row.url}>Open environment</Link>
                  }

                  {row.external_id&&[
                    'ready','building','failed','unknown','deleting'
                  ].includes(row.status)&&
                    <button type="button" onClick={()=>{
                      if(window.confirm(
                        'Delete this '+row.tier+' environment for '+
                        serviceName(row.service_id)+'?'
                      ))run(async()=>{const result=await invoke('delete',row.id);if(result?.status==='deleted')await checked(supabase.rpc('td_idp_remove_request',{p_id:row.id}));});
                    }}>Delete environment</button>
                  }
                </div>

                <EnvironmentHistory id={row.id}/>
              </article>
            )}
          </div>

          {!environments.length&&<p>No environment requests yet.</p>}
        </>}

        {tab==='scaffolding'&&<><IdpRepoWorkflow mode="scaffold" userId={userId} admin={data.admin} onDone={message=>{setRepoNotice(message);setVersion(v=>v+1);}}/></>}

        {tab==='providers'&&data.admin&&<><IdpRepoPolicy/>
          <div className="td-idp-v2-grid">
            {providers.map(row=>
              <article className="td-idp-v2-card" key={row.id}>
                <h2>{row.name}</h2>
                <p>
                  {row.kind} ·{' '}
                  {row.tested_at?'Connection tested':'Connection not verified'}
                </p>
                <div className="td-idp-v2-actions">
                  <button type="button"
                    onClick={()=>run(()=>invoke('test',row.id))}>
                    Test connection
                  </button>
                  <button type="button" onClick={()=>setProviderEdit(row)}>
                    Edit connection
                  </button>
                </div>
              </article>
            )}
          </div>

          <form className="td-idp-v2-card td-idp-v2-form"
            key={providerEdit?.id||'new-provider'} onSubmit={saveProvider}>
            <h2>{providerEdit?'Edit provider':'Add provider'}</h2>

            <Field name="name" label="Connection name"
              defaultValue={providerEdit?.name} required maxLength={100}/>

            <label>
              <span>Adapter</span>
              <select name="kind" defaultValue={providerEdit?.kind||'render'}>
                <option value="render">Render static-site previews</option>
                <option value="webhook">Compatible HTTPS webhook</option>
              </select>
            </label>

            <Field name="owner_ref"
              label="Render workspace owner ID (Render only)"
              defaultValue={providerEdit?.owner_ref} placeholder="tea-…"/>

            <Field name="endpoint"
              label="Webhook endpoint (webhook only)"
              type="url" defaultValue={providerEdit?.endpoint}
              placeholder="https://provider.example.com/idp"/>

            <Field name="key"
              label={providerEdit
                ?'New credential (blank keeps existing)'
                :'API key or webhook bearer token'}
              type="password" autoComplete="new-password"
              required={!providerEdit} maxLength={4096}/>

            <button type="submit">Save and test connection</button>

            {providerEdit&&<button type="button"
              onClick={()=>setProviderEdit(null)}>Cancel edit</button>}

            <p className="td-idp-v2-wide">
              Credentials are encrypted in Supabase Vault.
              Render previews use the selected repository and build settings;
              production environment variables are not copied.
            </p>
          </form>

          <details className="td-idp-v2-card">
            <summary>Webhook provider contract</summary>
            <p>
              The endpoint receives POST JSON with version, action
              (test/create/status/delete), request_id, external_id and environment.
              Authenticate the Bearer token. Create must be idempotent by
              request_id; status must also work when external_id is unknown.
            </p>
            <p>Test response: <code>{'{"ok":true}'}</code></p>
            <p>
              Other responses:{' '}
              <code>{'{"external_id":"provider-id","status":"building|ready|failed|deleted|unknown","url":"https://…"}'}</code>.
              Return ready only when the environment is accessible.
              Return deleted only after teardown completes.
            </p>
          </details>
        </>}
      </fieldset>
    </>}

    {busy&&<p role="status">Saving or contacting the provider…</p>}

    {data?.admin&&
      <Disclosure title="GitHub code inventory">
        <DeveloperCatalog/>
      </Disclosure>
    }

    
  </section>;
}

function EnvironmentEvents({id}){
  const [state,setState]=useState({loading:true});

  useEffect(()=>{
    const controller=new AbortController();
    checked(
      supabase.from('td_idp_events').select('id,status,created_at')
        .eq('environment_id',id).order('id',{ascending:false})
        .limit(30).abortSignal(controller.signal)
    ).then(rows=>{
      if(!controller.signal.aborted)setState({rows});
    }).catch(error=>{
      if(!controller.signal.aborted)setState({error:error.message});
    });
    return()=>controller.abort();
  },[id]);

  return state.loading
    ?<p>Loading history…</p>
    :state.error
      ?<p role="alert">{state.error}</p>
      :<ol>{state.rows.map(row=>
        <li key={row.id}>
          {label(row.status)} · {new Date(row.created_at).toLocaleString()}
        </li>
      )}</ol>;
}

function EnvironmentHistory({id}){
  const [open,setOpen]=useState(false);
  return <details onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>Request history</summary>
    {open&&<EnvironmentEvents id={id}/>}
  </details>;
}

function Disclosure({title,children}){
  const [open,setOpen]=useState(false);
  return <details className="td-idp-v2-card"
    onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{title}</summary>
    {open&&children}
  </details>;
}

// TD_IDP_CLEANUP_V1

// TD_IDP_REPOSITORIES_V1
