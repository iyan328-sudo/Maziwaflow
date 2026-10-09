import { createContext, useContext, type ReactNode } from "react";

export type Role = "clerk" | "farmer" | "admin";

const RoleContext = createContext<Role | null>(null);

export function RoleProvider({ role, children }: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  const role = useContext(RoleContext);
  if (role === null) throw new Error("useRole must be used within RoleProvider");
  return role;
}
