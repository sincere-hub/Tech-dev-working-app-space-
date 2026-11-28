import {useState} from 'react';
import {supabase} from '../lib/supabase.js';

export default function IdpDeleteButton({kind,id,name,onDeleted}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function remove(){
    if(busy||!window.confirm(
      kind==='service'
        ?'Delete “'+name+'” from the service catalog? Its GitHub repository will remain.'
        :'Remove this environment entry? Any request that has not started will be cancelled.'
    ))return;

    setBusy(true);
    setError('');

    try{
      const {error:problem}=await supabase.rpc(
        kind==='service'
          ?'td_idp_remove_service'
          :'td_idp_remove_request',
        {p_id:id}
      );

      if(problem)throw problem;
      onDeleted?.();
    }catch(failure){
      setError(failure.message||'Could not delete this entry.');
    }finally{
      setBusy(false);
    }
  }

  return <>
    <button
      type="button"
      className="td-idp-delete-button"
      disabled={busy}
      onClick={remove}
    >
      {busy?'Deleting…':kind==='service'?'Delete service':'Delete entry'}
    </button>
    {error&&<p role="alert">{error}</p>}
  </>;
}

export function IdpGuide(){
 return <details className="td-idp-v2-card td-idp-guide">
  <summary>How to use this platform</summary>
  <ol>
   <li><strong>Existing app:</strong> choose its GitHub repository in Service catalog and select Import service.</li>
   <li><strong>Test environment:</strong> select repository and branch, then Create test environment. The service is registered automatically. Requests that need approval appear below; open the environment when ready.</li>
   <li><strong>New project:</strong> in Scaffolding, choose a GitHub template, give the new repository a name, then select Create private repository. The repository and catalog entry are created together.</li>
   <li><strong>Connections:</strong> the existing GitHub connection is reused. Admins manage providers, approval policy and reusable templates. Advanced settings are needed only when automatic detection is incomplete.</li>
  </ol>
 </details>;
}
