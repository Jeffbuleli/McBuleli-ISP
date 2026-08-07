import { IconAntenna, IconPeople, IconUserCheck, IconZap } from "../icons.jsx";

/**
 * Compact MikroTik setup strip — SVG steps, minimal copy.
 */
export default function NetworkHappyPath({ t, hasDefaultNode, lastProvisionOk, freeradiusEnabled }) {
  const steps = [
    {
      n: 1,
      label: t("Noeud", "Node"),
      done: hasDefaultNode,
      Icon: IconAntenna
    },
    {
      n: 2,
      label: t("Defaut", "Default"),
      done: hasDefaultNode,
      Icon: IconUserCheck
    },
    {
      n: 3,
      label: t("Abonne", "Subscriber"),
      done: lastProvisionOk === true,
      Icon: IconPeople
    },
    {
      n: 4,
      label: t("En ligne", "Online"),
      done: lastProvisionOk === true,
      Icon: IconZap
    }
  ];

  return (
    <div className="panel network-happy-path">
      <div className="network-happy-path__head">
        <h2>{t("Mise en service", "Quick setup")}</h2>
        <span className={`network-happy-path__badge${freeradiusEnabled ? " is-on" : ""}`}>
          RADIUS {freeradiusEnabled ? t("on", "on") : t("off", "off")}
        </span>
      </div>
      <ol className="network-happy-path__steps">
        {steps.map((s) => {
          const Icon = s.Icon;
          return (
            <li key={s.n} className={`network-happy-path__step${s.done ? " is-done" : ""}`}>
              <Icon width={18} height={18} />
              <strong>
                {s.n}. {s.label}
              </strong>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
