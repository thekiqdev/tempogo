import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { transaction } from "../../apps/api/src/db.js";
import { migrate } from "../../apps/api/src/migrations.js";
import type { PlatformOptions } from "../../apps/api/src/platform.js";
import { deliverInvitations } from "../../apps/api/src/platform-management.js";
import { csrfFor, digest, token } from "../../apps/api/src/security.js";

test("SA03: organizações, convites, outbox, isolamento e suspensão", async (t) => {
  const original = process.env.TEST_DATABASE_URL;
  assert.ok(original && new URL(original).pathname.endsWith("_test"));
  const name = "cc_sa03_" + randomUUID().replaceAll("-", "") + "_test",
    admin = new pg.Pool({ connectionString: original });
  await admin.query('CREATE DATABASE "' + name + '"');
  const url = new URL(original);
  url.pathname = "/" + name;
  const db = new pg.Pool({ connectionString: url.href }),
    tenant = new pg.Pool({ connectionString: url.href, options: "-c role=cronocheckpoint_app" }),
    platform = new pg.Pool({
      connectionString: url.href,
      options: "-c role=cronocheckpoint_platform",
    });
  await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
  const actor = (
    await db.query("INSERT INTO app.users(email) VALUES('platform@sa03.test') RETURNING id")
  ).rows[0].id;
  await db.query("INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'active')", [actor]);
  const raw = token();
  await db.query(
    "INSERT INTO app.platform_sessions(token_hash,user_id,auth_version,expires_at,reauthenticated_until) VALUES($1,$2,0,now()+interval '1 hour',now()+interval '5 minutes')",
    [digest(raw), actor],
  );
  const origin = "http://127.0.0.1:5173",
    sent: { email: string; raw: string }[] = [];
  let smtpFails = false;
  const options: PlatformOptions = {
    pool: platform,
    key: "ca".repeat(32),
    origin,
    secure: false,
    sendMail: async (email, raw, kind) => {
      if (kind === "invitation") {
        if (smtpFails) throw new Error("simulated SMTP outage");
        sent.push({ email, raw });
      }
    },
  };
  const app = buildApp(async () => {}, false, {
    pool: tenant,
    origin,
    secure: false,
    sendReset: async () => {},
    platform: options,
  });
  const call = (
    path: string,
    body?: unknown,
    key = randomUUID(),
    method = "POST",
    cookie = "cc_platform_session=" + raw,
  ) =>
    app.inject({
      method: body === undefined ? "GET" : (method as "POST"),
      url: "/api/v1/platform" + path,
      headers: { origin, cookie, "x-csrf-token": csrfFor(raw), "idempotency-key": key },
      payload: body,
    });
  let org: any,
    invite: any,
    ownerId: string,
    credential: string,
    checkpointRaw: string,
    firstToken: string;
  const ownerEmail = "owner@sa03.test",
    password = "SA03-owner-password-123";
  try {
    await t.test(
      "criação com sessão autenticada, idempotência e cadastro pendente atômico",
      async () => {
        const body = {
          name: "Corrida SA03",
          contact_email: ownerEmail,
          responsible_email: ownerEmail,
        };
        assert.equal(
          (await call("/organizations", body, randomUUID(), "POST", "")).statusCode,
          401,
        );
        await db.query("UPDATE app.platform_sessions SET reauthenticated_until=NULL");
        const key = randomUUID();
        const r = await call("/organizations", body, key);
        assert.equal(r.statusCode, 201, r.body);
        org = r.json().organization;
        assert.equal(
          (
            await call(
              "/organizations/" + org.id,
              { name: "Alteração bloqueada", contact_email: ownerEmail, version: org.version },
              randomUUID(),
              "PATCH",
            )
          ).statusCode,
          403,
        );
        await db.query(
          "UPDATE app.platform_sessions SET reauthenticated_until=now()+interval '5 minutes'",
        );
        invite = r.json().invitation;
        assert.equal(org.status, "pending");
        assert.equal((await call("/organizations", body, key)).json().organization.id, org.id);
        assert.equal(
          (await call("/organizations", { ...body, name: "Different" }, key)).statusCode,
          409,
        );
        assert.equal(
          (await db.query("SELECT count(*)::int n FROM app.organizations")).rows[0].n,
          1,
        );
      },
    );
    await t.test("falha SMTP preserva convite, reenvio invalida token anterior", async () => {
      smtpFails = true;
      await deliverInvitations(options);
      assert.equal(
        (await db.query("SELECT delivery_status FROM app.invitation_outbox")).rows[0]
          .delivery_status,
        "pending",
      );
      smtpFails = false;
      await db.query("UPDATE app.invitation_outbox SET next_attempt_at=now()");
      await deliverInvitations(options);
      firstToken = sent.at(-1)!.raw;
      assert.equal((await call("/invitations/inspect", { token: firstToken })).statusCode, 200);
      assert.equal(
        (await call("/invitations/" + invite.id + "/resend", { version: 0 })).statusCode,
        200,
      );
      assert.equal(
        (await call("/invitations/accept", { token: firstToken, password })).statusCode,
        410,
      );
      await deliverInvitations(options);
      firstToken = sent.at(-1)!.raw;
    });
    await t.test(
      "aceite único ativa organização e responsável; senha não muda ao reutilizar identidade",
      async () => {
        const results = await Promise.all([
          call("/invitations/accept", { token: firstToken, password }),
          call("/invitations/accept", { token: firstToken, password }),
        ]);
        assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 410]);
        org = (await call("/organizations/" + org.id)).json().organization;
        ownerId = org.responsible_user_id;
        assert.equal(org.status, "active");
        assert.ok(ownerId);
        const hash = (await db.query("SELECT password_hash FROM app.users WHERE id=$1", [ownerId]))
          .rows[0].password_hash;
        const r = await call("/invitations", {
          kind: "organization_admin",
          organization_id: org.id,
          email: ownerEmail,
        });
        assert.equal(r.statusCode, 201, r.body);
        await deliverInvitations(options);
        const rawInvite = sent.at(-1)!.raw;
        assert.equal(
          (await call("/invitations/accept", { token: rawInvite, password: "wrong" })).statusCode,
          401,
        );
        assert.equal(
          (await call("/invitations/accept", { token: rawInvite, password })).statusCode,
          200,
        );
        assert.equal(
          (await db.query("SELECT password_hash FROM app.users WHERE id=$1", [ownerId])).rows[0]
            .password_hash,
          hash,
        );
      },
    );
    await t.test(
      "login organizacional, isolamento, conflito de versão e indicação da prova ativa",
      async () => {
        const r = await app.inject({
          method: "POST",
          url: "/api/v1/auth/admin/login",
          headers: { origin },
          payload: { email: ownerEmail, password },
        });
        assert.equal(r.statusCode, 200, r.body);
        const cookie = r.cookies.find((c) => c.name === "cc_session")!;
        assert.equal(
          (
            await call(
              "/organizations",
              undefined,
              randomUUID(),
              "GET",
              "cc_session=" + cookie.value,
            )
          ).statusCode,
          401,
        );
        const event = (
          await db.query(
            "INSERT INTO app.events(organization_id,name,local_date,timezone,state,created_by) VALUES($1,'Race',CURRENT_DATE,'UTC','running',$2) RETURNING id",
            [org.id, ownerId],
          )
        ).rows[0].id;
        const cat = (
          await db.query(
            "INSERT INTO app.race_categories(organization_id,event_id,name) VALUES($1,$2,'5k') RETURNING id",
            [org.id, event],
          )
        ).rows[0].id;
        const cp = (
          await db.query(
            "INSERT INTO app.checkpoints(organization_id,event_id,race_category_id,name,kind,sequence) VALUES($1,$2,$3,'Finish','finish',1) RETURNING id",
            [org.id, event, cat],
          )
        ).rows[0].id;
        credential = (
          await db.query(
            "INSERT INTO app.checkpoint_credentials(organization_id,event_id,checkpoint_id,code,password_hash,label,expires_at) VALUES($1,$2,$3,'ABCDEF12','disabled','Test',now()+interval '1 hour') RETURNING id",
            [org.id, event, cp],
          )
        ).rows[0].id;
        checkpointRaw = token();
        await db.query(
          "INSERT INTO app.checkpoint_sessions(token_hash,organization_id,event_id,checkpoint_id,credential_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",
          [digest(checkpointRaw), org.id, event, cp, credential],
        );
        const body = {
          version: org.version,
          to: "suspended",
          reason: "Teste de suspensão de organização",
          acknowledge_running_events: false,
        };
        assert.equal(
          (await call("/organizations/" + org.id + "/transitions", body)).json().error.code,
          "RUNNING_EVENTS_CONFIRMATION_REQUIRED",
        );
        assert.equal(
          (
            await call("/organizations/" + org.id + "/transitions", {
              ...body,
              version: 999,
              acknowledge_running_events: true,
            })
          ).statusCode,
          409,
        );
      },
    );
    await t.test(
      "suspensão aguarda operação em andamento, bloqueia seguinte e revoga acessos",
      async () => {
        let release!: () => void;
        let started!: () => void;
        const ready = new Promise<void>((r) => (started = r)),
          gate = new Promise<void>((r) => (release = r));
        const active = transaction(
          tenant,
          async () => {
            started();
            await gate;
          },
          org.id,
        );
        await ready;
        let finished = false;
        const pending = call("/organizations/" + org.id + "/transitions", {
          version: org.version,
          to: "suspended",
          reason: "Teste transacional de suspensão",
          acknowledge_running_events: true,
        }).then((r) => {
          finished = true;
          return r;
        });
        await new Promise((r) => setTimeout(r, 100));
        assert.equal(finished, false);
        release();
        await active;
        const r = await pending;
        assert.equal(r.statusCode, 200, r.body);
        org = r.json().organization;
        await assert.rejects(transaction(tenant, async () => {}, org.id));
        assert.ok(
          (
            await db.query("SELECT revoked_at FROM app.checkpoint_credentials WHERE id=$1", [
              credential,
            ])
          ).rows[0].revoked_at,
        );
        const field = await app.inject({
          url: "/api/v1/field/me",
          headers: { cookie: "cc_checkpoint=" + checkpointRaw },
        });
        assert.equal(field.statusCode, 401);
        assert.equal(
          (
            await db.query("SELECT count(*)::int n FROM app.events WHERE organization_id=$1", [
              org.id,
            ])
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test("reativação não ressuscita códigos e encerramento é terminal", async () => {
      let r = await call("/organizations/" + org.id + "/transitions", {
        version: org.version,
        to: "active",
        reason: "Retomar operação após conferência",
        acknowledge_running_events: true,
      });
      assert.equal(r.statusCode, 200, r.body);
      org = r.json().organization;
      assert.ok(
        (
          await db.query("SELECT revoked_at FROM app.checkpoint_credentials WHERE id=$1", [
            credential,
          ])
        ).rows[0].revoked_at,
      );
      r = await call("/organizations/" + org.id + "/transitions", {
        version: org.version,
        to: "closed",
        reason: "Encerrar organização de teste",
        acknowledge_running_events: true,
      });
      assert.equal(r.statusCode, 200, r.body);
      org = r.json().organization;
      assert.equal(
        (
          await call("/invitations", {
            kind: "organization_admin",
            organization_id: org.id,
            email: "other@sa03.test",
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await call("/organizations/" + org.id + "/transitions", {
            version: org.version,
            to: "active",
            reason: "Tentativa inválida de retorno",
            acknowledge_running_events: true,
          })
        ).statusCode,
        409,
      );
    });
    await t.test("paginação e auditoria sem token nem senha", async () => {
      assert.equal((await call("/organizations?cursor=invalid")).statusCode, 422);
      const history = JSON.stringify((await db.query("SELECT * FROM app.platform_audit")).rows);
      assert.ok(!history.includes(password));
      assert.ok(!history.includes(firstToken));
      assert.equal(
        (await platform.query("SELECT count(*)::int n FROM app.observations")).rows[0].n,
        0,
      );
    });
  } finally {
    await app.close();
    await Promise.all([db.end(), tenant.end(), platform.end()]);
    await admin.query('DROP DATABASE "' + name + '"');
    await admin.end();
  }
});
