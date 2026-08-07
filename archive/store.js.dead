import { v4 as uuid } from "uuid";

const now = () => new Date().toISOString();
const defaultIspId = uuid();

export const db = {
  isps: [
    {
      id: defaultIspId,
      name: "DemoNet DRC",
      location: "Kinshasa",
      contactPhone: "+243990000111",
      createdAt: now()
    }
  ],
  customers: [
    {
      id: uuid(),
      ispId: defaultIspId,
      fullName: "Demo Client",
      phone: "+243990000000",
      status: "active",
      createdAt: now()
    }
  ],
  plans: [
    {
      id: uuid(),
      ispId: defaultIspId,
      name: "Home 10 Mbps",
      priceUsd: 20,
      durationDays: 30,
      rateLimit: "10M/10M",
      createdAt: now()
    }
  ],
  subscriptions: [],
  invoices: [],
  payments: [],
  sessions: []
};
