
const DAY=86400000,OFFSET=7200000;

export const dashboardDay=value=>
  new Date(value+OFFSET).toISOString().slice(0,10);

export function desktopDashboardModel({
  tasks=[],
  employees=[],
  userId,
  role,
  filter='all',
  employeeId='',
  now=Date.now()
}) {
  const team=role==='admin'||role==='manager';
  const today=dashboardDay(now);
  const weekEnd=dashboardDay(now+7*DAY);

  const scope=tasks
    .filter(task=>
      team||!task.assignee_id||task.assignee_id===userId
    )
    .filter(task=>filter==='overdue'
      ? task.status!=='done'&&task.due_date&&task.due_date<today
      : filter==='week'
        ? task.due_date&&task.due_date>=today&&task.due_date<weekEnd
        : true
    );

  const selected=scope.filter(task=>
    !employeeId||
    (employeeId==='unassigned'
      ? !task.assignee_id
      : task.assignee_id===employeeId)
  );

  const people=new Map(
    employees
      .filter(person=>team||person.id===userId)
      .map(person=>[
        person.id,
        person.display_name||'Employee'
      ])
  );

  if(scope.some(task=>!task.assignee_id)){
    people.set('unassigned','Unassigned');
  }

  for(const task of scope){
    if(task.assignee_id&&!people.has(task.assignee_id)){
      people.set(task.assignee_id,'Employee');
    }
  }

  const workload=[...people].map(([id,name])=>{
    const own=scope.filter(task=>
      (task.assignee_id||'unassigned')===id
    );
    const open=own.filter(task=>task.status!=='done');

    return {
      id,
      name,
      total:open.length,
      progress:open.filter(task=>
        task.status==='in_progress'
      ).length,
      overdue:open.filter(task=>
        task.due_date&&task.due_date<today
      ).length
    };
  }).sort((a,b)=>
    b.total-a.total||a.name.localeCompare(b.name)
  );

  const done=selected.filter(
    task=>task.status==='done'
  ).length;

  return {
    team,today,scope,selected,workload,done,
    total:selected.length,
    progress:selected.filter(task=>
      task.status==='in_progress'
    ).length,
    overdue:selected.filter(task=>
      task.status!=='done'&&
      task.due_date&&
      task.due_date<today
    ).length,
    percent:selected.length
      ? Math.round(done/selected.length*100)
      : null,
    sorted:[...selected].sort((a,b)=>
      (a.due_date||'9999').localeCompare(
        b.due_date||'9999'
      )||a.title.localeCompare(b.title)
    ),
    nameFor:id=>
      people.get(id||'unassigned')||'Employee'
  };
}
