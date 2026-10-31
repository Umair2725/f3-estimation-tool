"use client";

import { useState, useTransition } from "react";
import { can, ROLE_LABELS, ROLES, type Role } from "@/server/auth/permissions";
import {
  deactivateAction,
  inviteAction,
  reactivateAction,
  revokeInvitationAction,
  setRoleAction,
  type ActionResult,
} from "./actions";

type Person = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: "ACTIVE" | "DEACTIVATED";
  lastActive: string;
};

type Invitation = { email: string; role: Role };

const selectClass =
  "min-h-9 w-40 rounded-lg border border-border-strong bg-surface px-2.5 text-sm disabled:opacity-60";
const smallButton =
  "min-h-8 rounded-full border border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60";

export function PeopleManager(props: {
  currentUserId: string;
  people: Person[];
  invitations: Invitation[];
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Runs a server action and reports the result; returns whether it succeeded.
  function perform(action: () => Promise<ActionResult>, success?: string): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await action();
        if (result.ok) {
          setNotice(
            success || result.message ? { kind: "ok", text: result.message ?? success! } : null,
          );
        } else {
          setNotice({ kind: "err", text: result.message });
        }
        resolve(result.ok);
      });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite" className="empty:hidden">
        {notice && (
          <p
            role={notice.kind === "err" ? "alert" : "status"}
            className={`rounded-lg px-3.5 py-3 text-sm ${
              notice.kind === "err" ? "bg-err-bg text-err" : "bg-ok-bg text-ok"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      <section
        aria-labelledby="people-title"
        className="min-w-0 rounded-xl border border-border bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="people-title" className="text-lg font-bold">
            People
          </h2>
          <span className="text-sm text-muted">{props.people.length} total</span>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">Role</th>
                <th className="px-3 py-2.5 font-semibold">Can approve</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Last active</th>
                <th className="px-5 py-2.5 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {props.people.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  isSelf={person.id === props.currentUserId}
                  pending={pending}
                  perform={perform}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <InviteSection invitations={props.invitations} pending={pending} perform={perform} />
    </div>
  );
}

type Perform = (action: () => Promise<ActionResult>, success?: string) => Promise<boolean>;

function PersonRow(props: { person: Person; isSelf: boolean; pending: boolean; perform: Perform }) {
  const { person, perform, pending } = props;
  const [role, setRole] = useState<string>(person.role ?? "");
  const [confirming, setConfirming] = useState(false);
  const label = person.name || person.email;
  const active = person.status === "ACTIVE";

  async function changeRole(next: string) {
    const previous = role;
    setRole(next); // optimistic; reverted if the server refuses
    const ok = await perform(
      () => setRoleAction(person.id, next),
      `${label} is now ${ROLE_LABELS[next as Role]}.`,
    );
    if (!ok) setRole(previous);
  }

  return (
    <tr
      className="border-b border-border last:border-b-0"
      data-testid="person-row"
      data-email={person.email}
    >
      <td className="px-5 py-3">
        <div className="font-semibold">
          {person.name || "New sign-in"}
          {props.isSelf && <span className="font-normal text-muted"> (you)</span>}
        </div>
        <div className="text-muted">{person.email}</div>
      </td>
      <td className="px-3 py-3">
        <select
          className={selectClass}
          aria-label={`Role for ${label}`}
          value={role}
          disabled={pending}
          onChange={(e) => changeRole(e.target.value)}
        >
          {!role && <option value="">Choose a role…</option>}
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        {can(role as Role, "estimate.approve") ? (
          <span className="rounded-full bg-ok-bg px-2.5 py-0.5 text-xs font-semibold text-ok">
            Yes
          </span>
        ) : (
          <span className="text-muted">No</span>
        )}
      </td>
      <td className="px-3 py-3">
        {active ? (
          person.role ? (
            <span>Active</span>
          ) : (
            <span className="whitespace-nowrap rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn">
              Waiting for a role
            </span>
          )
        ) : (
          <span className="rounded-full bg-err-bg px-2.5 py-0.5 text-xs font-semibold text-err">
            Deactivated
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-muted">{person.lastActive}</td>
      <td className="px-5 py-3 text-right whitespace-nowrap">
        {!active ? (
          <button
            type="button"
            className={smallButton}
            disabled={pending}
            onClick={() =>
              perform(() => reactivateAction(person.id), `${label} can sign in again.`)
            }
          >
            Reactivate
          </button>
        ) : confirming ? (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              className="min-h-8 rounded-full bg-brand-strong px-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={pending}
              onClick={async () => {
                await perform(
                  () => deactivateAction(person.id),
                  `${label} is deactivated and signed out.`,
                );
                setConfirming(false);
              }}
            >
              Confirm deactivate
            </button>
            <button type="button" className={smallButton} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className={smallButton}
            disabled={pending}
            aria-label={`Deactivate ${label}`}
            onClick={() => setConfirming(true)}
          >
            Deactivate
          </button>
        )}
      </td>
    </tr>
  );
}

function InviteSection(props: { invitations: Invitation[]; pending: boolean; perform: Perform }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("ESTIMATOR");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (await props.perform(() => inviteAction(email, role))) setEmail("");
  }

  return (
    <section
      aria-labelledby="invite-title"
      className="min-w-0 rounded-xl border border-border bg-surface"
    >
      <div className="border-b border-border px-5 py-4">
        <h2 id="invite-title" className="text-lg font-bold">
          Invite
        </h2>
        <p className="mt-1 text-sm text-muted">
          Give a role to a @folio3.com address before the person signs in for the first time.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-5 py-4">
        <label className="flex min-w-0 flex-1 basis-60 flex-col gap-1 text-sm font-semibold">
          Email
          <input
            type="email"
            required
            placeholder="name@folio3.com"
            className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 font-normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Role
          <select
            className={`${selectClass} min-h-10 font-normal`}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={props.pending}
          className="min-h-10 rounded-full bg-brand-strong px-5 font-semibold text-white disabled:opacity-60"
        >
          Invite
        </button>
      </form>
      {props.invitations.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <h3 className="text-sm font-bold">Pending invitations</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {props.invitations.map((inv) => (
              <li key={inv.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="break-all">{inv.email}</span>
                <span className="text-muted">{ROLE_LABELS[inv.role]}</span>
                <button
                  type="button"
                  className={smallButton}
                  disabled={props.pending}
                  aria-label={`Cancel invitation for ${inv.email}`}
                  onClick={() =>
                    props.perform(() => revokeInvitationAction(inv.email), "Invitation cancelled.")
                  }
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
