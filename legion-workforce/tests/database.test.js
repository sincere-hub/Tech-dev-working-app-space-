import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const employee = "00000000-0000-0000-0000-000000000001";
const coworker = "00000000-0000-0000-0000-000000000002";
const manager = "00000000-0000-0000-0000-000000000003";
const survey = "10000000-0000-0000-0000-000000000001";
const privateRecord = "10000000-0000-0000-0000-000000000002";
const training = "10000000-0000-0000-0000-000000000003";
const archived = "10000000-0000-0000-0000-000000000004";
const task = "20000000-0000-0000-0000-000000000001";

test("Postgres schema and workforce permission checks", async t => {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users(id,email,raw_user_meta_data) values
      ('${employee}','employee@example.test','{"display_name":"Employee"}'),
      ('${coworker}','coworker@example.test','{"display_name":"Coworker"}'),
      ('${manager}','manager@example.test','{"display_name":"Manager"}');
  `);
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  async function as(user, operation) {
    return db.transaction(async tx => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      return operation(tx);
    });
  }
  const interact = (user, record, kind, body = "", value = null) => as(user, tx => tx.query("select * from public.submit_workplace_interaction($1,$2,$3,$4)", [record,kind,body,value]));
  try {
    await t.test("schema applies, reapplies and backfills existing accounts", async () => {
      await db.exec(schema); await db.exec(schema);
      assert.equal((await db.query("select count(*)::int as count from public.employees")).rows[0].count,3);
      await db.exec(`update public.employees set role='admin' where id='${manager}'`);
    });
    await db.exec(`
      insert into public.workplace_records(id,module_id,title,status,visibility,created_by) values
        ('${survey}','culture.surveys','I have the tools I need','published','company','${manager}'),
        ('${privateRecord}','people.feedback','Private feedback','open','private','${coworker}'),
        ('${training}','security.training','Security introduction','published','company','${manager}'),
        ('${archived}','culture.surveys','Closed survey','archived','company','${manager}');
      insert into public.tasks(id,title,assignee_id,created_by) values ('${task}','Review documentation','${employee}','${manager}');
      insert into public.payslips(employee_id,period_start,period_end,gross_pay,deductions) values ('${coworker}','2026-10-01','2026-10-31',1000,100);
    `);
    await t.test("clock-in retries reuse one open record; clock-out closes it", async () => {
      const clock = () => as(employee, tx => tx.query("select (public.clock_in()).id"));
      const first = await clock(), second = await clock(); assert.equal(first.rows[0].id, second.rows[0].id);
      const closed = await as(employee, tx => tx.query("select (public.clock_out()).clocked_out_at")); assert.ok(closed.rows[0].clocked_out_at);
    });
    await t.test("employees cannot elevate roles", async () => {
      const result = await as(employee, tx => tx.query("update public.employees set role='admin' where id=$1 returning role",[employee]));
      assert.equal(result.rows.length,0);
      assert.equal((await db.query("select role from public.employees where id=$1",[employee])).rows[0].role,"employee");
    });
    await t.test("employees cannot read coworker payslips or write time directly", async () => {
      assert.equal((await as(employee, tx => tx.query("select * from public.payslips"))).rows.length,0);
      await assert.rejects(as(employee, tx => tx.query("insert into public.time_entries(employee_id) values($1)",[employee])), /permission denied/i);
    });
    await t.test("employees update own task status but cannot rewrite task fields", async () => {
      const changed = await as(employee, tx => tx.query("update public.tasks set status='done' where id=$1 returning status",[task])); assert.equal(changed.rows[0].status,'done');
      await assert.rejects(as(employee, tx => tx.query("update public.tasks set title='Tampered' where id=$1",[task])), /only update.*status/i);
    });
    await t.test("survey responses update without duplicate rows", async () => {
      const first = await interact(employee,survey,'rating','Useful tools',4);
      const second = await interact(employee,survey,'rating','Updated answer',5);
      assert.equal(first.rows[0].id,second.rows[0].id); assert.equal(second.rows[0].value,5);
    });
    await t.test("survey responses are private to respondent and managers", async () => {
      assert.equal((await as(coworker, tx => tx.query("select * from public.workplace_interactions where kind='rating'"))).rows.length,0);
      assert.equal((await as(manager, tx => tx.query("select * from public.workplace_interactions where kind='rating'"))).rows.length,1);
    });
    await t.test("rating limits and closed records are enforced", async () => {
      await assert.rejects(interact(employee,survey,'rating','',6), /rating from 1 to 5/i);
      await assert.rejects(interact(employee,survey,'rating','',null), /rating from 1 to 5/i);
      await assert.rejects(interact(employee,archived,'rating','',3), /record is closed/i);
    });
    await t.test("private records cannot be accessed through the interaction RPC", async () => {
      await assert.rejects(interact(employee,privateRecord,'comment','I should not see this'), /Record unavailable/i);
    });
    await t.test("training completion is per employee and retry-safe", async () => {
      const first = await interact(employee,training,'completion'); const second = await interact(employee,training,'completion');
      assert.equal(first.rows[0].id,second.rows[0].id);
      await assert.rejects(interact(employee,survey,'completion'), /not a learning or onboarding/i);
    });
    await t.test("shared discussion is visible; empty replies and direct writes are denied", async () => {
      await interact(employee,training,'comment','A useful introduction');
      assert.equal((await as(coworker, tx => tx.query("select * from public.workplace_interactions where kind='comment'"))).rows.length,1);
      await assert.rejects(interact(employee,training,'comment','  '), /Reply cannot be empty/i);
      await assert.rejects(as(employee, tx => tx.query("insert into public.workplace_interactions(record_id,employee_id,kind) values($1,$2,'completion')",[training,coworker])), /permission denied/i);
    });
    await t.test("invalid response kinds are denied", async () => {
      await assert.rejects(interact(employee,training,'administrator'), /Invalid response type/i);
    });
    await t.test("native activity respects private survey responses and cannot be rewritten", async () => {
      const visible = await as(coworker, tx => tx.query("select * from public.workplace_records where module_id='collaboration.activity' and metadata->>'source_table'='workplace_interactions' and description='rating'"));
      assert.equal(visible.rows.length,0);
      const changed = await as(manager, tx => tx.query("update public.workplace_records set title='Forged' where module_id='collaboration.activity' returning id"));
      assert.equal(changed.rows.length,0);
    });
    await t.test("standalone upgrade can reapply to the existing schema", async () => {
      await db.exec(await readFile(new URL("../supabase/workplace-update.sql", import.meta.url),"utf8"));
      assert.equal((await as(employee, tx => tx.query("select * from public.workplace_interactions where kind='completion'"))).rows.length,1);
    });
  } finally { await db.close(); }
});
