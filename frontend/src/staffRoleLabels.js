function humanizeRoleKey(role) {
  if (role == null || role === "") return "";
  const s = String(role).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatStaffRole(role, isEn) {
  const fr = {
    system_owner: "Propriétaire plateforme",
    super_admin: "Super administrateur",
    company_manager: "Directeur d'entreprise",
    isp_admin: "Administrateur FAI",
    billing_agent: "Agent facturation",
    noc_operator: "Opérateur réseau (NOC)",
    field_agent: "Agent terrain"
  };
  const en = {
    system_owner: "Platform owner",
    super_admin: "Super administrator",
    company_manager: "Company manager",
    isp_admin: "ISP administrator",
    billing_agent: "Billing agent",
    noc_operator: "NOC operator",
    field_agent: "Field agent"
  };
  return (isEn ? en : fr)[role] || humanizeRoleKey(role);
}
