import TechDevGlobe from "./TechDevGlobe.jsx";

import {useLayoutEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {
  ArrowRight,BarChart3,Bell,CalendarDays,Check,
  CheckCheck,Clock3,FileText,LayoutDashboard,
  ListTodo,Megaphone,Menu,MessageCircle,
  RefreshCw,Search
} from 'lucide-react';
import useDesktopDashboard from '../lib/useDesktopDashboard.js';
import {desktopDashboardModel} from '../lib/desktopDashboardModel.js';
import DashboardWorkCycle from './DashboardWorkCycle.jsx';

export {useDesktopMode} from '../lib/useDesktopDashboard.js';

const statusName=value=>({
  todo:'To do',
  in_progress:'In progress',
  done:'Completed'
}[value]||value);

const date=value=>value
  ? new Intl.DateTimeFormat('en-ZA',{
      timeZone:'Africa/Johannesburg',
      day:'numeric',
      month:'short'
    }).format(new Date(value+'T12:00:00+02:00'))
  : 'No due date';

function Workload({rows,selected,onSelect}){
  const [page,setPage]=useState(0);
  const count=Math.max(1,Math.ceil(rows.length/7));
  const safePage=Math.min(page,count-1);
  const shown=rows.slice(safePage*7,safePage*7+7);

  const peak=Math.max(1,...shown.map(row=>row.total));
  const x=index=>60+index*600/Math.max(1,shown.length-1);
  const y=value=>190-value/peak*148;

  const series=[
    {key:'total',label:'Open tasks',color:'#2186ed'},
    {key:'progress',label:'In progress',color:'#00afb9'},
    {key:'overdue',label:'Overdue',color:'#e56b7a'}
  ];

  return <>
    <div className="td-pc-chart-key">
      {series.map(item=>
        <span key={item.key}>
          <i style={{background:item.color}}/>
          {item.label}
        </span>
      )}
    </div>

    {!shown.length?(
      <p className="td-pc-empty">
        No employee workload to display.
      </p>
    ):(
      <div className="td-pc-chart-scroll">
        <svg
          viewBox="0 0 720 265"
          role="group"
          aria-label="Current open tasks by employee; select a point to filter task lists"
        >
          {[0,.5,1].map(step=>
            <g key={step}>
              <line
                x1="60"
                x2="670"
                y1={y(step*peak)}
                y2={y(step*peak)}
                stroke="currentColor"
                opacity=".12"
                strokeDasharray="3 5"
              />
              <text
                x="48"
                y={y(step*peak)+4}
                textAnchor="end"
              >
                {(step*peak).toFixed(peak%2?1:0)}
              </text>
            </g>
          )}

          {series.map(item=>
            <g key={item.key}>
              <path
                d={shown.map((row,index)=>
                  (index?'L':'M')+
                  x(index)+','+
                  y(row[item.key])
                ).join(' ')}
                fill="none"
                stroke={item.color}
                strokeWidth="3"
                strokeLinejoin="round"
              />

              {shown.map((row,index)=>{
                const label=
                  row.name+': '+
                  row[item.key]+' '+
                  item.label.toLowerCase();

                return (
                  <circle
                    key={row.id}
                    cx={x(index)}
                    cy={y(row[item.key])}
                    r={selected===row.id?6:4}
                    fill={item.color}
                    stroke="white"
                    strokeWidth="1.5"
                    role="button"
                    tabIndex="0"
                    aria-label={label}
                    onClick={()=>onSelect(
                      selected===row.id?'':row.id
                    )}
                    onKeyDown={event=>{
                      if(
                        event.key==='Enter'||
                        event.key===' '
                      ){
                        event.preventDefault();
                        onSelect(
                          selected===row.id?'':row.id
                        );
                      }
                    }}
                  >
                    <title>{label}</title>
                  </circle>
                );
              })}
            </g>
          )}

          {shown.map((row,index)=>{
            const words=row.name.split(' ');
            const middle=Math.ceil(words.length/2);

            return (
              <text
                key={row.id}
                x={x(index)}
                y="220"
                textAnchor="middle"
              >
                <tspan x={x(index)}>
                  {words.slice(0,middle).join(' ')}
                </tspan>
                <tspan x={x(index)} dy="15">
                  {words.slice(middle).join(' ')}
                </tspan>
              </text>
            );
          })}
        </svg>
      </div>
    )}

    <div className="td-pc-pager">
      <button
        type="button"
        disabled={safePage===0}
        onClick={()=>setPage(safePage-1)}
      >
        Previous
      </button>
      <span>
        {safePage+1} / {count}
        {' · '}{rows.length} employees / groups
      </span>
      <button
        type="button"
        disabled={safePage+1>=count}
        onClick={()=>setPage(safePage+1)}
      >
        Next
      </button>
    </div>

    <p className="td-pc-caption">
      Names correspond to current task counts.
      Select a point to filter the summary and task list.
      Unassigned work is shown separately.
    </p>
  </>;
}

export default function DesktopDashboard({
  employeeId,
  role='employee',
  displayName,
  name,
  workspace={},
  onView,
  onTask,
  onSearch,
  onOpenMenu,
  clock
}){
  const {
    data,error,loading,reload
  }=useDesktopDashboard(employeeId,role,workspace);

  const [filter,setFilter]=useState('all');
  const [person,setPerson]=useState('');
  const [tab,setTab]=useState('due');
  const [page,setPage]=useState(0);
  const [query,setQuery]=useState('');
  const [host,setHost]=useState(null);
  const [busy,setBusy]=useState('');
  const [actionError,setActionError]=useState('');

  useLayoutEffect(()=>{
    setHost(document.querySelector(
      '.view-overview .topbar-right'
    ));
  },[]);

  const model=useMemo(()=>desktopDashboardModel({
    tasks:data?.tasks||[],
    employees:data?.employees||[],
    userId:employeeId,
    role,
    filter,
    employeeId:person,
    now:data?.at||Date.now()
  }),[data,employeeId,role,filter,person]);

  const pages=Math.max(
    1,Math.ceil(model.sorted.length/6)
  );
  const currentPage=Math.min(page,pages-1);
  const summary=model.sorted.slice(
    currentPage*6,currentPage*6+6
  );

  const open=model.selected.filter(
    task=>task.status!=='done'
  );

  const todayTasks=open.filter(task=>
    tab==='all'
      ? true
      : tab==='important'
        ? task.priority==='high'
        : task.due_date&&task.due_date<=model.today
  );

  const shortcuts=[
    {id:'payslips',label:'Payslips',Icon:FileText},
    {id:'notices',label:'Notices',Icon:Megaphone},
    {id:'leave',label:'Shifts',Icon:CalendarDays}
  ];

  const nav=[
    {id:'overview',label:'Dashboard',Icon:LayoutDashboard},
    {id:'tasks',label:'Tasks',Icon:ListTodo},
    {id:'attendance',label:'Time & attendance',Icon:Clock3},
    {id:'leave',label:'Shifts & leave',Icon:CalendarDays},
    {id:'payslips',label:'Payslips',Icon:FileText},
    {id:'notices',label:'Notices',Icon:Megaphone},
    {id:'chat',label:'Internal chat',Icon:MessageCircle}
  ];

  function selectPerson(value){
    setPerson(value);
    setPage(0);
  }

  async function complete(task){
    setBusy(task.id);
    setActionError('');

    try{
      await onTask(task,'done');
      reload();
    }catch(failure){
      setActionError(
        failure.message||'Task could not be updated.'
      );
    }finally{
      setBusy('');
    }
  }

  const tools=(
    <div className="td-pc-header-tools">
      <form
        className="td-pc-search"
        role="search"
        onSubmit={event=>{
          event.preventDefault();
          onSearch(query.trim());
        }}
      >
        <Search size={17}/>
        <input
          aria-label="Search your workspace"
          placeholder="Search people, tasks, notices…"
          value={query}
          onChange={event=>setQuery(event.target.value)}
          maxLength={200}
        />
        <button
          type="submit"
          aria-label="Open Internal Search"
        >
          <ArrowRight size={16}/>
        </button>
      </form>

      <button
        type="button"
        className="td-pc-notification"
        aria-label="Open company activity"
        onClick={()=>onView('activity')}
      >
        <Bell size={18}/>
      </button>

      <div className="td-pc-profile-copy">
        <strong>{displayName||name}</strong>
        <span>{role}</span>
      </div>
    </div>
  );

  return (
    <section
      className="td-pc-dashboard"
      aria-label="Desktop dashboard"
    >
      {host?createPortal(tools,host):tools}

      <aside
        className="td-pc-sidebar"
        aria-label="Dashboard navigation"
      >
        <div className="td-pc-brand"><span className="td-pc-brand-globe"><TechDevGlobe /></span><img
          src={`${import.meta.env.BASE_URL}techdev-wordmark.png`}
          alt="TechDev Solutions"
        /></div>

        <button
          type="button"
          className="td-pc-create"
          onClick={()=>onView('tasks')}
        >
          <ListTodo size={17}/>
          {model.team?'Manage tasks':'Open my tasks'}
        </button>

        <nav>
          {nav.map(({id,label,Icon})=>
            <button
              type="button"
              key={id}
              className={id==='overview'?'is-active':''}
              aria-current={
                id==='overview'?'page':undefined
              }
              onClick={()=>
                id==='chat'
                  ? onView('suite','collaboration.chat')
                  : onView(id)
              }
            >
              <Icon size={17}/>
              {label}
            </button>
          )}
        </nav>

        <button
          type="button"
          className="td-pc-more"
          onClick={onOpenMenu}
        >
          <Menu size={18}/>
          Menu & workplace tools
        </button>

        <p>Empower your digital journey</p>
      </aside>

      <header className="td-pc-overview">
        <div>
          <h1>Overview</h1>
          <p>
            Welcome, {name}.{' '}
            {model.team
              ? 'Your team at a glance.'
              : 'Your work at a glance.'}
          </p>
        </div>

        <div className="td-pc-filter">
          <label>
            <span className="sr-only">Task period</span>
            <select
              value={filter}
              onChange={event=>{
                setFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">All tasks</option>
              <option value="week">
                Due in the next 7 days
              </option>
              <option value="overdue">
                Overdue tasks
              </option>
            </select>
          </label>

          <button
            type="button"
            onClick={reload}
            disabled={loading}
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={16}/>
          </button>
        </div>
      </header>

      {error&&(
        <p className="td-pc-error" role="alert">
          {error}{' '}
          <button type="button" onClick={reload}>
            Retry
          </button>
        </p>
      )}

      <div className="td-pc-stats">
        {[
          {
            label:model.team
              ? 'Visible tasks'
              : 'My tasks & open pool',
            value:model.total,
            Icon:ListTodo
          },
          {
            label:'Completed',
            value:model.done,
            Icon:CheckCheck
          },
          {
            label:'In progress',
            value:model.progress,
            Icon:Clock3
          },
          {
            label:'Overdue',
            value:model.overdue,
            Icon:CalendarDays
          }
        ].map(({label,value,Icon})=>
          <article key={label}>
            <span className="td-pc-stat-icon">
              <Icon size={19}/>
            </span>
            <p>{label}</p>
            <strong>{data?value:'—'}</strong>
            <small>
              {person
                ? 'Selected employee / group'
                : 'Current task snapshot'}
            </small>
          </article>
        )}
      </div>

      <div className="td-pc-clock">{clock}</div>

      <div className="td-pc-grid">
        <section className="td-pc-panel">
          <header>
            <div>
              <h2>Task summary</h2>
              <p>
                {data
                  ? model.total+' matching tasks'
                  : 'Loading tasks…'}
              </p>
            </div>

            <label>
              <span className="sr-only">
                Filter task owner
              </span>
              <select
                value={person}
                onChange={event=>
                  selectPerson(event.target.value)
                }
              >
                <option value="">
                  {model.team
                    ? 'All employees'
                    : 'All visible work'}
                </option>
                {model.workload.map(row=>
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                )}
              </select>
            </label>
          </header>

          <div className="td-pc-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Owner</th>
                  <th>Due date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(task=>
                  <tr key={task.id}>
                    <td>
                      <button
                        type="button"
                        onClick={()=>onView('tasks')}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td>
                      {model.nameFor(task.assignee_id)}
                    </td>
                    <td>{date(task.due_date)}</td>
                    <td>
                      <span className={
                        'td-pc-status status-'+task.status
                      }>
                        {statusName(task.status)}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data&&!summary.length&&(
            <p className="td-pc-empty">
              No tasks match these filters.
            </p>
          )}

          <div className="td-pc-pager">
            <button
              type="button"
              disabled={currentPage===0}
              onClick={()=>setPage(currentPage-1)}
            >
              Previous
            </button>
            <span>{currentPage+1} / {pages}</span>
            <button
              type="button"
              disabled={currentPage+1>=pages}
              onClick={()=>setPage(currentPage+1)}
            >
              Next
            </button>
          </div>
        </section>

        <section className="td-pc-panel td-pc-progress">
          <header>
            <h2>Overall progress</h2>
            <span>
              {person?'Selected owner':'Visible tasks'}
            </span>
          </header>

          <div className="td-pc-gauge">
            <svg
              viewBox="0 0 220 130"
              role="img"
              aria-label={
                data&&model.total
                  ? model.percent+' percent of tasks completed'
                  : 'No completion percentage available'
              }
            >
              <path
                d="M 20 110 A 90 90 0 0 1 200 110"
                pathLength="100"
                fill="none"
                stroke="var(--pc-track)"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M 20 110 A 90 90 0 0 1 200 110"
                pathLength="100"
                fill="none"
                stroke="#0daa7c"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${data&&model.total?model.percent:0} 100`}
              />
            </svg>
            <div>
              <strong>
                {data&&model.total?model.percent+'%':'—'}
              </strong>
              <span>Completed</span>
            </div>
          </div>

          <div className="td-pc-progress-totals">
            <span>
              <strong>{data?model.total:'—'}</strong>
              Total
            </span>
            <span>
              <strong>{data?model.done:'—'}</strong>
              Completed
            </span>
            <span>
              <strong>{data?model.progress:'—'}</strong>
              In progress
            </span>
            <span>
              <strong>{data?model.overdue:'—'}</strong>
              Overdue
            </span>
          </div>

          <p className="td-pc-caption">
            Completion is completed tasks divided by
            all matching tasks. Task statuses are current.
          </p>
        </section>

        <section className="td-pc-panel">
          <header>
            <h2>Today’s tasks</h2>
            <button
              type="button"
              onClick={()=>onView('tasks')}
            >
              View all <ArrowRight size={14}/>
            </button>
          </header>

          <div
            className="td-pc-tabs"
            role="group"
            aria-label="Task list filter"
          >
            {[
              ['due','Today & overdue'],
              ['all','All open'],
              ['important','High priority']
            ].map(([id,label])=>
              <button
                type="button"
                key={id}
                aria-pressed={tab===id}
                onClick={()=>setTab(id)}
              >
                {label}
              </button>
            )}
          </div>

          {actionError&&(
            <p role="alert">{actionError}</p>
          )}

          <div className="td-pc-today">
            {todayTasks.slice(0,6).map(task=>
              <article key={task.id}>
                <button
                  type="button"
                  className="td-pc-task-check"
                  aria-label={'Mark '+task.title+' complete'}
                  disabled={
                    Boolean(busy)||
                    (!model.team&&task.assignee_id!==employeeId)||
                    !onTask
                  }
                  onClick={()=>complete(task)}
                >
                  <Check size={14}/>
                </button>

                <button
                  type="button"
                  className="td-pc-task-title"
                  onClick={()=>onView('tasks')}
                >
                  {task.title}
                  <small>
                    {model.nameFor(task.assignee_id)}
                    {' · '}{date(task.due_date)}
                  </small>
                </button>

                <span className={
                  'td-pc-status status-'+task.status
                }>
                  {statusName(task.status)}
                </span>
              </article>
            )}
          </div>

          {data&&!todayTasks.length&&(
            <p className="td-pc-empty">
              No tasks match this view.
            </p>
          )}

          {todayTasks.length>6&&(
            <p className="td-pc-caption">
              Showing 6 of {todayTasks.length}.
              Open Tasks to view the rest.
            </p>
          )}
        </section>

        <section className="td-pc-panel">
          <header>
            <div>
              <h2>
                {model.team
                  ? 'Employee workload'
                  : 'My workload'}
              </h2>
              <p>Current open tasks by employee</p>
            </div>
            <BarChart3 size={19}/>
          </header>

          {data?(
            <Workload
              rows={model.workload}
              selected={person}
              onSelect={selectPerson}
            />
          ):(
            <p className="td-pc-empty">
              {error
                ? 'Workload unavailable.'
                : 'Loading workload…'}
            </p>
          )}
        </section>
      </div>

      <div className="td-pc-bottom">
        <DashboardWorkCycle
          employeeId={employeeId}
          refreshKey={workspace.timeEntries?.map(
            entry=>entry.id+':'+entry.clocked_out_at
          ).join('|')}
        />

        <section className="td-pc-panel">
          <header><h2>Workspace shortcuts</h2></header>

          <div className="td-pc-shortcuts">
            {shortcuts.map(({id,label,Icon})=>
              <button
                type="button"
                key={id}
                onClick={()=>onView(id)}
              >
                <Icon size={23}/>
                <span>{label}</span>
                <ArrowRight size={16}/>
              </button>
            )}
          </div>

          <h3>Latest notices</h3>

          {(workspace.announcements||[])
            .slice(0,3)
            .map(notice=>
              <button
                type="button"
                className="td-pc-notice"
                key={notice.id}
                onClick={()=>onView('notices')}
              >
                {notice.title}
                <ArrowRight size={14}/>
              </button>
            )
          }

          {!workspace.announcements?.length&&(
            <p className="td-pc-caption">
              No notices to show.
            </p>
          )}
        </section>
      </div>

      {data&&(
        <p className="td-pc-caption">
          Updated{' '}
          {new Intl.DateTimeFormat('en-ZA',{
            timeZone:'Africa/Johannesburg',
            hour:'2-digit',
            minute:'2-digit',
            hour12:false
          }).format(data.at)}
          {' '}SAST · Refreshes every minute while visible.
          Attendance settings remain available above.
        </p>
      )}
    </section>
  );
}
