
import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopDashboardModel} from '../src/lib/desktopDashboardModel.js';

const now=Date.parse('2026-11-27T12:00:00+02:00');

const employees=[
  {id:'a',display_name:'Employee A'},
  {id:'b',display_name:'Employee B'},
  {id:'c',display_name:'Employee C'}
];

const tasks=[
  {
    id:'1',title:'One',assignee_id:'a',
    status:'todo',due_date:'2026-11-26'
  },
  {
    id:'2',title:'Two',assignee_id:'a',
    status:'in_progress',due_date:'2026-11-27'
  },
  {
    id:'3',title:'Three',assignee_id:'b',
    status:'done',due_date:'2026-11-28'
  },
  {
    id:'4',title:'Pool',assignee_id:null,
    status:'todo',due_date:null
  }
];

const run=(options={})=>desktopDashboardModel({
  tasks,employees,userId:'a',role:'admin',now,...options
});

test('task metrics reflect actual statuses',()=>{
  const model=run();
  assert.equal(model.total,4);
  assert.equal(model.done,1);
  assert.equal(model.percent,25);
  assert.equal(model.progress,1);
  assert.equal(model.overdue,1);
  assert.equal(
    model.workload.find(row=>row.id==='a').total,2
  );
  assert.equal(
    model.workload.find(row=>row.id==='b').total,0
  );
});

test('employees see own work and unassigned pool',()=>{
  const model=run({role:'employee'});
  assert.equal(model.total,3);
  assert.deepEqual(
    model.workload.map(row=>row.id),
    ['a','unassigned']
  );
  assert.ok(!model.selected.some(
    row=>row.assignee_id==='b'
  ));
});

test('graph selection filters task totals',()=>{
  const model=run({employeeId:'b'});
  assert.equal(model.total,1);
  assert.equal(model.percent,100);
  assert.equal(model.nameFor('b'),'Employee B');
});

test('due dates use South African calendar dates',()=>{
  const model=run({filter:'week'});
  assert.deepEqual(
    model.selected.map(row=>row.id),
    ['2','3']
  );
  assert.equal(
    run({filter:'overdue'}).selected[0].id,
    '1'
  );
});

test('empty task list has no completion percentage',()=>{
  const model=run({tasks:[]});
  assert.equal(model.percent,null);
  assert.equal(model.workload.length,3);
  assert.ok(model.workload.every(row=>row.total===0));
});

test('unassigned work has its own selection',()=>{
  const model=run({employeeId:'unassigned'});
  assert.equal(model.total,1);
  assert.equal(model.nameFor(null),'Unassigned');
});
