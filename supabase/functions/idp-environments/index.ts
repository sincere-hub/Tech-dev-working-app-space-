import {createClient} from 'npm:@supabase/supabase-js@2';
import {providerAction,webhookUrl} from './adapters.mjs';

const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Cache-Control':'no-store'
};

const reply=(status:number,body:unknown)=>
  Response.json(body,{status,headers});

const checked=async(query:any)=>{
  const {data,error}=await query;
  if(error)throw Error(error.message);
  return data;
};

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return reply(405,{error:'Use POST.'});

  try{
    const authorization=req.headers.get('Authorization')||'';
    const url=Deno.env.get('SUPABASE_URL')!;

    const user=createClient(
      url,Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global:{headers:{Authorization:authorization}},
        auth:{persistSession:false}
      }
    );

    if(!/^Bearer\s+\S+$/i.test(authorization))
      return reply(401,{error:'Sign in again.'});

    const {data:auth,error:authError}=await user.auth.getUser(
      authorization.replace(/^Bearer\s+/i,'')
    );

    if(authError||!auth.user)
      return reply(401,{error:'Sign in again.'});

    if(!await checked(user.rpc('td_idp_allowed')))
      return reply(403,{error:'Access denied.'});

    const raw=await req.text();
    if(raw.length>16384)
      return reply(413,{error:'Request is too large.'});

    const body=JSON.parse(raw),action=body.action;

    if(!['test','create','status','delete'].includes(action))
      return reply(400,{error:'Unknown action.'});

    const admin=await checked(user.rpc('td_idp_admin'));

    const db=createClient(
      url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {auth:{persistSession:false}}
    );

    let env:any=null;

    if(action!=='test'){
      env=await checked(
        user.from('td_idp_environments').select('*')
          .eq('id',body.id).single()
      );

      if(env.requested_by!==auth.user.id&&!admin)
        return reply(403,{error:'Access denied.'});

      if(action==='status'&&[
        'pending','approved','rejected','deleted','deleting'
      ].includes(env.status))return reply(200,env);
    }else if(!admin){
      return reply(403,{error:'Only admins can test connections.'});
    }

    const provider=await checked(
      user.from('td_idp_providers').select('*')
        .eq('id',env?.provider_id||body.id).single()
    );

    if(provider.kind==='webhook'){
      const host=new URL(webhookUrl(provider.endpoint)).hostname;

      const [v4,v6]=await Promise.all([
        Deno.resolveDns(host,'A').catch(()=>[]),
        Deno.resolveDns(host,'AAAA').catch(()=>[])
      ]);

      if(
        (!v4.length&&!v6.length)||
        v4.some(ip=>
          /^(0\.|10\.|127\.|169\.254\.|192\.(168|0)\.|198\.(1[89]|51)\.|203\.0\.113\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)||
          Number(ip.split('.')[0])>=224
        )||
        v6.some(ip=>
          !/^2[0-9a-f]{3}:|^3[0-9a-f]{3}:/i.test(ip)||
          /^2001:db8:/i.test(ip)
        )
      )throw Error('Webhook must resolve to a public network address.');
    }

    const key=await checked(
      db.rpc('td_idp_credentials',{p_id:provider.id})
    );

    if(!key)throw Error('Provider credentials are missing.');

    if(action==='test'){
      await checked(
        db.from('td_idp_providers').update({tested_at:null})
          .eq('id',provider.id).eq('revision',provider.revision)
      );

      await providerAction(provider,key,'test');

      const saved=await checked(
        db.from('td_idp_providers')
          .update({tested_at:new Date().toISOString()})
          .eq('id',provider.id).eq('revision',provider.revision)
          .select('id').maybeSingle()
      );

      if(!saved)
        throw Error('Connection changed during testing. Test the new settings.');

      return reply(200,{ok:true});
    }

    if(action==='create'){
      if(!provider.tested_at)
        throw Error('Test this provider connection first.');

      if(provider.kind==='render'&&(env.blueprint.kind!=='website'||(env.blueprint.runtime&&env.blueprint.runtime!=='static')))
        throw Error(
          'Choose a webhook provider for API or worker environments. '+
          'Render supports static-site previews here.'
        );

      await providerAction(provider,key,'test');

      const claim=await checked(
        db.from('td_idp_environments')
          .update({status:'provisioning',last_error:null})
          .eq('id',env.id).eq('status','approved')
          .select('id').maybeSingle()
      );

      if(!claim)
        throw Error('Request must be approved and not already started.');

      env.status='provisioning';
    }

    if(action==='delete'){
      if(
        !env.external_id||
        !['ready','building','failed','unknown','deleting'].includes(env.status)
      )throw Error('Check the provider status before deleting this environment.');

      const claim=await checked(
        db.from('td_idp_environments')
          .update({status:'deleting'})
          .eq('id',env.id).eq('status',env.status)
          .select('id').maybeSingle()
      );

      if(!claim)
        throw Error('Environment changed. Refresh and try again.');

      env.status='deleting';
    }

    try{
      const result=await providerAction(provider,key,action,env);

      if(
        action==='status'&&
        env.status==='provisioning'&&result.status==='unknown'
      )return reply(200,env);

      const saved=await checked(
        db.from('td_idp_environments')
          .update({...result,last_error:null})
          .eq('id',env.id).eq('status',env.status)
          .select('*').maybeSingle()
      );

      if(!saved)
        throw Error(
          'Environment changed while contacting the provider. '+
          'Refresh its status.'
        );

      return reply(200,saved);
    }catch(error){
      const message=error instanceof Error
        ?error.message:'Provider request failed.';

      await db.from('td_idp_environments').update({
        status:action==='create'
          ?((error as any)?.safeToCancel?'failed':'unknown')
          :env.status,
        last_error:message.slice(0,500)
      }).eq('id',env.id).eq('status',env.status);

      throw error;
    }
  }catch(error){
    return reply(400,{
      error:error instanceof Error
        ?error.message:'Developer platform request failed.'
    });
  }
});
