import { IconAntenna, IconPeople, IconUserCheck, IconZap } from "../icons.jsx";

/**
 * Short MikroTik onboarding strip for ISP operators.
 */
export default function NetworkHappyPath({ t, hasDefaultNode, lastProvisionOk, freeradiusEnabled }) {
  const steps = [
    {
      n: 1,
      label: t("Ajouter un noeud", "Add a node"),
      done: hasDefaultNode,
      Icon: IconAntenna
    },
    {
      n: 2,
      label: t("Noeud par defaut", "Set default"),
      done: hasDefaultNode,
      Icon: IconUserCheck
    },
    {
      n: 3,
      label: t("Activer un abonne", "Activate subscriber"),
      done: lastProvisionOk === true,
      Icon: IconPeople
    },
    {
      n: 4,
      label: t("Acces en ligne", "Access online"),
      done: lastProvisionOk === true,
      Icon: IconZap
    }
  ];

  return (
    <div className="panel network-happy-path" style={{ marginBottom: 12 }}>
      <h2 style={{ marginBottom: 8 }}>{t("Mise en service", "Quick setup")}</h2>
      <p className="app-meta" style={{ marginBottom: 12 }}>
        {t(
          "Noeud MikroTik → defaut → activer abonnement → identifiants.",
          "MikroTik node → default → activate subscription → credentials."
        )}
      </p>
      <ol
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
          listStyle: "none",
          padding: 0,
          margin: 0
        }}
      >
        {steps.map((s) => {
          const Icon = s.Icon;
          return (
            <li
              key={s.n}
              style={{
                border: "1px solid var(--border, #2a3540)",
                borderRadius: 12,
                padding: "10px 12px",
                opacity: s.done ? 1 : 0.75,
                background: s.done ? "rgba(16,185,129,0.08)" : "transparent"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon width={18} height={18} />
                <strong style={{ fontSize: 13 }}>
                  {s.n}. {s.label}
                </strong>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="app-meta" style={{ marginTop: 12 }}>
        FreeRADIUS:{" "}
        {freeradiusEnabled
          ? t("actif", "enabled")
          : t("desactive (FREERADIUS_SYNC_ENABLED)", "off (FREERADIUS_SYNC_ENABLED)")}
        .{" "}
        {t(
          "Activez le flag serveur puis testez Auth-Type.",
          "Enable the server flag, then test Auth-Type."
        )}
      </p>
    </div>
  );
}
