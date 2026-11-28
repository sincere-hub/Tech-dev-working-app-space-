export function https(value) {
  try {
    const u=new URL(value);
    return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;
  }catch{return null;}
}

export function webhookUrl(value) {
  const u=new URL(value);
  if(
    !https(value)||u.search||u.hash||
    (u.port&&u.port!=='443')||
    !u.hostname.includes('.')||
    u.hostname.includes(':')||
    /^\d+\./.test(u.hostname)||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)
  )throw Error('Use a public HTTPS webhook endpoint.');
  return u.href;
}

export async function providerAction(provider,key,action,env={},send=fetch) {
  async function request(url,method='GET',body) {
    const res=await send(url,{
      method,
      headers:{
        Authorization:'Bearer '+key,
        'Content-Type':'application/json',
        'Idempotency-Key':(env.id||provider.id)+':'+action
      },
      body:body?JSON.stringify(body):undefined,
      redirect:'error',
      signal:AbortSignal.timeout(20000)
    });

    if(action==='delete'&&[404,410].includes(res.status))return null;

    if(!res.ok){
      const error=Error(
        'Provider returned HTTP '+res.status+
        '. Check the connection and provider dashboard.'
      );
      error.safeToCancel=method==='POST'&&
        [400,401,403,404,422].includes(res.status);
      throw error;
    }

    if(res.status===204)return null;
    return res.json();
  }

  if(provider.kind==='webhook') {
    const result=await request(webhookUrl(provider.endpoint),'POST',{
      version:1,
      action,
      request_id:env.id,
      external_id:env.external_id||null,
      environment:env.id?{
        tier:env.tier,
        branch:env.branch,
        service:env.blueprint
      }:undefined
    });

    if(action==='test'){
      if(result?.ok!==true)
        throw Error('Webhook test must return {"ok":true}.');
      return {ok:true};
    }

    if(
      !result||
      !['building','ready','failed','deleted','unknown'].includes(result.status)||
      typeof result.external_id!=='string'||
      result.external_id.length>500
    )throw Error('Webhook returned an invalid environment response.');

    if(result.status==='ready'&&!https(result.url))
      throw Error('A ready environment needs an HTTPS URL.');

    return {
      status:result.status,
      external_id:result.external_id,
      url:https(result.url)
    };
  }

  if(provider.kind!=='render')throw Error('Unsupported provider adapter.');

  const base='https://api.render.com/v1/services';
  const name='td-idp-'+env.id;

  async function find(){
    if(env.external_id){
      if(!/^srv-[a-zA-Z0-9]+$/.test(env.external_id))
        throw Error('Invalid Render service ID.');
      return request(base+'/'+encodeURIComponent(env.external_id));
    }

    const list=await request(
      base+'?ownerId='+encodeURIComponent(provider.owner_ref)+
      '&name='+encodeURIComponent(name)+'&limit=100'
    );

    if(!Array.isArray(list))
      throw Error('Render returned an invalid service list.');

    return list.map(row=>row.service).find(row=>
      row?.name===name&&row.ownerId===provider.owner_ref
    )||null;
  }

  if(action==='test'){
    const owner=await request(
      'https://api.render.com/v1/owners/'+encodeURIComponent(provider.owner_ref)
    );

    if(owner?.id!==provider.owner_ref)
      throw Error('Render workspace ownership could not be verified.');

    const list=await request(
      base+'?ownerId='+encodeURIComponent(provider.owner_ref)+'&limit=1'
    );

    if(!Array.isArray(list))throw Error('Render connection failed.');
    return {ok:true};
  }

  let service=await find();

  if(action==='create'&&!service){
    if((env.blueprint.kind!=='website'||(env.blueprint.runtime&&env.blueprint.runtime!=='static')))
      throw Error(
        'The Render adapter provisions static websites. '+
        'Use a webhook adapter for APIs or workers.'
      );

    const result=await request(base,'POST',{rootDir:env.blueprint.root_dir||'',
      type:'static_site',
      name,
      ownerId:provider.owner_ref,
      repo:env.blueprint.repository,
      branch:env.branch,
      autoDeployTrigger:'off',
      serviceDetails:{
        buildCommand:env.blueprint.build_command,
        publishPath:env.blueprint.publish_dir
      }
    });

    service=result?.service;

    if(!service?.id)
      throw Error(
        'Render did not return a service ID. '+
        'Check Render before creating another request.'
      );
  }

  if(!service)return {
    status:action==='delete'?'deleted':'unknown',
    external_id:env.external_id||null,
    url:null
  };

  if(service.name!==name||service.ownerId!==provider.owner_ref)
    throw Error('Render service ownership could not be verified.');

  if(action==='delete'){
    await request(base+'/'+encodeURIComponent(service.id),'DELETE');
    return {status:'deleted',external_id:service.id,url:null};
  }

  const deploys=await request(
    base+'/'+encodeURIComponent(service.id)+'/deploys?limit=1'
  );

  const phase=deploys?.[0]?.deploy?.status;
  const status=phase==='live'
    ?'ready'
    :[
      'build_failed','update_failed','pre_deploy_failed',
      'canceled','deactivated'
    ].includes(phase)?'failed':'building';

  const url=https(service.serviceDetails?.url||service.url);

  return {
    status:status==='ready'&&!url?'building':status,
    external_id:service.id,
    url
  };
}
