export type Job = {
  id: string;
  name: string;
  description: string;
  reward: number;
  cooldownMs: number;
  role?: 'Businessman' | 'Mafia' | 'Hitman';
};

export const JOB_CATALOG: Job[] = [
  { id: 'taxi-driver', name: 'Taxi Driver', description: 'Drive passengers through the city.', reward: 2500, cooldownMs: 60_000 },
  { id: 'delivery-driver', name: 'Delivery Driver', description: 'Handle urban courier routes.', reward: 3100, cooldownMs: 75_000 },
  { id: 'courier', name: 'Courier', description: 'Deliver packages and documents.', reward: 2900, cooldownMs: 70_000 },
  { id: 'construction-worker', name: 'Construction Worker', description: 'Do hard labor on active jobs.', reward: 3700, cooldownMs: 90_000 },
  { id: 'programmer', name: 'Programmer', description: 'Write code for startups and contractors.', reward: 5200, cooldownMs: 120_000 },
  { id: 'office-worker', name: 'Office Worker', description: 'Stay productive under deadlines.', reward: 4100, cooldownMs: 110_000 },
  { id: 'mechanic', name: 'Mechanic', description: 'Repair and tune vehicles.', reward: 4800, cooldownMs: 120_000 },
  { id: 'truck-driver', name: 'Truck Driver', description: 'Transport freight across city lines.', reward: 5400, cooldownMs: 140_000 },
  { id: 'broker', name: 'Broker', description: 'Handle deals and opportunistic transactions.', reward: 6100, cooldownMs: 150_000 },
  { id: 'retail-manager', name: 'Retail Manager', description: 'Oversee sales and store performance.', reward: 4700, cooldownMs: 120_000 },
  { id: 'lab-assistant', name: 'Lab Assistant', description: 'Support research and tech teams.', reward: 5300, cooldownMs: 135_000 },
  { id: 'designer', name: 'Designer', description: 'Handle branding and visual design.', reward: 4800, cooldownMs: 120_000 },
  { id: 'photographer', name: 'Photographer', description: 'Capture content for local marketing crews.', reward: 4400, cooldownMs: 110_000 },
  { id: 'event-worker', name: 'Event Worker', description: 'Manage clients, crews, and incoming opportunities.', reward: 5000, cooldownMs: 130_000 }
];

export function getJobByName(name: string): Job | undefined {
  return JOB_CATALOG.find(job => job.name.toLowerCase() === name.toLowerCase());
}
