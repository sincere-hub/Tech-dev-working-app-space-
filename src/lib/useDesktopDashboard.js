
import {useEffect,useState} from 'react';
import {supabase} from './supabase.js';

export function useDesktopMode(){
  const [desktop,setDesktop]=useState(()=>
    typeof window!=='undefined'&&
    Boolean(window.matchMedia?.('(min-width: 768px)').matches)
  );

  useEffect(()=>{
    const media=window.matchMedia?.('(min-width: 768px)');
    if(!media)return;

    const update=()=>setDesktop(media.matches);
    update();

    media.addEventListener('change',update);

    return()=>media.removeEventListener('change',update);
  },[]);

  return desktop;
}

export default function useDesktopDashboard(
  userId,
  role,
  refreshKey
){
  const [snapshot,setSnapshot]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);

  useEffect(()=>{
    if(!userId)return;

    let alive=true,running=false,timer,controller;

    async function refresh(){
      if(document.hidden||running)return;

      running=true;
      controller=new AbortController();
      const request=controller;

      const timeout=setTimeout(()=>request.abort(),15000);

      if(alive)setLoading(true);

      try{
        const {
          data:auth,
          error:authError
        }=await supabase.auth.getSession();

        if(authError)throw authError;

        if(auth.session?.user.id!==userId){
          throw new Error(
            'Your account changed. Reopen the dashboard.'
          );
        }

        const {
          data:me,
          error:roleError
        }=await supabase
          .from('employees')
          .select('id,role')
          .eq('id',userId)
          .maybeSingle()
          .abortSignal(request.signal);

        if(roleError)throw roleError;

        if(
          me?.id!==userId||
          me.role!==role||
          !['employee','manager','admin'].includes(me.role)
        ){
          throw new Error(
            'Your role changed. Reopen the dashboard.'
          );
        }

        const team=
          me.role==='admin'||me.role==='manager';

        async function read(
          table,
          columns,
          configure=q=>q
        ){
          const all=[];

          for(
            let offset=0;
            offset<=10000;
            offset+=500
          ){
            const {
              data,
              error:problem
            }=await configure(
              supabase.from(table).select(columns)
            )
              .order('id')
              .range(offset,offset+499)
              .abortSignal(request.signal);

            if(problem)throw problem;

            if(!Array.isArray(data)){
              throw new Error(
                'Dashboard records could not be read.'
              );
            }

            if(all.length+data.length>10000){
              throw new Error(
                'This dashboard has too many records. Open the detailed report.'
              );
            }

            all.push(...data);

            if(data.length<500)return all;
          }

          throw new Error(
            'Dashboard records could not be loaded completely.'
          );
        }

        const [tasks,employees]=await Promise.all([
          read(
            'tasks',
            'id,title,description,assignee_id,due_date,priority,status',
            q=>team
              ? q
              : q.or(
                  'assignee_id.eq.'+userId+
                  ',assignee_id.is.null'
                )
          ),
          read(
            'employees',
            'id,display_name,job_title,role',
            q=>team?q:q.eq('id',userId)
          )
        ]);

        if(
          !team&&(
            tasks.some(task=>
              task.assignee_id&&
              task.assignee_id!==userId
            )||
            employees.some(person=>person.id!==userId)
          )
        ){
          throw new Error(
            'Dashboard scope could not be verified.'
          );
        }

        if(alive&&!request.signal.aborted){
          setSnapshot({
            owner:userId,
            role:me.role,
            tasks,
            employees,
            at:Date.now()
          });
          setError('');
        }
      }catch(failure){
        if(alive){
          setSnapshot(null);
          setError(
            request.signal.aborted
              ? 'Dashboard refresh timed out.'
              : failure.message||
                'Dashboard could not refresh.'
          );
        }
      }finally{
        clearTimeout(timeout);
        running=false;

        if(alive){
          setLoading(false);
          timer=setTimeout(refresh,60000);
        }
      }
    }

    const wake=()=>{
      clearTimeout(timer);
      refresh();
    };

    refresh();

    document.addEventListener('visibilitychange',wake);
    window.addEventListener('online',wake);

    return()=>{
      alive=false;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange',wake);
      window.removeEventListener('online',wake);
    };
  },[userId,role,refreshKey,revision]);

  return {
    data:
      snapshot?.owner===userId&&snapshot.role===role
        ? snapshot
        : null,
    error,
    loading,
    reload:()=>setRevision(value=>value+1)
  };
}
