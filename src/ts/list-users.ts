import type { WorkOS } from "@workos-inc/node";

export interface EnrichedUser {
  email: string;
  firstName: string | null;
  lastName: string | null;
  everSignedIn: boolean;
  lastSignInAt: string | null;
  organizations: string[];
  createdAt: string;
}

export async function fetchAllUsers(workos: WorkOS): Promise<EnrichedUser[]> {
  const [usersPage, orgsPage] = await Promise.all([
    workos.userManagement.listUsers(),
    workos.organizations.listOrganizations(),
  ]);

  const [users, orgs] = await Promise.all([
    usersPage.autoPagination(),
    orgsPage.autoPagination(),
  ]);

  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  const enriched: EnrichedUser[] = await Promise.all(
    users.map(async (user) => {
      const membershipsPage =
        await workos.userManagement.listOrganizationMemberships({
          userId: user.id,
        });
      const memberships = await membershipsPage.autoPagination();

      const orgNames = memberships.map(
        (m) => orgNameById.get(m.organizationId) ?? m.organizationId,
      );

      return {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        everSignedIn: user.lastSignInAt !== null,
        lastSignInAt: user.lastSignInAt,
        organizations: orgNames,
        createdAt: user.createdAt,
      };
    }),
  );

  return enriched;
}

export type Format = "json" | "csv" | "table";

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function formatCsv(users: EnrichedUser[]): string {
  const header = [
    "email",
    "firstName",
    "lastName",
    "everSignedIn",
    "lastSignInAt",
    "organizations",
    "createdAt",
  ];
  const rows = users.map((u) =>
    [
      u.email,
      u.firstName ?? "",
      u.lastName ?? "",
      String(u.everSignedIn),
      u.lastSignInAt ?? "",
      u.organizations.join("; "),
      u.createdAt,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function formatTable(users: EnrichedUser[]): string {
  const rows = users.map((u) => ({
    Email: u.email,
    Name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "-",
    "Signed In?": u.everSignedIn ? "Yes" : "No",
    "Last Sign-In": u.lastSignInAt
      ? new Date(u.lastSignInAt).toLocaleDateString()
      : "-",
    Organizations: u.organizations.join(", ") || "-",
    Created: new Date(u.createdAt).toLocaleDateString(),
  }));

  const cols = Object.keys(rows[0] ?? {}) as (keyof (typeof rows)[0])[];
  const widths = cols.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col]).length)),
  );

  const sep = widths.map((w) => "-".repeat(w)).join("--+-");
  const headerLine = cols.map((c, i) => c.padEnd(widths[i])).join("  | ");
  const dataLines = rows.map((r) =>
    cols.map((c, i) => String(r[c]).padEnd(widths[i])).join("  | "),
  );

  return [headerLine, sep, ...dataLines].join("\n");
}

export function printUsers(users: EnrichedUser[], format: Format): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(users, null, 2));
      break;
    case "csv":
      console.log(formatCsv(users));
      break;
    case "table":
      console.log(formatTable(users));
      break;
  }
}
